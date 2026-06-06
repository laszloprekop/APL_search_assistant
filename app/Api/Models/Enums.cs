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

/// <summary>The five message kinds (PRD §9). Seeded from Deliverable/01–04 + a followup starter,
/// editable in-app. cold_email/linkedin_inmail/call_script drive M4; lexicon/followup are seeded
/// now, their send-flows arrive in M5/M6.</summary>
public enum TemplateKind
{
    ColdEmail,
    LinkedinInmail,
    CallScript,
    Followup,
    Lexicon,
}

/// <summary>Outreach channel (PRD §6.5). Email opens a prefilled compose window, LinkedIn is
/// copy-to-send, Phone is a script the user follows — none are auto-dispatched in M4.</summary>
public enum OutreachChannel
{
    Email,
    Phone,
    Linkedin,
}

public enum OutreachKind
{
    Cold,
    Followup,
}

/// <summary>Lifecycle of one logged outreach. No auto-send in M4: Email/LinkedIn are marked
/// Sent by the user after they send/copy; Phone is Logged with an outcome after the call.</summary>
public enum OutreachLogStatus
{
    Drafted,
    Sent,
    Logged,
}
