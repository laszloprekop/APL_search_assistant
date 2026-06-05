using System.Net.Http.Json;
using System.Text.Json;
using Api.Data;
using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

internal record SearchResult(string Title, string Url, string Snippet);

/// <summary>
/// Provider-agnostic web search to find a company's official website (PRD §6.2). The provider
/// (Brave / Google PSE / Serper) and API key are chosen at runtime via Settings and read from
/// the local DB per request. Searches by COMPANY NAME ONLY — never person names — so no personal
/// data leaves the machine. Returns ranked candidates for the human to confirm.
/// </summary>
public class SearchService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<SearchService> _log;

    // Aggregators / socials / directories that aren't the company's own site.
    private static readonly string[] Excluded =
    {
        // socials
        "linkedin.", "facebook.", "instagram.", "twitter.", "x.com", "youtube.", "tiktok.", "pinterest.",
        // Swedish company directories / registries
        "allabolag.", "ratsit.", "hitta.", "eniro.", "merinfo.", "proff.", "bolagsfakta.",
        "largestcompanies.", "cylex", "bizzdo.", "ppettider", "xn--",
        "industritorget.", "bolag.org", "uochd.",
        // PR / newswire (not the company's own site)
        "cision.", "mynewsdesk.", "newsdesk.",
        // intl business directories / data brokers
        "wikipedia.", "indeed.", "glassdoor.", "bloomberg.", "crunchbase.", "zoominfo.",
        "apollo.io", "rocketreach.", "dnb.com", "vainu.", "kompass.", "europages.", "blocket.", "google.",
    };

    public SearchService(IHttpClientFactory httpFactory, AppDbContext db, IConfiguration config, ILogger<SearchService> log)
    {
        _httpFactory = httpFactory;
        _db = db;
        _config = config;
        _log = log;
    }

    public async Task<(string Provider, bool Configured)> StatusAsync()
    {
        var s = await LoadAsync();
        return (s.Provider, IsConfigured(s));
    }

    /// <summary>Settings view for the UI: never returns the raw key, just whether one is set
    /// and whether each value is managed via env/user-secrets (so the UI can lock those fields).</summary>
    public async Task<SettingsDto> GetSettingsAsync()
    {
        var s = await LoadAsync();
        return new SettingsDto(s.Provider, !string.IsNullOrWhiteSpace(s.ApiKey), s.GoogleCseId,
            s.ProviderFromEnv, s.KeyFromEnv, s.CseFromEnv);
    }

    public async Task<FindWebsiteResponse> FindWebsiteAsync(Company c)
    {
        var s = await LoadAsync();
        if (!IsConfigured(s))
            return new("", new(), "Search isn't configured — open Settings and pick a provider + API key.");

        var city = CleanCity(c.LocationKommun) ?? CleanCity(c.LocationLan);
        // Company name is usually distinctive enough; a clean city token disambiguates
        // generic names. The raw LinkedIn location ("Umeå, Västerbotten County, Sweden") is
        // too noisy for web search, so we reduce it to just the city.
        var query = string.IsNullOrEmpty(city) ? c.Name : $"{c.Name} {city}";
        try
        {
            var results = await RunAsync(s, query);
            // If the name+city query is dry, retry on the bare company name before giving up.
            if (results.Count == 0 && !string.IsNullOrEmpty(city))
                results = await RunAsync(s, c.Name);

            // Zero RAW results for a real company name usually means the provider returned no
            // web data at all — i.e. the API key's plan/subscription isn't active, not a true
            // zero-match. Surface that as a hint rather than a misleading "no candidates".
            string? hint = results.Count == 0
                ? $"{s.Provider} returned no results. If every search is empty, the API key's "
                  + "plan/subscription may not be activated (e.g. Brave needs the free \"Web Search\" plan enabled)."
                : null;
            return new(query, Rank(results, c.Name), hint);
        }
        catch (Exception e)
        {
            _log.LogWarning("Search failed for {Query}: {Msg}", query, e.Message);
            return new(query, new(), e.Message);
        }
    }

    // ---- config: env / user-secrets take precedence over the local DB (PRD §10) ----
    private record Cfg(string Provider, string? ApiKey, string? GoogleCseId,
        bool ProviderFromEnv, bool KeyFromEnv, bool CseFromEnv);

    private async Task<Cfg> LoadAsync()
    {
        var map = await _db.Settings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value);
        string? Db(string k) => map.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v) ? v : null;
        string? Env(string k) => string.IsNullOrWhiteSpace(_config[k]) ? null : _config[k];

        var (provider, provEnv) = Resolve(Env("Search:Provider"), Db("search.provider"));
        var (apiKey, keyEnv) = Resolve(Env("Search:ApiKey"), Db("search.apiKey"));
        var (cse, cseEnv) = Resolve(Env("Search:GoogleCseId"), Db("search.googleCseId"));

        return new(string.IsNullOrWhiteSpace(provider) ? "none" : provider!.ToLowerInvariant(),
            apiKey, cse, provEnv, keyEnv, cseEnv);
    }

    // Env/user-secrets win; report whether the value came from there (so the UI can lock it).
    private static (string?, bool) Resolve(string? fromEnv, string? fromDb) =>
        fromEnv is not null ? (fromEnv, true) : (fromDb, false);

    // Reduce a messy LinkedIn location to a clean city token for search.
    //   "Umeå, Västerbotten County, Sweden"  -> "Umeå"
    //   "Greater Umeå Metropolitan Area"      -> "Umeå"
    //   "Stockholm, Sweden"                   -> "Stockholm"
    //   "Västerbotten"                        -> "Västerbotten"
    private static readonly string[] LocNoise =
        { "greater", "metropolitan", "area", "county", "region", "municipality", "sweden", "sverige", "the" };

    private static string? CleanCity(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var first = raw.Split(',')[0]; // "Umeå, Västerbotten County, Sweden" -> "Umeå ..."
        var words = first.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !LocNoise.Contains(w.ToLowerInvariant()))
            .ToArray();
        var city = string.Join(' ', words).Trim();
        return string.IsNullOrWhiteSpace(city) ? null : city;
    }

    private static bool IsConfigured(Cfg s) =>
        s.Provider != "none"
        && !string.IsNullOrWhiteSpace(s.ApiKey)
        && (s.Provider != "google" || !string.IsNullOrWhiteSpace(s.GoogleCseId));

    // ---- providers ----
    private async Task<List<SearchResult>> RunAsync(Cfg s, string query)
    {
        var http = _httpFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(10);
        return s.Provider switch
        {
            "brave" => await Brave(http, s.ApiKey!, query),
            "google" => await Google(http, s.ApiKey!, s.GoogleCseId!, query),
            "serper" => await Serper(http, s.ApiKey!, query),
            _ => new(),
        };
    }

    private static async Task<List<SearchResult>> Brave(HttpClient http, string key, string q)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"https://api.search.brave.com/res/v1/web/search?q={Uri.EscapeDataString(q)}&count=10&country=se");
        req.Headers.Add("X-Subscription-Token", key);
        req.Headers.Add("Accept", "application/json");
        using var res = await http.SendAsync(req);
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<SearchResult>();
        if (doc.RootElement.TryGetProperty("web", out var web) && web.TryGetProperty("results", out var arr))
            foreach (var r in arr.EnumerateArray())
                list.Add(new(Str(r, "title"), Str(r, "url"), Str(r, "description")));
        return list;
    }

    private static async Task<List<SearchResult>> Google(HttpClient http, string key, string cse, string q)
    {
        var url = $"https://www.googleapis.com/customsearch/v1?key={Uri.EscapeDataString(key)}&cx={Uri.EscapeDataString(cse)}&num=10&q={Uri.EscapeDataString(q)}";
        using var res = await http.GetAsync(url);
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<SearchResult>();
        if (doc.RootElement.TryGetProperty("items", out var arr))
            foreach (var r in arr.EnumerateArray())
                list.Add(new(Str(r, "title"), Str(r, "link"), Str(r, "snippet")));
        return list;
    }

    private static async Task<List<SearchResult>> Serper(HttpClient http, string key, string q)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://google.serper.dev/search");
        req.Headers.Add("X-API-KEY", key);
        req.Content = JsonContent.Create(new { q, gl = "se" });
        using var res = await http.SendAsync(req);
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var list = new List<SearchResult>();
        if (doc.RootElement.TryGetProperty("organic", out var arr))
            foreach (var r in arr.EnumerateArray())
                list.Add(new(Str(r, "title"), Str(r, "link"), Str(r, "snippet")));
        return list;
    }

    private static string Str(JsonElement e, string p) => e.TryGetProperty(p, out var v) ? (v.GetString() ?? "") : "";

    // ---- ranking ----
    private static readonly string[] TwoPartTlds = { "co.uk", "com.au", "co.nz", "com.se" };

    // Registrable domain label, robust to subdomains: careers.clavister.com -> "clavister",
    // www.cossystems.com -> "cossystems", xlent.se -> "xlent".
    private static string RegistrableDomain(string host)
    {
        host = host.ToLowerInvariant();
        if (host.StartsWith("www.")) host = host[4..];
        var p = host.Split('.');
        if (p.Length <= 2) return p[0];
        var lastTwo = p[^2] + "." + p[^1];
        return TwoPartTlds.Contains(lastTwo) ? p[^3] : p[^2];
    }

    private static int SubdomainDepth(string host)
    {
        host = host.ToLowerInvariant();
        if (host.StartsWith("www.")) host = host[4..];
        return Math.Max(0, host.Split('.').Length - 2);
    }

    private static List<WebsiteCandidate> Rank(List<SearchResult> results, string companyName)
    {
        var tokens = Tokenize(companyName);
        var collapsed = string.Concat(tokens); // "COS Systems" -> "cossystems"

        var scored = new List<(WebsiteCandidate Cand, string Sld, int Depth)>();
        for (int i = 0; i < results.Count; i++)
        {
            var r = results[i];
            if (!Uri.TryCreate(r.Url, UriKind.Absolute, out var u)) continue;
            var host = u.Host.ToLowerInvariant();
            if (Excluded.Any(d => host.Contains(d))) continue;

            var sld = RegistrableDomain(host);
            var depth = SubdomainDepth(host);
            var reasons = new List<string>();
            var score = Math.Max(0, 10 - i); // earlier result = better

            if (sld == collapsed && collapsed.Length > 0) { score += 100; reasons.Add("exact domain"); }
            else
            {
                var overlap = tokens.Count(t => sld.Contains(t));
                if (overlap == tokens.Count && tokens.Count > 0) { score += 60; reasons.Add("name match"); }
                else if (overlap > 0) { score += overlap * 25; reasons.Add("partial name"); }
            }
            if (host.EndsWith(".se")) { score += 10; reasons.Add(".se"); }
            score -= depth * 8; // prefer the root domain over careers./jobb./news. subdomains

            scored.Add((new(u.GetLeftPart(UriPartial.Authority), r.Title, r.Snippet, score, string.Join(", ", reasons)), sld, depth));
        }

        // One candidate per registrable domain — keep the root (shallowest), then highest score.
        // Drop non-positive scores: better to show nothing (→ manual) than a confidently-wrong guess.
        return scored
            .GroupBy(x => x.Sld)
            .Select(g => g.OrderBy(x => x.Depth).ThenByDescending(x => x.Cand.Score).First().Cand)
            .Where(c => c.Score > 0)
            .OrderByDescending(c => c.Score)
            .Take(5)
            .ToList();
    }

    private static List<string> Tokenize(string name) =>
        name.ToLowerInvariant()
            .Replace("&", " ")
            .Split(new[] { ' ', '-', '.', ',', '/', '(', ')' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length > 2 && t is not ("aktiebolag" or "group" or "sverige" or "the"))
            .ToList();
}
