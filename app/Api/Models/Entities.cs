namespace Api.Models;

/// <summary>The spine of the data model (PRD §9). A company can exist with zero persons.</summary>
public class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string? OrgNumber { get; set; }
    public string? Website { get; set; }
    public string? LinkedInUrl { get; set; } // company LinkedIn page (from company-page capture)
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

    public List<ContactInfo> Contacts { get; set; } = new(); // this person's own email/phone
}

/// <summary>Key/value app config (PRD §9). Holds the chosen search provider + API key,
/// stored in the local git-ignored DB so it never gets committed.</summary>
public class Setting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

/// <summary>An email or phone — a trackable "reach-out" entity (PRD §6.3). Belongs to the
/// company (generic, e.g. info@) or to a specific Person (PersonId set). "Ready for the
/// Lexicon list" needs both a usable email and phone on the company (guessed excluded).</summary>
public class ContactInfo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }

    public Guid? PersonId { get; set; } // null = generic company contact; set = belongs to a person
    public Person? Person { get; set; }

    public ContactType Type { get; set; }
    public string Value { get; set; } = "";
    public ContactSource Source { get; set; } = ContactSource.Manual;
    public Confidence? Confidence { get; set; }
    public string? SourceUrl { get; set; } // exact page the value was extracted from

    // Reach-out tracking, per contact.
    public OutreachStatus OutreachStatus { get; set; } = OutreachStatus.NotContacted;
    public DateTimeOffset? LastContactedAt { get; set; }
}

/// <summary>An editable message template (PRD §9), one row per <see cref="TemplateKind"/>.
/// Body holds {{merge_field}} tokens resolved per company/person at draft time.</summary>
public class Template
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public TemplateKind Kind { get; set; }
    public string? Subject { get; set; } // email kinds only
    public string Body { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>One logged outreach action (PRD §6.5/§9). No auto-send in M4 — the user sends/copies/
/// calls, then logs it here, which advances the company stage and the contact's reach-out status.
/// Snapshot captures exactly what was drafted at the time.</summary>
public class Outreach
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Company? Company { get; set; }
    public Guid? PersonId { get; set; }
    public Person? Person { get; set; }

    public OutreachChannel Channel { get; set; }
    public OutreachKind Kind { get; set; } = OutreachKind.Cold;
    public OutreachLogStatus Status { get; set; } = OutreachLogStatus.Drafted;

    public string? Subject { get; set; }
    public string? Body { get; set; }
    public string? Outcome { get; set; }       // phone-call result / free note
    public string? SnapshotJson { get; set; }   // exact payload at log time

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? SentAt { get; set; }
}
