import type {
  Company, CompanyCreate, CompanyUpdate, Contact, ImportResult, Stats,
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

  importCapture: (rows: unknown[]) =>
    http<ImportResult>("/companies/import", { method: "POST", body: JSON.stringify(rows) }),
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
