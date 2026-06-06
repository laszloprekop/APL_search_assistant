namespace Api.Models;

/// <summary>Coarse company stage (PRD §6.3). Auto-advanced from outreach events in later milestones.</summary>
public enum CompanyStage
{
    Identified,
    Enriched,
    Ready,
    Contacted,
    Replied,
    ClosedPositive,
    ClosedNegative,
}

/// <summary>How the company entered the pipeline (PRD §6.1 dual discovery).</summary>
public enum CompanySource
{
    LinkedIn,
    Allabolag,
    Manual,
}

/// <summary>Enrichment state (PRD §6.2). Degrades to NeedsManualLookup on fetch/parse failure.</summary>
public enum EnrichmentStatus
{
    Pending,
    Enriched,
    NeedsManualLookup,
}

public enum ContactType
{
    Email,
    Phone,
    LinkedIn, // a person's LinkedIn profile URL — a trackable reach-out point like email/phone
}

public enum ContactSource
{
    Website,
    Switchboard,
    LinkedIn,
    Manual,
    Guessed, // generic pattern (info@/kontakt@) — unverified; excluded from the ≥15 list
}

public enum Confidence
{
    High,
    Medium,
    Low,
}

/// <summary>Per-contact outreach state (PRD §6.3). Each email/phone is reached + tracked
/// independently — it's a "reach-out" entity. Guessed addresses can be marked Bounced.</summary>
public enum OutreachStatus
{
    NotContacted,
    Contacted,
    Replied,
    Bounced,
    Closed,
}
