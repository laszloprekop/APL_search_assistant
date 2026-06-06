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
