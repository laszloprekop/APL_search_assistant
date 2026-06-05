namespace Api.Models;

public record PersonDto(Guid? Id, string Name, string? Title, string? LinkedInUrl, string? LinkedInHandle, string? Notes);

public record ContactDto(Guid? Id, ContactType Type, string Value, ContactSource Source, Confidence? Confidence);

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
    string? OrgNumber, string? Website, string? LocationLan, string? LocationKommun,
    string? RevenueBand, string? EmployeeCount, string? FinancialNote, string? TechStackGuess, string? Notes,
    bool HasEmail, bool HasPhone, bool ReadyForList,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? EnrichedAt,
    List<PersonDto> Persons, List<ContactDto> Contacts);

/// <summary>One row from the LinkedIn capture extension's JSON export (PRD §6.1).</summary>
public record CaptureRow(
    string? Name, string? Title, string? Company, string? Company_confidence,
    string? Location, string? Lan, string? Linkedin_url, string? Handle, string? Raw_current);

public record ImportResult(int CompaniesCreated, int PersonsAdded, int DuplicatesSkipped, List<Guid> CompanyIds);

public record StatsDto(int Total, int ReadyForList, int Target, Dictionary<string, int> ByStage);

public record EnrichRequest(string? Website);
public record EnrichResponse(CompanyDto Company, bool Ok, int ContactsFound, string? Error, string Message);
