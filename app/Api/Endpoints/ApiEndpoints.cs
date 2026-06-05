using Api.Data;
using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Endpoints;

public static class ApiEndpoints
{
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
                c.Contacts.Add(new ContactInfo { Type = ci.Type, Value = ci.Value, Source = ci.Source, Confidence = ci.Confidence });

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
            c.Contacts.Add(new ContactInfo { Type = dto.Type, Value = dto.Value.Trim(), Source = dto.Source, Confidence = dto.Confidence });
            c.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(c));
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

            foreach (var r in rows)
            {
                var coName = string.IsNullOrWhiteSpace(r.Company) ? "(okänt företag)" : r.Company.Trim();
                var company = companies.FirstOrDefault(c => string.Equals(c.Name, coName, StringComparison.OrdinalIgnoreCase));
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

                var handle = string.IsNullOrWhiteSpace(r.Handle) ? null : r.Handle.Trim();
                var isDuplicate = handle is not null && company.Persons.Any(p => p.LinkedInHandle == handle);
                if (!isDuplicate && !string.IsNullOrWhiteSpace(r.Name))
                {
                    company.Persons.Add(new Person
                    {
                        Name = r.Name.Trim(),
                        Title = r.Title,
                        LinkedInUrl = r.Linkedin_url,
                        LinkedInHandle = handle,
                    });
                    personsAdded++;
                }
                else if (isDuplicate) skipped++;

                if (!touched.Contains(company.Id)) touched.Add(company.Id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new ImportResult(companiesCreated, personsAdded, skipped, touched));
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

    private static bool HasType(Company c, ContactType t) =>
        c.Contacts.Any(x => x.Type == t && !string.IsNullOrWhiteSpace(x.Value));

    private static bool IsReadyForList(Company c) => HasType(c, ContactType.Email) && HasType(c, ContactType.Phone);

    private static CompanyDto ToDto(Company c)
    {
        var hasEmail = HasType(c, ContactType.Email);
        var hasPhone = HasType(c, ContactType.Phone);
        return new CompanyDto(
            c.Id, c.Name, c.Stage, c.EnrichmentStatus, c.Source,
            c.OrgNumber, c.Website, c.LocationLan, c.LocationKommun,
            c.RevenueBand, c.EmployeeCount, c.FinancialNote, c.TechStackGuess, c.Notes,
            hasEmail, hasPhone, hasEmail && hasPhone,
            c.CreatedAt, c.UpdatedAt, c.EnrichedAt,
            c.Persons.Select(p => new PersonDto(p.Id, p.Name, p.Title, p.LinkedInUrl, p.LinkedInHandle, p.Notes)).ToList(),
            c.Contacts.Select(x => new ContactDto(x.Id, x.Type, x.Value, x.Source, x.Confidence)).ToList());
    }
}
