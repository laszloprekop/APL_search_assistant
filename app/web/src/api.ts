import type {
  Company, CompanyCreate, CompanyUpdate, Contact, EnrichResponse, FindLinkedinResponse,
  FindWebsiteResponse, ImportResult, LexiconPreview, LexiconSubmission, Outreach, OutreachDraft,
  OutreachDraftRequest, OutreachLogRequest, OutreachSettings, OutreachStatus, SavedSearch, SearchStatus,
  Settings, SettingsUpdate, SheetImportRow, Stats, Template, TemplateKind,
} from "./types";

const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => http<{ status: string }>("/health"),
  stats: () => http<Stats>("/stats"),

  companies: (params?: { stage?: string; lan?: string; ready?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.stage) q.set("stage", params.stage);
    if (params?.lan) q.set("lan", params.lan);
    if (params?.ready) q.set("ready", "true");
    const qs = q.toString();
    return http<Company[]>(`/companies${qs ? "?" + qs : ""}`);
  },

  createCompany: (dto: CompanyCreate) =>
    http<Company>("/companies", { method: "POST", body: JSON.stringify(dto) }),

  updateCompany: (id: string, dto: CompanyUpdate) =>
    http<Company>(`/companies/${id}`, { method: "PUT", body: JSON.stringify(dto) }),

  deleteCompany: (id: string) =>
    http<void>(`/companies/${id}`, { method: "DELETE" }),

  addContact: (companyId: string, dto: Contact) =>
    http<Company>(`/companies/${companyId}/contacts`, { method: "POST", body: JSON.stringify(dto) }),

  deleteContact: (id: string) =>
    http<void>(`/contacts/${id}`, { method: "DELETE" }),

  setContactStatus: (id: string, status: OutreachStatus) =>
    http<Company>(`/contacts/${id}/status`, { method: "PATCH", body: JSON.stringify({ outreachStatus: status }) }),

  enrichPerson: (personId: string) =>
    http<EnrichResponse>(`/persons/${personId}/enrich`, { method: "POST" }),

  importCapture: (rows: unknown[]) =>
    http<ImportResult>("/companies/import", { method: "POST", body: JSON.stringify(rows) }),

  importSheet: (rows: SheetImportRow[]) =>
    http<ImportResult>("/companies/import-sheet", { method: "POST", body: JSON.stringify(rows) }),

  // Native backup: the whole dataset (unfiltered) out, the app's own graph back in.
  exportAll: () => http<Company[]>("/export"),
  importNative: (companies: unknown[]) =>
    http<ImportResult>("/companies/import-native", { method: "POST", body: JSON.stringify(companies) }),

  enrich: (id: string, website?: string) =>
    http<EnrichResponse>(`/companies/${id}/enrich`, {
      method: "POST",
      body: JSON.stringify({ website: website ?? null }),
    }),

  findWebsite: (id: string) =>
    http<FindWebsiteResponse>(`/companies/${id}/find-website`, { method: "POST" }),

  findLinkedin: (id: string) =>
    http<FindLinkedinResponse>(`/companies/${id}/find-linkedin`, { method: "POST" }),

  searches: () => http<SavedSearch[]>("/searches"),
  putSearches: (list: SavedSearch[]) =>
    http<SavedSearch[]>("/searches", { method: "PUT", body: JSON.stringify(list) }),

  getSettings: () => http<Settings>("/settings"),
  putSettings: (dto: SettingsUpdate) =>
    http<void>("/settings", { method: "PUT", body: JSON.stringify(dto) }),
  searchStatus: () => http<SearchStatus>("/search/status"),

  // ---- M4: templates + outreach ----
  templates: () => http<Template[]>("/templates"),
  updateTemplate: (kind: TemplateKind, dto: { subject?: string | null; body?: string | null }) =>
    http<Template>(`/templates/${kind}`, { method: "PUT", body: JSON.stringify(dto) }),

  getOutreachSettings: () => http<OutreachSettings>("/settings/outreach"),
  putOutreachSettings: (dto: OutreachSettings) =>
    http<void>("/settings/outreach", { method: "PUT", body: JSON.stringify(dto) }),

  outreachDraft: (companyId: string, req: OutreachDraftRequest) =>
    http<OutreachDraft>(`/companies/${companyId}/outreach/draft`, { method: "POST", body: JSON.stringify(req) }),
  logOutreach: (companyId: string, dto: OutreachLogRequest) =>
    http<Outreach>(`/companies/${companyId}/outreach`, { method: "POST", body: JSON.stringify(dto) }),
  outbox: (companyId?: string) =>
    http<Outreach[]>(`/outreach${companyId ? `?companyId=${companyId}` : ""}`),
  deleteOutreach: (id: string) =>
    http<void>(`/outreach/${id}`, { method: "DELETE" }),

  // ---- M5: Lexicon list ----
  lexiconPreview: () => http<LexiconPreview>("/lexicon/preview"),
  lexiconSubmit: (dto: { companyIds: string[]; to: string; subject?: string | null; body: string; csv: string }) =>
    http<LexiconSubmission>("/lexicon/submit", { method: "POST", body: JSON.stringify(dto) }),
  lexiconSubmissions: () => http<LexiconSubmission[]>("/lexicon/submissions"),
  deleteLexiconSubmission: (id: string) =>
    http<void>(`/lexicon/submissions/${id}`, { method: "DELETE" }),
};

// Build a full update DTO from a company, overriding some fields.
export function toUpdate(c: Company, over: Partial<CompanyUpdate>): CompanyUpdate {
  return {
    name: c.name, stage: c.stage, enrichmentStatus: c.enrichmentStatus, source: c.source,
    orgNumber: c.orgNumber, website: c.website, locationLan: c.locationLan, locationKommun: c.locationKommun,
    revenueBand: c.revenueBand, employeeCount: c.employeeCount, financialNote: c.financialNote,
    techStackGuess: c.techStackGuess, notes: c.notes, ...over,
  };
}
