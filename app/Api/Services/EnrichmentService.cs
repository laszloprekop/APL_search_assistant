using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using AngleSharp.Html.Parser;
using Api.Models;
using DnsClient;

namespace Api.Services;

public record ContactHit(ContactType Type, string Value, Confidence Confidence, string? SourceUrl = null);
public record WebsiteEnrichment(bool Ok, string? SiteText, List<ContactHit> Contacts, string? Error);

/// <summary>
/// Cautious public-website enrichment (PRD §6.2): fetch the company site, pull a contact
/// email + switchboard phone and the visible text. Polite (per-host throttle, sane UA,
/// timeout) and degradeable — any failure returns Ok=false so the caller flags
/// needs_manual_lookup. allabolag.se is intentionally NOT auto-fetched (Cloudflare; PRD §11).
/// </summary>
public class EnrichmentService
{
    private readonly HttpClient _http;
    private readonly ILogger<EnrichmentService> _log;
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastFetch = new();
    private static readonly HtmlParser Parser = new();

    private static readonly Regex EmailRe =
        new(@"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex PhoneRe =
        new(@"(?:\+46|0)[\d\s\-()]{6,13}\d", RegexOptions.Compiled);
    private static readonly string[] EmailBlocklist =
        { "sentry", "wixpress", "example.", "your-email", "email@", "@sentry", ".png", ".jpg" };

    public EnrichmentService(HttpClient http, ILogger<EnrichmentService> log)
    {
        _http = http;
        _log = log;
    }

    // The mail domain for generic-address guessing: the website host minus a leading "www.".
    public static string? MailDomain(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return null;
        var h = u.Host.ToLowerInvariant();
        return h.StartsWith("www.") ? h[4..] : h;
    }

    // Cheap sanity gate for guessed addresses (phone-first, PRD §6.2): does the domain publish
    // MX records, i.e. can it receive mail at all? Doesn't confirm a specific mailbox exists —
    // guessed addresses stay low-confidence and out of the ≥15 list. Fails closed (no MX → no guess).
    public async Task<bool> DomainAcceptsMailAsync(string domain)
    {
        try
        {
            var lookup = new LookupClient(new LookupClientOptions { Timeout = TimeSpan.FromSeconds(3), UseCache = true, Retries = 1 });
            var res = await lookup.QueryAsync(domain, QueryType.MX);
            return res.Answers.MxRecords().Any(mx => !string.IsNullOrWhiteSpace(mx.Exchange?.Value));
        }
        catch (Exception e)
        {
            _log.LogDebug(e, "MX lookup failed for {Domain}", domain);
            return false;
        }
    }

    public async Task<WebsiteEnrichment> EnrichWebsiteAsync(string url)
    {
        try
        {
            var home = await FetchAsync(url);
            if (home is null) return new(false, null, new(), "Could not fetch the site.");

            var hits = ExtractContacts(home.Value.Html, url);
            var texts = new List<string> { ExtractText(home.Value.Html) ?? "" };

            // Swedish SMEs hide emails on contact / about / team pages, not the homepage. Follow
            // the on-site links that look like those pages (capped + throttled) and pool their
            // text too, so person-attribution can match a name sitting next to an email.
            foreach (var sub in FindContactLinks(home.Value.Html, url, 3))
            {
                var cp = await FetchAsync(sub);
                if (cp is null) continue;
                hits.AddRange(ExtractContacts(cp.Value.Html, sub));
                var t = ExtractText(cp.Value.Html);
                if (!string.IsNullOrEmpty(t)) texts.Add(t!);
            }

            hits = Dedupe(hits);
            var siteText = string.Join("\n", texts.Where(t => t.Length > 0));
            if (siteText.Length > 8000) siteText = siteText[..8000];
            var ok = hits.Count > 0 || siteText.Length > 0;
            return new(ok, siteText.Length == 0 ? null : siteText, hits, null);
        }
        catch (Exception e)
        {
            _log.LogWarning("Enrichment failed for {Url}: {Msg}", url, e.Message);
            return new(false, null, new(), e.Message);
        }
    }

    /// <summary>Single-page scrape (no sub-crawl) — used by the per-person search fallback so
    /// fetching a bio/team page found via search doesn't fan out into another full crawl.</summary>
    public async Task<WebsiteEnrichment> ScrapePageAsync(string url)
    {
        try
        {
            var page = await FetchAsync(url);
            if (page is null) return new(false, null, new(), "Could not fetch the page.");
            var hits = Dedupe(ExtractContacts(page.Value.Html, url));
            return new(true, ExtractText(page.Value.Html), hits, null);
        }
        catch (Exception e)
        {
            _log.LogWarning("Page scrape failed for {Url}: {Msg}", url, e.Message);
            return new(false, null, new(), e.Message);
        }
    }

    private async Task<(string Html, string BaseUrl)?> FetchAsync(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        await ThrottleAsync(uri.Host);
        using var res = await _http.GetAsync(uri);
        if (!res.IsSuccessStatusCode) return null;
        var html = await res.Content.ReadAsStringAsync();
        if (html.Length > 500_000) html = html[..500_000];
        return (html, uri.GetLeftPart(UriPartial.Authority));
    }

    private static async Task ThrottleAsync(string host)
    {
        if (LastFetch.TryGetValue(host, out var last))
        {
            var wait = TimeSpan.FromMilliseconds(1500) - (DateTimeOffset.UtcNow - last);
            if (wait > TimeSpan.Zero) await Task.Delay(wait);
        }
        LastFetch[host] = DateTimeOffset.UtcNow;
    }

    private static List<ContactHit> ExtractContacts(string html, string sourceUrl)
    {
        var doc = Parser.ParseDocument(html);
        var hits = new List<ContactHit>();

        // mailto: / tel: links are high-confidence.
        foreach (var a in doc.QuerySelectorAll("a[href]"))
        {
            var href = a.GetAttribute("href") ?? "";
            if (href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                var v = Clean(href[7..].Split('?')[0]);
                if (IsEmail(v)) hits.Add(new(ContactType.Email, v.ToLowerInvariant(), Confidence.High, sourceUrl));
            }
            else if (href.StartsWith("tel:", StringComparison.OrdinalIgnoreCase))
            {
                var v = Clean(href[4..]);
                if (v.Any(char.IsDigit)) hits.Add(new(ContactType.Phone, v, Confidence.High, sourceUrl));
            }
        }

        // Free-text scan is medium-confidence. Use tag-separated text so adjacent elements
        // don't concatenate into garbage tokens (e.g. "Stockholm"+"info@x.se" -> "Stockholminfo@x.se").
        var text = HtmlToText(html);
        foreach (Match m in EmailRe.Matches(text))
            if (IsEmail(m.Value)) hits.Add(new(ContactType.Email, m.Value.ToLowerInvariant(), Confidence.Medium, sourceUrl));
        foreach (Match m in PhoneRe.Matches(text))
        {
            var v = Clean(m.Value);
            var digits = v.Count(char.IsDigit);
            if (digits is >= 8 and <= 12) hits.Add(new(ContactType.Phone, v, Confidence.Medium, sourceUrl));
        }

        return hits;
    }

    private static string? ExtractText(string html)
    {
        var t = HtmlToText(html);
        return t.Length == 0 ? null : (t.Length > 2000 ? t[..2000] : t);
    }

    // Strip script/style, replace tags with spaces, decode entities, collapse whitespace.
    private static string HtmlToText(string html)
    {
        var noScript = Regex.Replace(html, @"<(script|style)[^>]*>.*?</\1>", " ",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var noTags = Regex.Replace(noScript, "<[^>]+>", " ");
        var decoded = System.Net.WebUtility.HtmlDecode(noTags);
        return Regex.Replace(decoded, @"\s+", " ").Trim();
    }

    // Page slugs/labels most likely to carry contact + team emails (en + sv).
    private static readonly string[] ContactKeywords =
        { "kontakt", "contact", "om-oss", "om_oss", "/om/", "about", "team", "medarbetare",
          "people", "ledning", "personal", "staff", "anstallda", "anställda", "employees", "vara-medarbetare" };

    // Up to `max` distinct same-site links that look like contact/team pages. Skips the homepage,
    // anchors, mailto:/tel:, and off-site links — we only follow the company's own pages.
    private static List<string> FindContactLinks(string html, string baseUrl, int max)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var b)) return new();
        var home = b.GetLeftPart(UriPartial.Path).TrimEnd('/');
        var doc = Parser.ParseDocument(html);
        var found = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var a in doc.QuerySelectorAll("a[href]"))
        {
            if (found.Count >= max) break;
            var href = a.GetAttribute("href") ?? "";
            if (href.Length == 0 || href.StartsWith("#") || href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)
                || href.StartsWith("tel:", StringComparison.OrdinalIgnoreCase)) continue;
            var hay = (href + " " + (a.TextContent ?? "")).ToLowerInvariant();
            if (!ContactKeywords.Any(k => hay.Contains(k))) continue;
            if (!Uri.TryCreate(b, href, out var abs)) continue;
            if (!abs.Host.Equals(b.Host, StringComparison.OrdinalIgnoreCase)) continue; // same site only
            var norm = abs.GetLeftPart(UriPartial.Path).TrimEnd('/');
            if (norm.Equals(home, StringComparison.OrdinalIgnoreCase)) continue; // not the homepage again
            if (seen.Add(norm)) found.Add(abs.ToString());
        }
        return found;
    }

    // Keep the best (highest) confidence per unique (type, value). Confidence enum: High=0.
    private static List<ContactHit> Dedupe(List<ContactHit> hits) =>
        hits.GroupBy(h => (h.Type, h.Value.ToLowerInvariant()))
            .Select(g => g.OrderBy(h => h.Confidence).First())
            .ToList();

    private static string Clean(string s) => Regex.Replace(Uri.UnescapeDataString(s).Trim(), @"\s+", " ");

    private static bool IsEmail(string s) =>
        EmailRe.IsMatch(s) && !EmailBlocklist.Any(b => s.Contains(b, StringComparison.OrdinalIgnoreCase));
}
