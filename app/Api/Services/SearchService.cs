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
    private readonly ILogger<SearchService> _log;

    // Aggregators / socials / directories that aren't the company's own site.
    private static readonly string[] Excluded =
    {
        "linkedin.", "facebook.", "instagram.", "twitter.", "x.com", "youtube.", "tiktok.",
        "allabolag.", "ratsit.", "hitta.", "eniro.", "merinfo.", "wikipedia.", "indeed.",
        "glassdoor.", "bloomberg.", "crunchbase.", "blocket.", "google.", "facebook.com",
    };

    public SearchService(IHttpClientFactory httpFactory, AppDbContext db, ILogger<SearchService> log)
    {
        _httpFactory = httpFactory;
        _db = db;
        _log = log;
    }

    public async Task<(string Provider, bool Configured)> StatusAsync()
    {
        var s = await LoadAsync();
        return (s.Provider, IsConfigured(s));
    }

    public async Task<FindWebsiteResponse> FindWebsiteAsync(Company c)
    {
        var s = await LoadAsync();
        if (!IsConfigured(s))
            return new("", new(), "Search isn't configured — open Settings and pick a provider + API key.");

        var loc = c.LocationKommun ?? c.LocationLan ?? "Sverige";
        var query = $"{c.Name} {loc}";
        try
        {
            var results = await RunAsync(s, query);
            return new(query, Rank(results, c.Name), null);
        }
        catch (Exception e)
        {
            _log.LogWarning("Search failed for {Query}: {Msg}", query, e.Message);
            return new(query, new(), e.Message);
        }
    }

    // ---- config ----
    private record Cfg(string Provider, string? ApiKey, string? GoogleCseId);

    private async Task<Cfg> LoadAsync()
    {
        var map = await _db.Settings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value);
        map.TryGetValue("search.provider", out var p);
        map.TryGetValue("search.apiKey", out var k);
        map.TryGetValue("search.googleCseId", out var cse);
        return new(string.IsNullOrWhiteSpace(p) ? "none" : p.ToLowerInvariant(), k, cse);
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
    private static List<WebsiteCandidate> Rank(List<SearchResult> results, string companyName)
    {
        var tokens = Tokenize(companyName);
        var seen = new HashSet<string>();
        var cands = new List<WebsiteCandidate>();
        for (int i = 0; i < results.Count; i++)
        {
            var r = results[i];
            if (!Uri.TryCreate(r.Url, UriKind.Absolute, out var u)) continue;
            var host = u.Host.ToLowerInvariant();
            if (Excluded.Any(d => host.Contains(d))) continue;
            if (!seen.Add(host)) continue; // one candidate per domain

            var reasons = new List<string>();
            var domainName = host.Replace("www.", "").Split('.')[0];
            var overlap = tokens.Count(t => domainName.Contains(t));
            var score = Math.Max(0, 10 - i); // earlier result = better
            if (overlap > 0) { score += overlap * 30; reasons.Add("name match"); }
            if (host.EndsWith(".se")) { score += 15; reasons.Add(".se"); }

            cands.Add(new(u.GetLeftPart(UriPartial.Authority), r.Title, r.Snippet, score, string.Join(", ", reasons)));
        }
        return cands.OrderByDescending(c => c.Score).Take(5).ToList();
    }

    private static List<string> Tokenize(string name) =>
        name.ToLowerInvariant()
            .Replace("&", " ")
            .Split(new[] { ' ', '-', '.', ',', '/', '(', ')' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length > 2 && t is not ("aktiebolag" or "group" or "sverige" or "the"))
            .ToList();
}
