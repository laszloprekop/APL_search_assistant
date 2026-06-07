// Native app-data backup (PRD §6.1 backup/share). The app's own graph — every field, every person,
// every contact — round-tripped for backup and sharing. JSON is lossless; CSV (which Excel opens
// natively) and TSV are a flat one-row-per-contact projection that re-imports cleanly through the
// same merge endpoint. All three parse back to the BackupCompany shape the API's /companies/
// import-native endpoint accepts.

import type { Company, Contact } from "../types";
import { parseCsv, parseTsv, records, toCsv, toTsv } from "./sheets";

export type NativeFormatId = "json" | "csv" | "tsv";

export interface NativeFormat {
  id: NativeFormatId;
  label: string;
  ext: string;
  mime: string;
  lossless: boolean;
  serialize: (companies: Company[]) => string;
  parse: (text: string) => unknown[];
}

// Flat columns for CSV / TSV: company fields repeat on every row; one row per contact (a person with
// no contacts, or a company with no persons, still gets a row with the contact cells blank).
const COLUMNS = [
  "Name", "Stage", "EnrichmentStatus", "Source", "OrgNumber", "Website", "CompanyLinkedIn",
  "Lan", "Kommun", "RevenueBand", "EmployeeCount", "FinancialNote", "TechStackGuess", "Notes",
  "PersonName", "PersonTitle", "PersonLinkedIn", "PersonNotes",
  "ContactType", "ContactValue", "ContactSource", "OutreachStatus",
];

// ---- tabular projection (CSV / TSV) ---------------------------------------

function host(url?: string | null): string | null {
  if (!url) return null;
  let s = url.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (s.startsWith("www.")) s = s.slice(4);
  const cut = s.search(/[/?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.replace(/\.+$/, "");
  return s || null;
}

function buildGrid(companies: Company[]): string[][] {
  const out: string[][] = [];
  const cc = (ct?: Contact) => (ct ? [ct.type, ct.value, ct.source, ct.outreachStatus ?? ""] : ["", "", "", ""]);
  for (const c of companies) {
    const base = [
      c.name, c.stage, c.enrichmentStatus, c.source, c.orgNumber ?? "", c.website ?? "", c.linkedInUrl ?? "",
      c.locationLan ?? "", c.locationKommun ?? "", c.revenueBand ?? "", c.employeeCount ?? "",
      c.financialNote ?? "", c.techStackGuess ?? "", c.notes ?? "",
    ];
    const before = out.length;
    for (const p of c.persons) {
      const pc = [p.name, p.title ?? "", p.linkedInUrl ?? "", p.notes ?? ""];
      const cts = p.contacts ?? [];
      if (cts.length) for (const ct of cts) out.push([...base, ...pc, ...cc(ct)]);
      else out.push([...base, ...pc, ...cc()]);
    }
    for (const ct of c.contacts) out.push([...base, "", "", "", "", ...cc(ct)]);
    if (out.length === before) out.push([...base, "", "", "", "", ...cc()]);
  }
  return out;
}

interface NContact { type: string; value: string; source: string; outreachStatus?: string }
interface NPerson { name: string; title: string | null; linkedInUrl: string | null; notes: string | null; contacts: NContact[] }
interface NCompany {
  name: string; stage?: string; enrichmentStatus?: string; source?: string;
  orgNumber: string | null; website: string | null; linkedInUrl: string | null;
  locationLan: string | null; locationKommun: string | null; revenueBand: string | null;
  employeeCount: string | null; financialNote: string | null; techStackGuess: string | null; notes: string | null;
  persons: NPerson[]; contacts: NContact[];
}

function parseGrid(grid: string[][]): NCompany[] {
  const byKey = new Map<string, NCompany>();
  const personDir = new Map<string, Map<string, NPerson>>();
  const order: string[] = [];

  for (const r of records(grid, COLUMNS)) {
    const name = (r["Name"] ?? "").trim();
    if (!name) continue;
    const key = host(r["Website"]) ?? name.toLowerCase();

    let co = byKey.get(key);
    if (!co) {
      co = {
        name,
        stage: r["Stage"] || undefined,
        enrichmentStatus: r["EnrichmentStatus"] || undefined,
        source: r["Source"] || undefined,
        orgNumber: r["OrgNumber"] || null,
        website: r["Website"] || null,
        linkedInUrl: r["CompanyLinkedIn"] || null,
        locationLan: r["Lan"] || null,
        locationKommun: r["Kommun"] || null,
        revenueBand: r["RevenueBand"] || null,
        employeeCount: r["EmployeeCount"] || null,
        financialNote: r["FinancialNote"] || null,
        techStackGuess: r["TechStackGuess"] || null,
        notes: r["Notes"] || null,
        persons: [],
        contacts: [],
      };
      byKey.set(key, co);
      personDir.set(key, new Map());
      order.push(key);
    }

    const value = (r["ContactValue"] ?? "").trim();
    const contact: NContact | null = value
      ? { type: r["ContactType"] || "Email", value, source: r["ContactSource"] || "Manual", outreachStatus: r["OutreachStatus"] || undefined }
      : null;

    const pname = (r["PersonName"] ?? "").trim();
    if (pname) {
      const dir = personDir.get(key)!;
      let p = dir.get(pname.toLowerCase());
      if (!p) {
        p = { name: pname, title: r["PersonTitle"] || null, linkedInUrl: r["PersonLinkedIn"] || null, notes: r["PersonNotes"] || null, contacts: [] };
        dir.set(pname.toLowerCase(), p);
        co.persons.push(p);
      }
      if (contact) p.contacts.push(contact);
    } else if (contact) {
      co.contacts.push(contact);
    }
  }

  return order.map((k) => byKey.get(k)!);
}

// ---- formats --------------------------------------------------------------

export const NATIVE_FORMATS: NativeFormat[] = [
  {
    id: "json", label: "JSON", ext: "json", mime: "application/json", lossless: true,
    serialize: (cs) => JSON.stringify(cs, null, 2),
    parse: (text) => {
      const v = JSON.parse(text);
      if (!Array.isArray(v)) throw new Error("Expected a JSON array of companies.");
      return v;
    },
  },
  {
    id: "csv", label: "CSV (Excel)", ext: "csv", mime: "text/csv", lossless: false,
    serialize: (cs) => toCsv(COLUMNS, buildGrid(cs)),
    parse: (text) => parseGrid(parseCsv(text)),
  },
  {
    id: "tsv", label: "TSV", ext: "tsv", mime: "text/tab-separated-values", lossless: false,
    serialize: (cs) => toTsv(COLUMNS, buildGrid(cs)),
    parse: (text) => parseGrid(parseTsv(text)),
  },
];

// Pick a format from pasted/loaded text: JSON if it opens as an array/object, else TSV when the
// first line has a tab, else CSV. Lets import accept any of the three without a manual selector.
export function detectNativeFormat(text: string): NativeFormat {
  const t = text.replace(/^﻿/, "").trimStart();
  if (t.startsWith("[") || t.startsWith("{")) return NATIVE_FORMATS[0];
  const firstLine = t.split("\n", 1)[0] ?? "";
  return firstLine.includes("\t") ? NATIVE_FORMATS[2] : NATIVE_FORMATS[1];
}
