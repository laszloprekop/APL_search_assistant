namespace Api.Models;

/// <summary>The spine of the data model (PRD §9). A company can exist with zero persons.</summary>
public class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string? OrgNumber { get; set; }
    public string? Website { get; set; }
    public string? LocationLan { get; set; }
    public string? LocationKommun { get; set; }
    public string? RevenueBand { get; set; }
    public string? EmployeeCount { get; set; }
    public string? FinancialNote { get; set; }
    public string? TechStackGuess { get; set; }
    public string? SiteTextRaw { get; set; } // captured now for cheap interview-prep later (§6.8)
    public string? Notes { get; set; }

    public CompanySource Source { get; set; } = CompanySource.Manual;
    public EnrichmentStatus EnrichmentStatus { get; set; } = EnrichmentStatus.Pending;
    public CompanyStage Stage { get; set; } = CompanyStage.Identified;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EnrichedAt { get; set; }

    public List<Person> Persons { get; set; } = new();
    public List<ContactInfo> Contacts { get; set; } = new();
}

/// <summary>Optional person reached via LinkedIn; 0..n per company.</summary>
public class Person
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public string Name { get; set; } = "";
    public string? Title { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? LinkedInHandle { get; set; } // used to dedupe on capture import
    public string? Notes { get; set; }
}

/// <summary>Key/value app config (PRD §9). Holds the chosen search provider + API key,
/// stored in the local git-ignored DB so it never gets committed.</summary>
public class Setting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

/// <summary>An email or phone for the company. "Ready for the Lexicon list" needs both.</summary>
public class ContactInfo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public ContactType Type { get; set; }
    public string Value { get; set; } = "";
    public ContactSource Source { get; set; } = ContactSource.Manual;
    public Confidence? Confidence { get; set; }
}
