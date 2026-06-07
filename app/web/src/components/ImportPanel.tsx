import { useMemo, useState } from "react";
import type { Company, ImportResult, SheetImportRow } from "../types";
import { Icon } from "../lib/ui";
import { SHEET_FORMATS, parseTsv, toTsv, type SheetFormat } from "../lib/sheets";

// The LinkedIn capture (extension JSON) is import-only; the sheet formats round-trip via TSV.
type Source =
  | { kind: "linkedin"; label: string; description: string }
  | { kind: "sheet"; fmt: SheetFormat };

const LINKEDIN: Source = {
  kind: "linkedin",
  label: "LinkedIn capture (JSON)",
  description: "Paste the “Copy JSON” output from the APL Capture browser extension. Import only.",
};
const SOURCES: Source[] = [LINKEDIN, ...SHEET_FORMATS.map((fmt) => ({ kind: "sheet", fmt }) as Source)];

const srcLabel = (s: Source) => (s.kind === "linkedin" ? s.label : s.fmt.label);
const srcDesc = (s: Source) => (s.kind === "linkedin" ? s.description : s.fmt.description);

export function ImportPanel({
  companies, onImportCapture, onImportSheet, onClose,
}: {
  companies: Company[];
  onImportCapture: (rows: unknown[]) => Promise<ImportResult>;
  onImportSheet: (rows: SheetImportRow[]) => Promise<ImportResult>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [tab, setTab] = useState<"import" | "export">("import");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Export preview (TSV) for the selected sheet format over the currently-shown companies.
  const exportTsv = useMemo(() => {
    if (source?.kind !== "sheet") return "";
    return toTsv(source.fmt.columns, source.fmt.build(companies));
  }, [source, companies]);

  const pick = (s: Source) => {
    setSource(s);
    setTab("import");
    setText(""); setError(null); setResult(null); setCopied(false);
  };

  const runImport = async () => {
    setError(null); setResult(null);
    if (!text.trim()) { setError("Nothing to import — paste your data first."); return; }
    setBusy(true);
    try {
      if (source?.kind === "linkedin") {
        let rows: unknown;
        try { rows = JSON.parse(text); } catch { setError("That isn't valid JSON. Use the extension's “Copy JSON” button."); return; }
        if (!Array.isArray(rows)) { setError("Expected a JSON array of capture rows."); return; }
        setResult(await onImportCapture(rows));
      } else if (source?.kind === "sheet") {
        const rows = source.fmt.parse(parseTsv(text));
        if (rows.length === 0) { setError("No rows found. Paste the sheet rows (with or without the header) — tab-separated, as copied from the spreadsheet."); return; }
        setResult(await onImportSheet(rows));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportTsv);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't access the clipboard — select the text and copy it manually.");
    }
  };

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="swap-vertical" className="text-brand" /> Import / Export
        </h3>
        <button onClick={onClose} className="opacity-50 hover:opacity-100"><Icon name="close" /></button>
      </div>

      {/* Menu of formats */}
      <div className="grid gap-2 sm:grid-cols-3">
        {SOURCES.map((s) => {
          const active = source && srcLabel(source) === srcLabel(s);
          return (
            <button key={srcLabel(s)} onClick={() => pick(s)}
              className={`rounded-xl p-2.5 text-left transition ${active ? "bg-accent/40" : "bg-input hover:bg-accent/20"}`}>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-brand">
                <Icon name={s.kind === "linkedin" ? "linkedin" : "table"} className={s.kind === "linkedin" ? "text-linkedin" : "text-brand"} />
                {srcLabel(s)}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">{srcDesc(s)}</p>
            </button>
          );
        })}
      </div>

      {source && (
        <div className="mt-4">
          {/* Import / Export tabs (LinkedIn JSON is import-only) */}
          {source.kind === "sheet" && (
            <div className="mb-3 inline-flex rounded-xl bg-input p-0.5 text-sm">
              {(["import", "export"] as const).map((t) => (
                <button key={t} onClick={() => { setTab(t); setError(null); setResult(null); }}
                  className={`rounded-lg px-3 py-1 font-medium capitalize ${tab === t ? "bg-accent text-brand" : "text-muted hover:text-brand"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {tab === "import" ? (
            <>
              <p className="mb-2 text-xs text-muted">
                {source.kind === "linkedin"
                  ? "Paste the Copy JSON output from the APL Capture extension."
                  : "Copy the rows from the spreadsheet (Ctrl/Cmd-C) and paste below — tab-separated. The header row is optional; instruction rows above it are ignored."}
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={source.kind === "linkedin" ? '[{"name":"…","company":"…","handle":"…", …}]' : "Paste spreadsheet rows here…"}
                className="w-full rounded-xl bg-input p-2 font-sans text-xs text-brand focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
              {error && <p className="mt-2 text-xs text-danger"><Icon name="alert-circle" /> {error}</p>}
              {result && (
                <p className="mt-2 text-xs text-success">
                  <Icon name="check-circle" /> {result.companiesCreated} companies created · {result.personsAdded} persons added · {result.duplicatesSkipped} skipped
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
                <button onClick={runImport} disabled={busy} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50">
                  <Icon name="import" /> {busy ? "Importing…" : "Import"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">
                {companies.length} companies in the current view, as <strong>{srcLabel(source)}</strong> rows.
                Copy and paste straight into the spreadsheet.
              </p>
              <textarea
                readOnly
                value={exportTsv}
                rows={7}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl bg-input p-2 font-mono text-[11px] text-brand focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
              {error && <p className="mt-2 text-xs text-danger"><Icon name="alert-circle" /> {error}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
                <button onClick={copyExport} className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-brand hover:bg-accent-strong">
                  <Icon name={copied ? "check" : "content-copy"} /> {copied ? "Copied" : "Copy TSV"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
