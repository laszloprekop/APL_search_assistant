// Spreadsheet import/export (PRD §6.1). Each supported sheet layout is described once here as a
// SheetFormat: its column order (for export), a `parse` that maps pasted rows → normalized
// SheetImportRow[] (posted to /companies/import-sheet), and a `build` that turns the app's
// companies into rows for copy-paste back into the sheet. Clipboard format is TSV — what Google
// Sheets puts on the clipboard when you copy a range, and what pastes back cleanly.

import type { Company, ContactType, Person, SheetImportRow } from "../types";

// ---- TSV (Google Sheets clipboard dialect) --------------------------------
// Tab-delimited, newline-separated; a cell containing a tab, newline, or quote is wrapped in
// double quotes with embedded quotes doubled (same quoting CSV uses, but with a tab delimiter).

export function parseTsv(text: string): string[][] {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === "\t") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

export function toTsv(header: string[], rows: string[][]): string {
  const esc = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map((v) => esc(v ?? "")).join("\t")).join("\n");
}

// ---- field helpers --------------------------------------------------------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function firstEmail(s?: string): string | undefined {
  const m = s?.match(EMAIL_RE);
  return m ? m[0] : undefined;
}

// "0771-19 19 95 (vx)" / "tel:+46703706515" / "info@x.se (info + växel nr)" → a phone string +
// whether it's a switchboard. Drops the "tel:" scheme and any trailing parenthetical note.
function cleanPhone(s?: string): { phone?: string; switchboard: boolean } {
  if (!s) return { switchboard: false };
  const switchboard = /\bv(?:x|äxel)\b/i.test(s);
  let v = s.replace(/^\s*tel:/i, "").replace(/\(.*?\)/g, "").trim();
  if (!/\d/.test(v)) return { switchboard };
  return { phone: v || undefined, switchboard };
}

// A free-text "contact" cell (sheet A) that may hold either an email or a phone.
function splitContact(s?: string): { email?: string; phone?: string; switchboard: boolean } {
  if (!s) return { switchboard: false };
  const email = firstEmail(s);
  if (email) return { email, switchboard: false };
  return cleanPhone(s);
}

// Read a usable contact value off a person (preferred) or the company (generic fallback),
// skipping low-confidence Guessed addresses — the same rule the ≥15 counter uses.
function contactValue(c: Company, p: Person | undefined, type: ContactType): string {
  const ok = (x: { type: ContactType; source: string; value: string }) =>
    x.type === type && x.source !== "Guessed" && !!x.value;
  const own = p?.contacts?.find(ok);
  if (own) return own.value;
  return c.contacts.find(ok)?.value ?? "";
}

const joinLines = (parts: (string | undefined | null | false)[]) =>
  parts.filter((x): x is string => !!x && x.trim() !== "").join("\n");

// ---- format definitions ---------------------------------------------------

export interface SheetFormat {
  id: string;
  label: string;
  description: string;
  columns: string[];
  parse: (grid: string[][]) => SheetImportRow[];
  build: (companies: Company[]) => string[][];
}

// Turn a parsed grid into column-keyed records: find the header row (first row matching ≥2 of the
// known column names — this skips any merged instruction rows above it), then read by name. If no
// header is found we fall back to positional order.
function records(grid: string[][], columns: string[]): Record<string, string>[] {
  const norm = (s: string) => (s ?? "").trim().toLowerCase();
  const wanted = columns.map(norm);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const hits = grid[i].map(norm).filter((c) => c && wanted.includes(c)).length;
    if (hits >= 2) { headerIdx = i; break; }
  }
  const idxOf: Record<string, number> =
    headerIdx >= 0
      ? Object.fromEntries(columns.map((col) => [col, grid[headerIdx].map(norm).indexOf(norm(col))]))
      : Object.fromEntries(columns.map((col, i) => [col, i]));
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    const rec: Record<string, string> = {};
    for (const col of columns) {
      const idx = idxOf[col];
      rec[col] = idx >= 0 ? (row[idx] ?? "").trim() : "";
    }
    out.push(rec);
  }
  return out;
}

