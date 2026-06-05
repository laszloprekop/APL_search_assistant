// Mirrors the API DTOs (app/Api/Models/Dtos.cs). Enums serialize as strings.

export type CompanyStage =
  | "Identified" | "Enriched" | "Ready" | "Contacted" | "Replied"
  | "ClosedPositive" | "ClosedNegative";
export type CompanySource = "LinkedIn" | "Allabolag" | "Manual";
export type EnrichmentStatus = "Pending" | "Enriched" | "NeedsManualLookup";
export type ContactType = "Email" | "Phone";
export type ContactSource = "Website" | "Switchboard" | "LinkedIn" | "Manual";
export type Confidence = "High" | "Medium" | "Low";

export interface Person {
  id?: string;
  name: string;
  title?: string | null;
  linkedInUrl?: string | null;
  linkedInHandle?: string | null;
  notes?: string | null;
}

export interface Contact {
  id?: string;
  type: ContactType;
  value: string;
  source: ContactSource;
  confidence?: Confidence | null;
}

export interface Company {
  id: string;
  name: string;
  stage: CompanyStage;
  enrichmentStatus: EnrichmentStatus;
  source: CompanySource;
  orgNumber?: string | null;
  website?: string | null;
  locationLan?: string | null;
  locationKommun?: string | null;
  revenueBand?: string | null;
  employeeCount?: string | null;
  financialNote?: string | null;
  techStackGuess?: string | null;
  notes?: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  readyForList: boolean;
  createdAt: string;
  updatedAt: string;
  enrichedAt?: string | null;
  persons: Person[];
  contacts: Contact[];
}

export interface CompanyCreate {
  name: string;
  source: CompanySource;
  locationLan?: string | null;
  locationKommun?: string | null;
  website?: string | null;
  notes?: string | null;
  contacts?: Contact[];
}

export interface CompanyUpdate {
  name: string;
  stage: CompanyStage;
  enrichmentStatus: EnrichmentStatus;
  source: CompanySource;
  orgNumber?: string | null;
  website?: string | null;
  locationLan?: string | null;
  locationKommun?: string | null;
  revenueBand?: string | null;
  employeeCount?: string | null;
  financialNote?: string | null;
  techStackGuess?: string | null;
  notes?: string | null;
}

export interface Stats {
  total: number;
  readyForList: number;
  target: number;
  byStage: Record<string, number>;
}

export interface ImportResult {
  companiesCreated: number;
  personsAdded: number;
  duplicatesSkipped: number;
  companyIds: string[];
}

export interface EnrichResponse {
  company: Company;
  ok: boolean;
  contactsFound: number;
  error?: string | null;
  message: string;
}

export type SearchProvider = "none" | "brave" | "google" | "serper";

export interface Settings {
  searchProvider: SearchProvider;
  searchHasApiKey: boolean;
  searchGoogleCseId?: string | null;
}

export interface SettingsUpdate {
  searchProvider?: string;
  searchApiKey?: string;
  searchGoogleCseId?: string | null;
}

export interface SearchStatus {
  provider: string;
  configured: boolean;
}

export interface WebsiteCandidate {
  url: string;
  title: string;
  snippet: string;
  score: number;
  reason: string;
}

export interface FindWebsiteResponse {
  query: string;
  candidates: WebsiteCandidate[];
  error?: string | null;
}
