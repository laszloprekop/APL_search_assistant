namespace Api.Models;

public record PersonDto(Guid? Id, string Name, string? Title, string? LinkedInUrl, string? LinkedInHandle, string? Notes,
    List<ContactDto>? Contacts = null);

public record ContactDto(Guid? Id, ContactType Type, string Value, ContactSource Source, Confidence? Confidence,
    string? SourceUrl = null, Guid? PersonId = null,
    OutreachStatus OutreachStatus = OutreachStatus.NotContacted, DateTimeOffset? LastContactedAt = null);

public record ContactStatusUpdateDto(OutreachStatus OutreachStatus);

public record CompanyCreateDto(
    string Name,
    CompanySource Source,
    string? OrgNumber, string? Website, string? LocationLan, string? LocationKommun,
    string? RevenueBand, string? EmployeeCount, string? FinancialNote, string? TechStackGuess,
    string? Notes,
    List<PersonDto>? Persons,
    List<ContactDto>? Contacts);

public record CompanyUpdateDto(
    string Name,
    CompanyStage Stage, EnrichmentStatus EnrichmentStatus, CompanySource Source,
    string? OrgNumber, string? Website, string? LocationLan, string? LocationKommun,
    string? RevenueBand, string? EmployeeCount, string? FinancialNote, string? TechStackGuess,
    string? Notes);

public record CompanyDto(
    Guid Id, string Name, CompanyStage Stage, EnrichmentStatus EnrichmentStatus, CompanySource Source,
    string? OrgNumber, string? Website, string? LinkedInUrl, string? LocationLan, string? LocationKommun,
    string? RevenueBand, string? EmployeeCount, string? FinancialNote, string? TechStackGuess, string? Notes,
    bool HasEmail, bool HasPhone, bool ReadyForList,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? EnrichedAt,
    List<PersonDto> Persons, List<ContactDto> Contacts);

/// <summary>One row from the LinkedIn capture extension's JSON export (PRD §6.1).</summary>
public record CaptureRow(
    string? Name, string? Title, string? Company, string? Company_confidence,
    string? Location, string? Lan, string? Linkedin_url, string? Handle, string? Raw_current,
    // Filled by the enrichment wizard (Docs/enrichment-wizard.md): the canonical company
    // identity + authoritative LinkedIn website. Absent on a plain people-capture send.
    string? Company_id = null, string? Company_linkedin_url = null,
    string? Website = null, string? Website_source = null);

public record ImportResult(int CompaniesCreated, int PersonsAdded, int DuplicatesSkipped, List<Guid> CompanyIds);

/// <summary>A normalized spreadsheet row (PRD §6.1 manual import). The web client maps each
/// supported sheet layout (discovery list, per-person contact tracker, …) onto this shape, then
/// posts a batch. Upserted by website host / name; persons deduped by name on the company;
/// contacts deduped by (type, value). Existing non-empty company fields are never overwritten.</summary>
public record SheetImportRow(
    string? Name, string? Website, string? OrgNumber,
    string? LocationKommun, string? LocationLan, string? Notes, string? TechStackGuess,
    string? PersonName, string? PersonTitle, string? PersonNotes,
    string? Email, string? Phone, bool PhoneIsSwitchboard = false, string? LinkedInUrl = null);

/// <summary>Company-level data captured from a LinkedIn company About page (PRD §6.1).</summary>
public record CompanyImportRow(
    string Name, string? Website, string? Industry, string? CompanySize,
    string? Headquarters, string? LinkedinUrl);

public record CompanyUpsertResult(int Created, int Updated, List<Guid> CompanyIds);

public record StatsDto(int Total, int ReadyForList, int Target, Dictionary<string, int> ByStage);

public record EnrichRequest(string? Website);
public record EnrichResponse(CompanyDto Company, bool Ok, int ContactsFound, string? Error, string Message);

// allabolag detail-page capture (extension) applied to a chosen company (Docs §6.2).
public record AllabolagApplyDto(
    string? OrgNumber, string? Phone, string? Kommun, string? Lan,
    string? RevenueBand, string? EmployeeCount, string? FinancialNote);
public record AllabolagApplyResult(CompanyDto Company, bool PhoneAdded, string Message);

// Search-to-website (PRD §6.2 enhancement). Provider chosen at runtime in Settings.
public record WebsiteCandidate(string Url, string Title, string Snippet, int Score, string Reason);
public record FindWebsiteResponse(string Query, List<WebsiteCandidate> Candidates, string? Error);
public record SettingsDto(
    string SearchProvider, bool SearchHasApiKey, string? SearchGoogleCseId,
    bool ProviderFromEnv, bool ApiKeyFromEnv, bool CseIdFromEnv);
public record SettingsUpdateDto(string? SearchProvider, string? SearchApiKey, string? SearchGoogleCseId);

// ---- M4: templates + 3-channel outreach (no auto-send) ----
public record TemplateDto(TemplateKind Kind, string? Subject, string Body, DateTimeOffset UpdatedAt);
public record TemplateUpdateDto(string? Subject, string? Body);

// "Your details" that feed the {{your_*}} / {{period}} merge fields. Stored in the local DB;
// the user's own data (not secrets), so returned to the UI as-is.
public record OutreachSettingsDto(
    string? YourName, string? CvSummary, string? Email, string? Phone, string? Linkedin,
    string? Period, string? Area);

public record OutreachDraftRequest(OutreachChannel Channel, OutreachKind? Kind, Guid? PersonId);
public record OutreachDraftDto(OutreachChannel Channel, string? To, string? Subject, string Body);

public record OutreachLogDto(
    OutreachChannel Channel, OutreachKind Kind, Guid? PersonId,
    string? Subject, string? Body, string? Outcome);

public record OutreachDto(
    Guid Id, Guid CompanyId, string CompanyName, Guid? PersonId, string? PersonName,
    OutreachChannel Channel, OutreachKind Kind, OutreachLogStatus Status,
    string? Subject, string? Body, string? Outcome, DateTimeOffset CreatedAt, DateTimeOffset? SentAt);

// ---- M5: Lexicon ≥15-list submission (PRD §6.4) ----
public record LexiconRowDto(string Foretag, string? Ort, string? Kontaktperson, string? Titel, string? Epost, string? Telefon);
public record LexiconPreviewDto(
    string To, string? Subject, string Body, string Table, string Csv,
    List<LexiconRowDto> Rows, List<Guid> CompanyIds, int Count, int Target);
public record LexiconSubmitDto(List<Guid> CompanyIds, string To, string? Subject, string Body, string Csv);
public record LexiconSubmissionDto(Guid Id, DateTimeOffset CreatedAt, DateTimeOffset? SentAt, int CompanyCount);