// Sheet A — company discovery list (Swedish). One row per company; loose "Kontakt-info" cell.
const DISCOVERY: SheetFormat = {
  id: "discovery",
  label: "Company discovery list",
  description: "Företag · Typ · Detaljer · Hemsida · Kontakt-person · Kontakt-info · Status · Sökdatum · Anteckningar · Stad — one row per company.",
  columns: ["Företag", "Typ", "Detaljer", "Hemsida", "Kontakt-person", "Kontakt-info", "Status", "Sökdatum", "Anteckningar", "Stad"],
  parse: (grid) =>
    records(grid, DISCOVERY.columns)
      .map((r): SheetImportRow => {
        const ci = splitContact(r["Kontakt-info"]);
        return {
          name: r["Företag"],
          website: r["Hemsida"] || null,
          locationKommun: r["Stad"] || null,
          notes: joinLines([
            r["Typ"] && `Typ: ${r["Typ"]}`,
            r["Detaljer"],
            r["Status"] && `Status: ${r["Status"]}`,
            r["Sökdatum"] && `Sökdatum: ${r["Sökdatum"]}`,
            r["Anteckningar"],
          ]) || null,
          personName: r["Kontakt-person"] || null,
          email: ci.email || null,
          phone: ci.phone || null,
          phoneIsSwitchboard: ci.switchboard,
        };
      })
      .filter((r) => !!r.name),
  build: (companies) =>
    companies.map((c) => {
      const p = c.persons[0];
      return [
        c.name,
        "",
        "",
        c.website ?? "",
        p?.name ?? "",
        contactValue(c, p, "Email") || contactValue(c, p, "Phone"),
        c.stage,
        (c.createdAt ?? "").slice(0, 10),
        c.notes ?? "",
        c.locationKommun ?? "",
      ];
    }),
};

// Sheet B — per-person contact tracker (Swedish). One row per person; "Klar"=x marks rows with the
// full set of details (mapped from the ≥15-ready flag on export); "(vx)" phones are switchboards.
const CONTACTS: SheetFormat = {
  id: "contacts",
  label: "Contact tracker",
  description: "Klar · Företagsnamn · Stad · Namn · Roll · Mail · Telefonnummer · Hemsida · Hittat av · Vad dom säljer · Stack/Tech · Praktiksöklänk — one row per person.",
  columns: ["Klar", "Företagsnamn", "Stad", "Namn", "Roll", "Mail", "Telefonnummer", "Hemsida", "Hittat av", "Vad dom primärt säljer/gör", "Stack/Tech info", "Praktiksöklänk"],
  parse: (grid) =>
    records(grid, CONTACTS.columns)
      .map((r): SheetImportRow => {
        const ph = cleanPhone(r["Telefonnummer"]);
        return {
          name: r["Företagsnamn"],
          website: r["Hemsida"] || null,
          locationKommun: r["Stad"] || null,
          notes: joinLines([
            r["Vad dom primärt säljer/gör"],
            r["Praktiksöklänk"] && `Praktik: ${r["Praktiksöklänk"]}`,
          ]) || null,
          techStackGuess: r["Stack/Tech info"] || null,
          personName: r["Namn"] || null,
          personTitle: r["Roll"] || null,
          personNotes: r["Hittat av"] ? `Hittat av: ${r["Hittat av"]}` : null,
          email: firstEmail(r["Mail"]) || null,
          phone: ph.phone || null,
          phoneIsSwitchboard: ph.switchboard,
        };
      })
      .filter((r) => !!r.name),
  build: (companies) =>
    companies.flatMap((c) => {
      const klar = c.readyForList ? "x" : "";
      const row = (p?: Person): string[] => [
        klar,
        c.name,
        c.locationKommun ?? "",
        p?.name ?? "",
        p?.title ?? "",
        contactValue(c, p, "Email"),
        contactValue(c, p, "Phone"),
        c.website ?? "",
        "",
        c.notes ?? "",
        c.techStackGuess ?? "",
        "",
      ];
      return c.persons.length ? c.persons.map(row) : [row(undefined)];
    }),
};

export const SHEET_FORMATS: SheetFormat[] = [DISCOVERY, CONTACTS];
