using Api.Data;
using Api.Models;
using Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class ApiEndpoints
{
    // The canonical company identity is the `/company/<ID>/` segment of a LinkedIn URL
    // (numeric id or slug). Used to dedupe companies on import (Docs/enrichment-wizard.md).
    private static string? CompanyIdFrom(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var m = System.Text.RegularExpressions.Regex.Match(url, @"/company/([^/?#]+)");
        return m.Success ? m.Groups[1].Value.ToLowerInvariant() : null;
    }

    public static void MapApiEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTimeOffset.UtcNow }));

        // ---- companies -------------------------------------------------------
        api.MapGet("/companies", async (AppDbContext db, string? stage, string? lan,
            bool? ready, bool? hasEmail, bool? hasPhone) =>
        {
            var q = db.Companies.Include(c => c.Persons).Include(c => c.Contacts).AsQueryable();
            if (Enum.TryParse<CompanyStage>(stage, true, out var st)) q = q.Where(c => c.Stage == st);
            if (!string.IsNullOrWhiteSpace(lan)) q = q.Where(c => c.LocationLan == lan);

            // SQLite can't ORDER BY DateTimeOffset in SQL — order client-side (dataset is tiny).
            var list = (await q.ToListAsync())
                .OrderByDescending(c => c.CreatedAt)
                .Select(ToDto);
            if (ready == true) list = list.Where(d => d.ReadyForList);
            if (hasEmail == true) list = list.Where(d => d.HasEmail);
            if (hasPhone == true) list = list.Where(d => d.HasPhone);
            return Results.Ok(list.ToList());
        });

        api.MapGet("/companies/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var c = await Load(db, id);
            return c is null ? Results.NotFound() : Results.Ok(ToDto(c));
        });

        // Full-dataset export for backup/sharing (PRD §6.1) — every company, unfiltered, as the same
        // lossless graph the UI uses. The web client serializes this to JSON / CSV / TSV.
        api.MapGet("/export", async (AppDbContext db) =>
        {
            var list = (await db.Companies.Include(c => c.Persons).Include(c => c.Contacts).ToListAsync())
                .OrderByDescending(c => c.CreatedAt)
                .Select(ToDto)
                .ToList();
            return Results.Ok(list);
        });

        api.MapPost("/companies", async (AppDbContext db, CompanyCreateDto dto) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest("Name is required.");
            var c = new Company
            {
                Name = dto.Name.Trim(),
                Source = dto.Source,
                OrgNumber = dto.OrgNumber, Website = dto.Website,
                LocationLan = dto.LocationLan, LocationKommun = dto.LocationKommun,
                RevenueBand = dto.RevenueBand, EmployeeCount = dto.EmployeeCount,
                FinancialNote = dto.FinancialNote, TechStackGuess = dto.TechStackGuess,
                Notes = dto.Notes,
            };
            foreach (var p in dto.Persons ?? new())
                c.Persons.Add(new Person { Name = p.Name, Title = p.Title, LinkedInUrl = p.LinkedInUrl, LinkedInHandle = p.LinkedInHandle, Notes = p.Notes });
            foreach (var ci in dto.Contacts ?? new())
                c.Contacts.Add(new ContactInfo { Type = ci.Type, Value = ci.Value, Source = ci.Source, Confidence = ci.Confidence, SourceUrl = ci.SourceUrl, OutreachStatus = ci.OutreachStatus });

            db.Companies.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/companies/{c.Id}", ToDto(c));
        });

        api.MapPut("/companies/{id:guid}", async (AppDbContext db, Guid id, CompanyUpdateDto dto) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();
            c.Name = dto.Name.Trim();
            c.Stage = dto.Stage;
            c.EnrichmentStatus = dto.EnrichmentStatus;
            c.Source = dto.Source;
            c.OrgNumber = dto.OrgNumber; c.Website = dto.Website;
            c.LocationLan = dto.LocationLan; c.LocationKommun = dto.LocationKommun;
            c.RevenueBand = dto.RevenueBand; c.EmployeeCount = dto.EmployeeCount;
            c.FinancialNote = dto.FinancialNote; c.TechStackGuess = dto.TechStackGuess;
            c.Notes = dto.Notes;
            c.UpdatedAt = DateTimeOffset.UtcNow;
            if (dto.EnrichmentStatus == EnrichmentStatus.Enriched && c.EnrichedAt is null)
                c.EnrichedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(c));
        });

        api.MapDelete("/companies/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var c = await db.Companies.FindAsync(id);
            if (c is null) return Results.NotFound();
            db.Companies.Remove(c);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- nested persons / contacts --------------------------------------
        api.MapPost("/companies/{id:guid}/persons", async (AppDbContext db, Guid id, PersonDto dto) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();
            c.Persons.Add(new Person { Name = dto.Name, Title = dto.Title, LinkedInUrl = dto.LinkedInUrl, LinkedInHandle = dto.LinkedInHandle, Notes = dto.Notes });
            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(c));
        });

        api.MapPost("/companies/{id:guid}/contacts", async (AppDbContext db, Guid id, ContactDto dto) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(dto.Value)) return Results.BadRequest("Value is required.");
            // PersonId is honoured only if that person belongs to this company.
            var personId = dto.PersonId is { } pid && c.Persons.Any(p => p.Id == pid) ? pid : (Guid?)null;
            c.Contacts.Add(new ContactInfo
            {
                Type = dto.Type, Value = dto.Value.Trim(), Source = dto.Source, Confidence = dto.Confidence,
                SourceUrl = dto.SourceUrl, PersonId = personId, OutreachStatus = dto.OutreachStatus,
            });
            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(c));
        });

        // Per-contact reach-out status (PRD §6.3). Stamps LastContactedAt when moving off NotContacted.
        api.MapPatch("/contacts/{id:guid}/status", async (AppDbContext db, Guid id, ContactStatusUpdateDto dto) =>
        {
            var ci = await db.Contacts.FindAsync(id);
            if (ci is null) return Results.NotFound();
            ci.OutreachStatus = dto.OutreachStatus;
            if (dto.OutreachStatus is OutreachStatus.Contacted or OutreachStatus.Replied && ci.LastContactedAt is null)
                ci.LastContactedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            var c = await Load(db, ci.CompanyId);
            return Results.Ok(ToDto(c!));
        });

        api.MapDelete("/persons/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var p = await db.Persons.FindAsync(id);
            if (p is null) return Results.NotFound();
            db.Persons.Remove(p);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapDelete("/contacts/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var ci = await db.Contacts.FindAsync(id);
            if (ci is null) return Results.NotFound();
            // Deleting a person's LinkedIn point also clears the denormalized URL so the header
            // link stays in sync (the handle is kept so capture import still dedupes them).
            if (ci.Type == ContactType.LinkedIn && ci.PersonId is { } pid)
            {
                var p = await db.Persons.FindAsync(pid);
                if (p is not null) p.LinkedInUrl = null;
            }
            db.Contacts.Remove(ci);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- capture import (from the LinkedIn extension, PRD §6.1) ----------
        api.MapPost("/companies/import", async (AppDbContext db, List<CaptureRow> rows) =>
        {
            int companiesCreated = 0, personsAdded = 0, skipped = 0;
            var touched = new List<Guid>();
            var companies = await db.Companies.Include(c => c.Persons).ToListAsync();

            // Global dedupe set: a LinkedIn person (by handle) is captured at most once,
            // even across re-imports, overlapping pages, or different parsed company names.
            var seenHandles = new HashSet<string>(
                companies.SelectMany(c => c.Persons)
                    .Where(p => !string.IsNullOrWhiteSpace(p.LinkedInHandle))
                    .Select(p => p.LinkedInHandle!),
                StringComparer.OrdinalIgnoreCase);

            foreach (var r in rows)
            {
                var coName = string.IsNullOrWhiteSpace(r.Company) ? "(okänt företag)" : r.Company.Trim();

                // Identity (two-key model, Docs/enrichment-wizard.md): prefer the canonical
                // /company/<ID>/ when the wizard supplied it — it unifies messy name variants
                // ("mfex" vs "MFEXbyEuroclear") — and fall back to name match otherwise.
                var coId = CompanyIdFrom(r.Company_linkedin_url);
                Company? company = coId is not null
                    ? companies.FirstOrDefault(c => CompanyIdFrom(c.LinkedInUrl) == coId)
                    : null;
                company ??= companies.FirstOrDefault(c => string.Equals(c.Name, coName, StringComparison.OrdinalIgnoreCase));

                if (company is null)
                {
                    company = new Company
                    {
                        Name = coName,
                        Source = CompanySource.LinkedIn,
                        LocationKommun = r.Location,
                        LocationLan = r.Lan,
                    };
                    db.Companies.Add(company);
                    companies.Add(company);
                    companiesCreated++;
                }

                // Absorb the wizard's authoritative LinkedIn fields onto the company spine.
                if (coId is not null && string.IsNullOrWhiteSpace(company.LinkedInUrl))
                    company.LinkedInUrl = r.Company_linkedin_url!.Trim();
                if (!string.IsNullOrWhiteSpace(r.Website) && string.IsNullOrWhiteSpace(company.Website))
                    company.Website = r.Website!.Trim();
                // If we'd matched by id under the placeholder name, adopt the clean one.
                if (string.Equals(company.Name, "(okänt företag)", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(coName, "(okänt företag)", StringComparison.OrdinalIgnoreCase))
                    company.Name = coName;

                var handle = string.IsNullOrWhiteSpace(r.Handle) ? null : r.Handle.Trim();
                var name = r.Name?.Trim();

                // Duplicate if the handle is already known globally, or (no handle) the same
                // name already sits on this company.
                var isDuplicate = handle is not null
                    ? seenHandles.Contains(handle)
                    : !string.IsNullOrWhiteSpace(name)
                        && company.Persons.Any(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));

                if (!isDuplicate && !string.IsNullOrWhiteSpace(name))
                {
                    var person = new Person
                    {
                        Name = name,
                        Title = r.Title,
                        LinkedInUrl = r.Linkedin_url,
                        LinkedInHandle = handle,
                    };
                    company.Persons.Add(person);
                    // The profile URL is itself a trackable reach-out point (default NotContacted).
                    if (!string.IsNullOrWhiteSpace(r.Linkedin_url))
                        company.Contacts.Add(new ContactInfo
                        {
                            CompanyId = company.Id, PersonId = person.Id, Type = ContactType.LinkedIn,
                            Value = r.Linkedin_url!.Trim(), Source = ContactSource.LinkedIn,
                        });
                    if (handle is not null) seenHandles.Add(handle);
                    personsAdded++;
                }
                else if (isDuplicate) skipped++;

                if (!touched.Contains(company.Id)) touched.Add(company.Id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new ImportResult(companiesCreated, personsAdded, skipped, touched));
        });

        // ---- spreadsheet import (PRD §6.1) -----------------------------------
        // Generic, layout-agnostic upsert: the web client maps each supported sheet (discovery
        // list, per-person contact tracker) onto SheetImportRow and posts a batch. We match an
        // existing company by website host first (survives name drift), then by name; create if
        // neither hits. Non-empty company fields are never clobbered; persons dedupe by name and
        // contacts by (type, value), so re-pasting the same sheet is idempotent.
        api.MapPost("/companies/import-sheet", async (AppDbContext db, List<SheetImportRow> rows) =>
        {
            int companiesCreated = 0, personsAdded = 0, skipped = 0;
            var touched = new List<Guid>();
            var companies = await db.Companies.Include(c => c.Persons).Include(c => c.Contacts).ToListAsync();

            static string? Host(string? url)
            {
                if (string.IsNullOrWhiteSpace(url)) return null;
                var s = System.Text.RegularExpressions.Regex.Replace(url.Trim().ToLowerInvariant(), @"^https?://", "");
                if (s.StartsWith("www.")) s = s[4..];
                var slash = s.IndexOfAny(new[] { '/', '?', '#' });
                if (slash >= 0) s = s[..slash];
                return string.IsNullOrWhiteSpace(s) ? null : s.TrimEnd('.');
            }
            static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
            static string MergeNote(string? existing, string add) =>
                string.IsNullOrWhiteSpace(existing) ? add
                : existing.Contains(add, StringComparison.OrdinalIgnoreCase) ? existing
                : existing + "\n" + add;
            static void AddContact(Company company, Person? person, ContactType type, string? value, ContactSource source)
            {
                var v = Clean(value);
                if (v is null) return;
                if (company.Contacts.Any(x => x.Type == type && string.Equals(x.Value, v, StringComparison.OrdinalIgnoreCase))) return;
                company.Contacts.Add(new ContactInfo
                {
                    CompanyId = company.Id, PersonId = person?.Id, Type = type, Value = v, Source = source,
                });
            }

            foreach (var r in rows)
            {
                var name = Clean(r.Name);
                if (name is null) { skipped++; continue; }

                var host = Host(r.Website);
                Company? company = host is not null
                    ? companies.FirstOrDefault(c => Host(c.Website) == host)
                    : null;
                company ??= companies.FirstOrDefault(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));

                if (company is null)
                {
                    company = new Company { Name = name, Source = CompanySource.Manual };
                    db.Companies.Add(company);
                    companies.Add(company);
                    companiesCreated++;
                }

                // Fill only empty company scalars — never overwrite data already in the app.
                if (string.IsNullOrWhiteSpace(company.Website)) company.Website = Clean(r.Website) ?? company.Website;
                if (string.IsNullOrWhiteSpace(company.OrgNumber)) company.OrgNumber = Clean(r.OrgNumber) ?? company.OrgNumber;
                if (string.IsNullOrWhiteSpace(company.LocationKommun)) company.LocationKommun = Clean(r.LocationKommun) ?? company.LocationKommun;
                if (string.IsNullOrWhiteSpace(company.LocationLan)) company.LocationLan = Clean(r.LocationLan) ?? company.LocationLan;
                if (string.IsNullOrWhiteSpace(company.TechStackGuess)) company.TechStackGuess = Clean(r.TechStackGuess) ?? company.TechStackGuess;
                if (Clean(r.Notes) is { } note) company.Notes = MergeNote(company.Notes, note);

                Person? person = null;
                if (Clean(r.PersonName) is { } pname)
                {
                    person = company.Persons.FirstOrDefault(p => string.Equals(p.Name, pname, StringComparison.OrdinalIgnoreCase));
                    if (person is null)
                    {
                        person = new Person { Name = pname, Title = Clean(r.PersonTitle), Notes = Clean(r.PersonNotes), LinkedInUrl = Clean(r.LinkedInUrl) };
                        company.Persons.Add(person);
                        personsAdded++;
                    }
                    else
                    {
                        person.Title ??= Clean(r.PersonTitle);
                        person.Notes ??= Clean(r.PersonNotes);
                        person.LinkedInUrl ??= Clean(r.LinkedInUrl);
                    }
                }

                AddContact(company, person, ContactType.Email, r.Email, ContactSource.Manual);
                AddContact(company, person, ContactType.Phone, r.Phone, r.PhoneIsSwitchboard ? ContactSource.Switchboard : ContactSource.Manual);
                AddContact(company, person, ContactType.LinkedIn, r.LinkedInUrl, ContactSource.LinkedIn);

                if (!touched.Contains(company.Id)) touched.Add(company.Id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new ImportResult(companiesCreated, personsAdded, skipped, touched));
        });

        // Native backup restore (PRD §6.1) — accepts the app's own data graph (from a JSON / CSV /
        // TSV export). Same merge/upsert as import-sheet, but carries the full graph: company stage/
        // source/financials on creation, person LinkedIn handle, and per-contact source/confidence/
        // outreach status. Existing non-empty fields are never overwritten; persons dedupe by name,
        // contacts by (type, value) — so re-importing a backup is idempotent.
        api.MapPost("/companies/import-native", async (AppDbContext db, List<BackupCompany> rows) =>
        {
            int companiesCreated = 0, personsAdded = 0, skipped = 0;
            var touched = new List<Guid>();
            var companies = await db.Companies.Include(c => c.Persons).Include(c => c.Contacts).ToListAsync();

            static string? Host(string? url)
            {
                if (string.IsNullOrWhiteSpace(url)) return null;
                var s = System.Text.RegularExpressions.Regex.Replace(url.Trim().ToLowerInvariant(), @"^https?://", "");
                if (s.StartsWith("www.")) s = s[4..];
                var slash = s.IndexOfAny(new[] { '/', '?', '#' });
                if (slash >= 0) s = s[..slash];
                return string.IsNullOrWhiteSpace(s) ? null : s.TrimEnd('.');
            }
            static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
            static string MergeNote(string? existing, string add) =>
                string.IsNullOrWhiteSpace(existing) ? add
                : existing.Contains(add, StringComparison.OrdinalIgnoreCase) ? existing
                : existing + "\n" + add;
            static TEnum Parse<TEnum>(string? s, TEnum fallback) where TEnum : struct, Enum =>
                Enum.TryParse<TEnum>(s, true, out var v) ? v : fallback;

            void AddContact(Company company, Guid? personId, BackupContact bc)
            {
                var v = Clean(bc.Value);
                if (v is null || !Enum.TryParse<ContactType>(bc.Type, true, out var type)) return;
                if (company.Contacts.Any(x => x.Type == type && string.Equals(x.Value, v, StringComparison.OrdinalIgnoreCase))) return;
                company.Contacts.Add(new ContactInfo
                {
                    CompanyId = company.Id,
                    PersonId = personId,
                    Type = type,
                    Value = v,
                    Source = Parse(bc.Source, ContactSource.Manual),
                    Confidence = Enum.TryParse<Confidence>(bc.Confidence, true, out var cf) ? cf : null,
                    SourceUrl = Clean(bc.SourceUrl),
                    OutreachStatus = Parse(bc.OutreachStatus, OutreachStatus.NotContacted),
                    LastContactedAt = bc.LastContactedAt,
                });
            }

            foreach (var r in rows)
            {
                var name = Clean(r.Name);
                if (name is null) { skipped++; continue; }

                var host = Host(r.Website);
                Company? company = host is not null
                    ? companies.FirstOrDefault(c => Host(c.Website) == host)
                    : null;
                company ??= companies.FirstOrDefault(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));

                if (company is null)
                {
                    // New company: seed stage/source/status from the backup (existing rows keep theirs).
                    company = new Company
                    {
                        Name = name,
                        Source = Parse(r.Source, CompanySource.Manual),
                        Stage = Parse(r.Stage, CompanyStage.Identified),
                        EnrichmentStatus = Parse(r.EnrichmentStatus, EnrichmentStatus.Pending),
                    };
                    db.Companies.Add(company);
                    companies.Add(company);
                    companiesCreated++;
                }

                // Fill only empty company scalars — never overwrite data already in the app.
                if (string.IsNullOrWhiteSpace(company.Website)) company.Website = Clean(r.Website) ?? company.Website;
                if (string.IsNullOrWhiteSpace(company.OrgNumber)) company.OrgNumber = Clean(r.OrgNumber) ?? company.OrgNumber;
                if (string.IsNullOrWhiteSpace(company.LinkedInUrl)) company.LinkedInUrl = Clean(r.LinkedInUrl) ?? company.LinkedInUrl;
                if (string.IsNullOrWhiteSpace(company.LocationLan)) company.LocationLan = Clean(r.LocationLan) ?? company.LocationLan;
                if (string.IsNullOrWhiteSpace(company.LocationKommun)) company.LocationKommun = Clean(r.LocationKommun) ?? company.LocationKommun;
                if (string.IsNullOrWhiteSpace(company.RevenueBand)) company.RevenueBand = Clean(r.RevenueBand) ?? company.RevenueBand;
                if (string.IsNullOrWhiteSpace(company.EmployeeCount)) company.EmployeeCount = Clean(r.EmployeeCount) ?? company.EmployeeCount;
                if (string.IsNullOrWhiteSpace(company.FinancialNote)) company.FinancialNote = Clean(r.FinancialNote) ?? company.FinancialNote;
                if (string.IsNullOrWhiteSpace(company.TechStackGuess)) company.TechStackGuess = Clean(r.TechStackGuess) ?? company.TechStackGuess;
                if (Clean(r.Notes) is { } note) company.Notes = MergeNote(company.Notes, note);

                foreach (var bp in r.Persons ?? new())
                {
                    var pname = Clean(bp.Name);
                    if (pname is null) continue;
                    var person = company.Persons.FirstOrDefault(p => string.Equals(p.Name, pname, StringComparison.OrdinalIgnoreCase));
                    if (person is null)
                    {
                        person = new Person
                        {
                            Name = pname, Title = Clean(bp.Title), LinkedInUrl = Clean(bp.LinkedInUrl),
                            LinkedInHandle = Clean(bp.LinkedInHandle), Notes = Clean(bp.Notes),
                        };
                        company.Persons.Add(person);
                        personsAdded++;
                    }
                    else
                    {
                        person.Title ??= Clean(bp.Title);
                        person.LinkedInUrl ??= Clean(bp.LinkedInUrl);
                        person.LinkedInHandle ??= Clean(bp.LinkedInHandle);
                        person.Notes ??= Clean(bp.Notes);
                    }
                    foreach (var bc in bp.Contacts ?? new()) AddContact(company, person.Id, bc);
                }

                foreach (var bc in r.Contacts ?? new()) AddContact(company, null, bc);

                if (!touched.Contains(company.Id)) touched.Add(company.Id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new ImportResult(companiesCreated, personsAdded, skipped, touched));
        });

        // ---- enrichment: cautious public-website fetch (PRD §6.2) ------------
        api.MapPost("/companies/{id:guid}/enrich", async (AppDbContext db, EnrichmentService svc, SearchService search, Guid id, EnrichRequest? body) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();

            // Self-heal: collapse any duplicate contacts (same type + value, case-insensitive),
            // keeping the first. Makes enrich idempotent against re-runs / double-submits.
            var dupes = c.Contacts
                .GroupBy(x => (x.Type, Value: (x.Value ?? "").Trim().ToLowerInvariant()))
                .SelectMany(g => g.Skip(1))
                .ToList();
            foreach (var d in dupes) c.Contacts.Remove(d);
            if (dupes.Count > 0) db.RemoveRange(dupes);

            var url = !string.IsNullOrWhiteSpace(body?.Website) ? body!.Website!.Trim() : c.Website;
            if (string.IsNullOrWhiteSpace(url))
            {
                c.EnrichmentStatus = EnrichmentStatus.NeedsManualLookup;
                c.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync();
                return Results.Ok(new EnrichResponse(ToDto(c), false, 0, null,
                    "No website known — add one, or call the switchboard and enter contacts manually (deck §4B)."));
            }
            if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) url = "https://" + url;

            var r = await svc.EnrichWebsiteAsync(url);
            c.Website = url;
            if (r.Ok)
            {
                if (!string.IsNullOrWhiteSpace(r.SiteText)) c.SiteTextRaw = r.SiteText;
                foreach (var hit in r.Contacts)
                {
                    if (c.Contacts.Any(x => x.Type == hit.Type && string.Equals(x.Value, hit.Value, StringComparison.OrdinalIgnoreCase))) continue;
                    // Attribute to a person when the value encodes / sits beside their name; else generic.
                    var pid = AttributeToPerson(hit.Type, hit.Value, c.Persons, r.SiteText);
                    c.Contacts.Add(new ContactInfo { Type = hit.Type, Value = hit.Value, Source = ContactSource.Website, Confidence = hit.Confidence, SourceUrl = hit.SourceUrl, PersonId = pid });
                }
            }

            // Per-person search fallback (issue: the site crawl misses individual emails). For
            // each named person still without a real email, search the provider for a bio/team
            // page and scrape it. Capped to stay polite and keep search-API quota in check.
            int personHits = 0, attempted = 0;
            foreach (var p in c.Persons)
            {
                if (attempted >= 5) break; // bound search/fetch fan-out per enrich
                var hasPersonEmail = c.Contacts.Any(x => x.PersonId == p.Id
                    && x.Type == ContactType.Email && x.Source != ContactSource.Guessed);
                if (hasPersonEmail) continue;
                attempted++;
                foreach (var pageUrl in await search.FindPersonPagesAsync(c, p.Name))
                {
                    var pr = await svc.ScrapePageAsync(pageUrl);
                    if (!pr.Ok) continue;
                    // Only accept an email we can actually tie to THIS person — never fabricate.
                    var hit = pr.Contacts.FirstOrDefault(h => h.Type == ContactType.Email
                        && (EmailLocalMatchesName(LocalPart(h.Value), p.Name)
                            || (pr.SiteText is not null && NearInText(pr.SiteText, p.Name, h.Value))));
                    if (hit is null) continue;
                    if (c.Contacts.Any(x => x.Type == ContactType.Email && string.Equals(x.Value, hit.Value, StringComparison.OrdinalIgnoreCase))) continue;
                    c.Contacts.Add(new ContactInfo
                    {
                        Type = ContactType.Email, Value = hit.Value, Source = ContactSource.Website,
                        Confidence = Confidence.Low, SourceUrl = hit.SourceUrl ?? pageUrl, PersonId = p.Id,
                    });
                    personHits++;
                    break; // one good email per person is enough
                }
            }

            // Phone-first generic guesses (PRD §6.2): only when no REAL email was found and the
            // domain actually accepts mail (MX). Labeled Guessed, low confidence, off the ≥15 list.
            int guessed = 0;
            var hasRealEmail = c.Contacts.Any(x => x.Type == ContactType.Email && x.Source != ContactSource.Guessed);
            if (!hasRealEmail)
            {
                var domain = EnrichmentService.MailDomain(url);
                if (domain is not null && await svc.DomainAcceptsMailAsync(domain))
                {
                    foreach (var local in new[] { "info", "kontakt" })
                    {
                        var addr = $"{local}@{domain}";
                        if (!c.Contacts.Any(x => x.Type == ContactType.Email && string.Equals(x.Value, addr, StringComparison.OrdinalIgnoreCase)))
                        {
                            c.Contacts.Add(new ContactInfo { Type = ContactType.Email, Value = addr, Source = ContactSource.Guessed, Confidence = Confidence.Low });
                            guessed++;
                        }
                    }
                }
            }

            // Status reflects REAL contacts only — a guessed address still means "call the switchboard".
            var hasReal = c.Contacts.Any(x => x.Source != ContactSource.Guessed
                && (x.Type == ContactType.Email || x.Type == ContactType.Phone));
            c.EnrichmentStatus = (r.Ok && hasReal) ? EnrichmentStatus.Enriched : EnrichmentStatus.NeedsManualLookup;
            if (r.Ok) c.EnrichedAt = DateTimeOffset.UtcNow;
            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();

            var guessNote = guessed > 0 ? $" Added {guessed} guessed address(es) (info@/kontakt@) — unverified, so call to confirm; not counted for the list." : "";
            var personNote = personHits > 0 ? $" Found {personHits} person email(s) via search." : "";
            var msg = r.Ok
                ? $"Found {r.Contacts.Count} contact(s) on the site.{personNote}{guessNote}"
                : $"Couldn't enrich automatically — flagged for manual lookup.{personNote}{guessNote} {r.Error}";
            return Results.Ok(new EnrichResponse(ToDto(c), r.Ok || personHits > 0, r.Contacts.Count + personHits, r.Error, msg));
        });

        // ---- allabolag capture (extension) applied to a chosen company -------
        // Cloudflare blocks server-side allabolag fetches, so the browser extension reads the
        // page the user opened and POSTs org.nr / financials / switchboard phone here.
        api.MapPost("/companies/{id:guid}/allabolag", async (AppDbContext db, Guid id, AllabolagApplyDto dto) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();

            if (!string.IsNullOrWhiteSpace(dto.OrgNumber)) c.OrgNumber = dto.OrgNumber.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Kommun)) c.LocationKommun = dto.Kommun.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Lan)) c.LocationLan = dto.Lan.Trim();
            if (!string.IsNullOrWhiteSpace(dto.RevenueBand)) c.RevenueBand = dto.RevenueBand.Trim();
            if (!string.IsNullOrWhiteSpace(dto.EmployeeCount)) c.EmployeeCount = dto.EmployeeCount.Trim();
            if (!string.IsNullOrWhiteSpace(dto.FinancialNote)) c.FinancialNote = dto.FinancialNote.Trim();

            // allabolag's listed number is the company switchboard — high-confidence, real (counts
            // toward the ≥15 list), deduped by value.
            bool phoneAdded = false;
            if (!string.IsNullOrWhiteSpace(dto.Phone))
            {
                var val = dto.Phone.Trim();
                if (!c.Contacts.Any(x => x.Type == ContactType.Phone && string.Equals(x.Value, val, StringComparison.OrdinalIgnoreCase)))
                {
                    c.Contacts.Add(new ContactInfo { Type = ContactType.Phone, Value = val, Source = ContactSource.Switchboard, Confidence = Confidence.High });
                    phoneAdded = true;
                }
            }

            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            var msg = $"Applied allabolag data to {c.Name}." + (phoneAdded ? " Added switchboard phone." : "");
            return Results.Ok(new AllabolagApplyResult(ToDto(c), phoneAdded, msg));
        });

        // ---- person-level enrichment: find THIS person's contact on the company site ----
        api.MapPost("/persons/{id:guid}/enrich", async (AppDbContext db, EnrichmentService svc, Guid id) =>
        {
            var p = await db.Persons
                .Include(x => x.Company!).ThenInclude(co => co.Contacts)
                .Include(x => x.Company!).ThenInclude(co => co.Persons)
                .FirstOrDefaultAsync(x => x.Id == id);
            if (p is null || p.Company is null) return Results.NotFound();
            var c = p.Company;

            string? siteText = c.SiteTextRaw;
            var hits = new List<ContactHit>();
            var url = c.Website;
            if (!string.IsNullOrWhiteSpace(url))
            {
                if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) url = "https://" + url;
                var r = await svc.EnrichWebsiteAsync(url);
                if (r.Ok)
                {
                    hits = r.Contacts;
                    if (!string.IsNullOrWhiteSpace(r.SiteText)) { siteText = r.SiteText; c.SiteTextRaw = r.SiteText; }
                }
            }

            int added = 0;
            foreach (var hit in hits)
            {
                if (AttributeToPerson(hit.Type, hit.Value, new List<Person> { p }, siteText) != p.Id) continue; // only this person's
                if (c.Contacts.Any(x => x.Type == hit.Type && string.Equals(x.Value, hit.Value, StringComparison.OrdinalIgnoreCase))) continue;
                c.Contacts.Add(new ContactInfo { CompanyId = c.Id, PersonId = p.Id, Type = hit.Type, Value = hit.Value, Source = ContactSource.Website, Confidence = hit.Confidence, SourceUrl = hit.SourceUrl });
                added++;
            }
            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            var msg = string.IsNullOrWhiteSpace(c.Website)
                ? $"No company website yet — find it first, then look up {p.Name}."
                : added > 0 ? $"Found {added} contact(s) for {p.Name}."
                : $"No contact for {p.Name} on the site — try the switchboard.";
            return Results.Ok(new EnrichResponse(ToDto(c), added > 0, added, null, msg));
        });

        // ---- settings (search provider + key, stored in the local DB) --------
        api.MapGet("/settings", async (SearchService search) => Results.Ok(await search.GetSettingsAsync()));

        api.MapPut("/settings", async (AppDbContext db, SettingsUpdateDto dto) =>
        {
            async Task Set(string key, string value)
            {
                var e = await db.Settings.FindAsync(key);
                if (e is null) db.Settings.Add(new Setting { Key = key, Value = value });
                else e.Value = value;
            }
            if (dto.SearchProvider is not null) await Set("search.provider", dto.SearchProvider.ToLowerInvariant());
            if (dto.SearchApiKey is not null) await Set("search.apiKey", dto.SearchApiKey); // "" clears; omit (null) keeps existing
            if (dto.SearchGoogleCseId is not null) await Set("search.googleCseId", dto.SearchGoogleCseId);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- saved LinkedIn Boolean searches (one JSON blob in the Setting store) ----
        api.MapGet("/searches", async (AppDbContext db) =>
        {
            var e = await db.Settings.FindAsync("searches.list");
            var list = string.IsNullOrWhiteSpace(e?.Value)
                ? new List<SavedSearchDto>()
                : System.Text.Json.JsonSerializer.Deserialize<List<SavedSearchDto>>(e!.Value) ?? new();
            return Results.Ok(list);
        });

        api.MapPut("/searches", async (AppDbContext db, List<SavedSearchDto> searches) =>
        {
            var json = System.Text.Json.JsonSerializer.Serialize(searches);
            var e = await db.Settings.FindAsync("searches.list");
            if (e is null) db.Settings.Add(new Setting { Key = "searches.list", Value = json });
            else e.Value = json;
            await db.SaveChangesAsync();
            return Results.Ok(searches);
        });

        api.MapGet("/search/status", async (SearchService search) =>
        {
            var (provider, configured) = await search.StatusAsync();
            return Results.Ok(new { provider, configured });
        });

        api.MapPost("/companies/{id:guid}/find-website", async (AppDbContext db, SearchService search, Guid id) =>
        {
            var c = await db.Companies.FindAsync(id);
            return c is null ? Results.NotFound() : Results.Ok(await search.FindWebsiteAsync(c));
        });

        // Resolve the canonical LinkedIn company page via search and store it (links name → /about/).
        api.MapPost("/companies/{id:guid}/find-linkedin", async (AppDbContext db, SearchService search, Guid id) =>
        {
            var c = await db.Companies.FindAsync(id);
            if (c is null) return Results.NotFound();
            var url = await search.FindLinkedInPageAsync(c);
            if (url is not null) { c.LinkedInUrl = url; c.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(); }
            return Results.Ok(new { linkedInUrl = url });
        });

        // ---- M4: outreach templates + "your details" settings -----------------
        api.MapGet("/templates", async (AppDbContext db) =>
        {
            var list = await db.Templates.AsNoTracking().ToListAsync();
            return Results.Ok(list.OrderBy(t => t.Kind)
                .Select(t => new TemplateDto(t.Kind, t.Subject, t.Body, t.UpdatedAt)).ToList());
        });

        api.MapPut("/templates/{kind}", async (AppDbContext db, string kind, TemplateUpdateDto dto) =>
        {
            if (!Enum.TryParse<TemplateKind>(kind, true, out var k)) return Results.BadRequest("Unknown template kind.");
            var t = await db.Templates.FirstOrDefaultAsync(x => x.Kind == k);
            if (t is null) { t = new Template { Kind = k }; db.Templates.Add(t); }
            if (dto.Subject is not null) t.Subject = dto.Subject;
            if (dto.Body is not null) t.Body = dto.Body;
            t.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new TemplateDto(t.Kind, t.Subject, t.Body, t.UpdatedAt));
        });

        api.MapGet("/settings/outreach", async (AppDbContext db) =>
        {
            var map = await db.Settings.AsNoTracking().Where(s => s.Key.StartsWith("outreach."))
                .ToDictionaryAsync(s => s.Key, s => s.Value);
            string? G(string k) => map.TryGetValue(k, out var v) ? v : null;
            return Results.Ok(new OutreachSettingsDto(
                G("outreach.yourName"), G("outreach.cvSummary"), G("outreach.email"), G("outreach.phone"),
                G("outreach.linkedin"), G("outreach.period"), G("outreach.area")));
        });

        api.MapPut("/settings/outreach", async (AppDbContext db, OutreachSettingsDto dto) =>
        {
            async Task Set(string key, string? value)
            {
                if (value is null) return; // null = keep existing; "" = clear
                var e = await db.Settings.FindAsync(key);
                if (e is null) db.Settings.Add(new Setting { Key = key, Value = value });
                else e.Value = value;
            }
            await Set("outreach.yourName", dto.YourName);
            await Set("outreach.cvSummary", dto.CvSummary);
            await Set("outreach.email", dto.Email);
            await Set("outreach.phone", dto.Phone);
            await Set("outreach.linkedin", dto.Linkedin);
            await Set("outreach.period", dto.Period);
            await Set("outreach.area", dto.Area);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- M4: per-company drafts + outreach log (no auto-send) -------------
        // Render the right template with merge fields; the client opens a prefilled compose
        // window / copies the text / shows the script. Nothing is dispatched here.
        api.MapPost("/companies/{id:guid}/outreach/draft", async (AppDbContext db, Guid id, OutreachDraftRequest req) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();
            var kind = req.Kind ?? OutreachKind.Cold;
            var person = req.PersonId is { } pid ? c.Persons.FirstOrDefault(p => p.Id == pid) : null;
            var tplKind = OutreachService.TemplateFor(req.Channel, kind);
            var tpl = await db.Templates.FirstOrDefaultAsync(t => t.Kind == tplKind);
            if (tpl is null) return Results.Problem($"Template '{tplKind}' missing.");
            var consts = await OutreachService.LoadConstantsAsync(db);
            var fields = OutreachService.Fields(c, person, consts);
            var subject = OutreachService.Render(tpl.Subject, fields);
            var body = OutreachService.Render(tpl.Body, fields);
            var to = OutreachService.RecipientFor(req.Channel, c, person);
            return Results.Ok(new OutreachDraftDto(req.Channel, to, string.IsNullOrEmpty(subject) ? null : subject, body));
        });

        // Log an outreach the user performed (sent the mail / copied the inMail / made the call).
        // Advances the company stage and bumps the touched contact-point's reach-out status.
        api.MapPost("/companies/{id:guid}/outreach", async (AppDbContext db, Guid id, OutreachLogDto dto) =>
        {
            var c = await Load(db, id);
            if (c is null) return Results.NotFound();
            var person = dto.PersonId is { } pid ? c.Persons.FirstOrDefault(p => p.Id == pid) : null;
            var snapshot = System.Text.Json.JsonSerializer.Serialize(new
            {
                to = OutreachService.RecipientFor(dto.Channel, c, person),
                dto.Subject, dto.Body, dto.Outcome,
            });
            var o = new Outreach
            {
                CompanyId = c.Id, PersonId = person?.Id, Channel = dto.Channel, Kind = dto.Kind,
                Status = OutreachService.DefaultStatus(dto.Channel),
                Subject = dto.Subject, Body = dto.Body, Outcome = dto.Outcome,
                SnapshotJson = snapshot, SentAt = DateTimeOffset.UtcNow,
            };
            db.Outreach.Add(o);

            // Stage auto-advance (PRD §6.3): first real outreach moves a pre-contact company on.
            if (c.Stage is CompanyStage.Identified or CompanyStage.Enriched or CompanyStage.Ready)
                c.Stage = CompanyStage.Contacted;

            // Keep the per-contact reach-out status in sync with the channel just used: the
            // chosen person's point if they have one, else the generic point we'd have used.
            var ctype = OutreachService.ContactTypeFor(dto.Channel);
            bool NotYet(ContactInfo x) => x.Type == ctype && x.OutreachStatus == OutreachStatus.NotContacted;
            var contact =
                (person is not null ? c.Contacts.FirstOrDefault(x => NotYet(x) && x.PersonId == person.Id) : null)
                ?? c.Contacts.FirstOrDefault(x => NotYet(x) && x.PersonId == null);
            if (contact is not null) { contact.OutreachStatus = OutreachStatus.Contacted; contact.LastContactedAt = DateTimeOffset.UtcNow; }

            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToOutreachDto(o, c, person));
        });

        // Outbox / activity log (newest first; optionally scoped to one company).
        api.MapGet("/outreach", async (AppDbContext db, Guid? companyId) =>
        {
            var q = db.Outreach.Include(o => o.Company).Include(o => o.Person).AsQueryable();
            if (companyId is { } cid) q = q.Where(o => o.CompanyId == cid);
            // SQLite can't ORDER BY DateTimeOffset in SQL — sort client-side (dataset is tiny).
            var list = (await q.ToListAsync()).OrderByDescending(o => o.CreatedAt)
                .Select(o => ToOutreachDto(o, o.Company, o.Person)).ToList();
            return Results.Ok(list);
        });

        // Remove a mistaken Outbox entry. Doesn't roll back stage/contact-status (those are the
        // company's truth) — just deletes the log row.
        api.MapDelete("/outreach/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var o = await db.Outreach.FindAsync(id);
            if (o is null) return Results.NotFound();
            db.Outreach.Remove(o);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- M5: Lexicon ≥15-list submission (PRD §6.4, no auto-send) ----------
        // Build the list from every company that's ready (real email + phone). The cover email
        // comes from the Lexicon template ({{your_*}} + {{count}}/{{list_table}}); the CSV is
        // downloaded and attached by the user; nothing is dispatched here.
        api.MapGet("/lexicon/preview", async (AppDbContext db) =>
        {
            var companies = (await db.Companies.Include(c => c.Persons).Include(c => c.Contacts).ToListAsync())
                .Where(IsReadyForList).OrderBy(c => c.Name).ToList();
            var rows = companies.Select(BuildLexRow).ToList();
            var table = BuildLexTable(rows);
            var csv = BuildLexCsv(rows);

            var consts = await OutreachService.LoadConstantsAsync(db);
            var tpl = await db.Templates.FirstOrDefaultAsync(t => t.Kind == TemplateKind.Lexicon);
            var fields = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["your_name"] = consts.GetValueOrDefault("your_name"),
                ["your_email"] = consts.GetValueOrDefault("your_email"),
                ["your_phone"] = consts.GetValueOrDefault("your_phone"),
                ["count"] = rows.Count.ToString(),
                ["list_table"] = table,
            };
            var subject = OutreachService.Render(tpl?.Subject, fields);
            var body = OutreachService.Render(tpl?.Body ?? "", fields);
            return Results.Ok(new LexiconPreviewDto(
                "apl@lexicon.se", string.IsNullOrEmpty(subject) ? null : subject, body, table, csv,
                rows, companies.Select(c => c.Id).ToList(), rows.Count, 15));
        });

        api.MapPost("/lexicon/submit", async (AppDbContext db, LexiconSubmitDto dto) =>
        {
            var snapshot = System.Text.Json.JsonSerializer.Serialize(new { dto.To, dto.Subject, dto.Body, dto.Csv });
            var sub = new LexiconSubmission
            {
                CompanyCount = dto.CompanyIds.Count,
                CompanyIdsJson = System.Text.Json.JsonSerializer.Serialize(dto.CompanyIds),
                SnapshotJson = snapshot,
                SentAt = DateTimeOffset.UtcNow,
            };
            db.LexiconSubmissions.Add(sub);
            await db.SaveChangesAsync();
            return Results.Ok(new LexiconSubmissionDto(sub.Id, sub.CreatedAt, sub.SentAt, sub.CompanyCount));
        });

        api.MapGet("/lexicon/submissions", async (AppDbContext db) =>
        {
            var list = (await db.LexiconSubmissions.ToListAsync()).OrderByDescending(s => s.CreatedAt)
                .Select(s => new LexiconSubmissionDto(s.Id, s.CreatedAt, s.SentAt, s.CompanyCount)).ToList();
            return Results.Ok(list);
        });

        api.MapDelete("/lexicon/submissions/{id:guid}", async (AppDbContext db, Guid id) =>
        {
            var s = await db.LexiconSubmissions.FindAsync(id);
            if (s is null) return Results.NotFound();
            db.LexiconSubmissions.Remove(s);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---- company-page capture from the extension (LinkedIn About, PRD §6.1) ----
        api.MapPost("/companies/upsert", async (AppDbContext db, List<CompanyImportRow> rows) =>
        {
            int created = 0, updated = 0;
            var ids = new List<Guid>();
            var companies = await db.Companies.ToListAsync();

            foreach (var r in rows)
            {
                if (string.IsNullOrWhiteSpace(r.Name)) continue;
                var name = r.Name.Trim();
                var c = companies.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
                if (c is null)
                {
                    c = new Company { Name = name, Source = CompanySource.LinkedIn };
                    db.Companies.Add(c);
                    companies.Add(c);
                    created++;
                }
                else updated++;

                // LinkedIn's own "About" data is authoritative — fill website + size/HQ/industry.
                if (!string.IsNullOrWhiteSpace(r.Website)) c.Website = r.Website.Trim();
                if (!string.IsNullOrWhiteSpace(r.LinkedinUrl)) c.LinkedInUrl = r.LinkedinUrl.Trim();
                if (!string.IsNullOrWhiteSpace(r.CompanySize)) c.EmployeeCount = r.CompanySize.Trim();
                if (!string.IsNullOrWhiteSpace(r.Headquarters) && string.IsNullOrWhiteSpace(c.LocationKommun))
                    c.LocationKommun = r.Headquarters.Trim();
                if (!string.IsNullOrWhiteSpace(r.Industry))
                {
                    var tag = $"Industry: {r.Industry.Trim()}";
                    if (string.IsNullOrWhiteSpace(c.Notes)) c.Notes = tag;
                    else if (!c.Notes.Contains("Industry:")) c.Notes = $"{c.Notes}\n{tag}";
                }
                c.UpdatedAt = DateTimeOffset.UtcNow;
                if (!ids.Contains(c.Id)) ids.Add(c.Id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new CompanyUpsertResult(created, updated, ids));
        });

        // ---- stats: counter toward the ≥15 list (PRD §6.3) -------------------
        api.MapGet("/stats", async (AppDbContext db) =>
        {
            var list = await db.Companies.Include(c => c.Contacts).ToListAsync();
            var ready = list.Count(IsReadyForList);
            var byStage = list.GroupBy(c => c.Stage.ToString()).ToDictionary(g => g.Key, g => g.Count());
            return Results.Ok(new StatsDto(list.Count, ready, 15, byStage));
        });
    }

    // ---- helpers -------------------------------------------------------------
    private static Task<Company?> Load(AppDbContext db, Guid id) =>
        db.Companies.Include(c => c.Persons).Include(c => c.Contacts).FirstOrDefaultAsync(c => c.Id == id);

    // Guessed (info@/kontakt@) addresses are unverified — they never count toward "has email",
    // Ready, or the ≥15 Lexicon list (Docs/enrichment-wizard.md decision; PRD §6.4).
    private static bool HasType(Company c, ContactType t) =>
        c.Contacts.Any(x => x.Type == t && x.Source != ContactSource.Guessed && !string.IsNullOrWhiteSpace(x.Value));

    private static bool IsReadyForList(Company c) => HasType(c, ContactType.Email) && HasType(c, ContactType.Phone);

    // Attribute a found contact to a person — never fabricate (user decision). Either the email
    // local-part encodes their name, or the value sits next to their name in the page text.
    private static Guid? AttributeToPerson(ContactType type, string value, List<Person> persons, string? siteText)
    {
        if (type == ContactType.Email)
        {
            var lp = LocalPart(value);
            foreach (var p in persons) if (EmailLocalMatchesName(lp, p.Name)) return p.Id;
        }
        if (!string.IsNullOrWhiteSpace(siteText))
            foreach (var p in persons) if (NearInText(siteText!, p.Name, value)) return p.Id;
        return null;
    }

    private static string LocalPart(string email)
    {
        var at = email.IndexOf('@');
        var lp = at > 0 ? email[..at] : email;
        return new string(lp.ToLowerInvariant().Where(ch => char.IsLetterOrDigit(ch)).ToArray());
    }

    private static bool EmailLocalMatchesName(string lp, string name)
    {
        var parts = name.ToLowerInvariant()
            .Split(new[] { ' ', '\t', '.', '-' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(w => new string(w.Where(char.IsLetterOrDigit).ToArray()))
            .Where(w => w.Length >= 2).ToList();
        if (parts.Count == 0 || lp.Length < 4) return false;
        var first = parts[0]; var last = parts[^1];
        var hasLast = last.Length >= 3 && lp.Contains(last);
        var hasFirst = first.Length >= 3 && lp.Contains(first);
        if (hasLast && (hasFirst || lp.StartsWith(first[..1]))) return true; // donjanssen / djanssen / janssend
        if (hasFirst && hasLast) return true;
        return false;
    }

    private static bool NearInText(string text, string name, string value, int window = 120)
    {
        var iName = text.IndexOf(name, StringComparison.OrdinalIgnoreCase);
        var iVal = text.IndexOf(value, StringComparison.OrdinalIgnoreCase);
        return iName >= 0 && iVal >= 0 && Math.Abs(iName - iVal) <= window;
    }

    private static ContactDto ToContactDto(ContactInfo x) =>
        new(x.Id, x.Type, x.Value, x.Source, x.Confidence, x.SourceUrl, x.PersonId, x.OutreachStatus, x.LastContactedAt);

    private static OutreachDto ToOutreachDto(Outreach o, Company? c, Person? p) =>
        new(o.Id, o.CompanyId, c?.Name ?? "", o.PersonId, p?.Name, o.Channel, o.Kind, o.Status,
            o.Subject, o.Body, o.Outcome, o.CreatedAt, o.SentAt);

    // One Lexicon-list row: pick the kontaktperson whose attributed contacts cover the most of
    // email/phone, then their (or the generic) real email + phone. Company is ready, so both exist.
    private static LexiconRowDto BuildLexRow(Company c)
    {
        var emails = c.Contacts.Where(x => x.Type == ContactType.Email && x.Source != ContactSource.Guessed).ToList();
        var phones = c.Contacts.Where(x => x.Type == ContactType.Phone && x.Source != ContactSource.Guessed).ToList();

        Person? best = null; var bestScore = 0;
        foreach (var p in c.Persons)
        {
            var score = emails.Count(e => e.PersonId == p.Id) + phones.Count(ph => ph.PersonId == p.Id);
            if (score > bestScore) { bestScore = score; best = p; }
        }
        string? Pick(List<ContactInfo> xs, Guid? pid) =>
            (pid is { } id ? xs.FirstOrDefault(x => x.PersonId == id)?.Value : null)
            ?? xs.FirstOrDefault(x => x.PersonId == null)?.Value
            ?? xs.FirstOrDefault()?.Value;

        var ort = string.IsNullOrWhiteSpace(c.LocationKommun) ? c.LocationLan : c.LocationKommun;
        return new(c.Name, ort, best?.Name, best?.Title, Pick(emails, best?.Id), Pick(phones, best?.Id));
    }

    private static string BuildLexCsv(List<LexiconRowDto> rows)
    {
        static string Cell(string? v)
        {
            var s = v ?? "";
            return s.Contains(',') || s.Contains('"') || s.Contains('\n') ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
        }
        var sb = new System.Text.StringBuilder();
        sb.Append("Företag,Ort,Kontaktperson,Titel,E-post,Telefon\n");
        foreach (var r in rows)
            sb.Append(string.Join(",", new[] { r.Foretag, r.Ort, r.Kontaktperson, r.Titel, r.Epost, r.Telefon }.Select(Cell))).Append('\n');
        return sb.ToString();
    }

    private static string BuildLexTable(List<LexiconRowDto> rows)
    {
        var sb = new System.Text.StringBuilder();
        var i = 1;
        foreach (var r in rows)
            sb.Append($"{i++}. {r.Foretag} · {r.Ort} · {r.Kontaktperson} ({r.Titel}) · {r.Epost} · {r.Telefon}\n");
        return sb.ToString();
    }

    private static CompanyDto ToDto(Company c)
    {
        var hasEmail = HasType(c, ContactType.Email);
        var hasPhone = HasType(c, ContactType.Phone);
        return new CompanyDto(
            c.Id, c.Name, c.Stage, c.EnrichmentStatus, c.Source,
            c.OrgNumber, c.Website, c.LinkedInUrl, c.LocationLan, c.LocationKommun,
            c.RevenueBand, c.EmployeeCount, c.FinancialNote, c.TechStackGuess, c.Notes,
            hasEmail, hasPhone, hasEmail && hasPhone,
            c.CreatedAt, c.UpdatedAt, c.EnrichedAt,
            // Each person carries their own attributed contacts; company-level Contacts are the
            // generic ones (PersonId == null) — info@, switchboard, etc.
            c.Persons.Select(p => new PersonDto(p.Id, p.Name, p.Title, p.LinkedInUrl, p.LinkedInHandle, p.Notes,
                c.Contacts.Where(x => x.PersonId == p.Id).Select(ToContactDto).ToList())).ToList(),
            c.Contacts.Where(x => x.PersonId == null).Select(ToContactDto).ToList());
    }
}
