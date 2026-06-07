import { useEffect, useMemo, useRef, useState } from "react";
import type { Company, ImportResult, SheetImportRow } from "../types";
import { Icon } from "../lib/ui";
import { SHEET_FORMATS, parseTsv, toTsv, type SheetFormat } from "../lib/sheets";
import { NATIVE_FORMATS, detectNativeFormat, type NativeFormatId } from "../lib/native";

// Three kinds of source. LinkedIn capture (extension JSON) is import-only; the sheet formats
// round-trip via TSV over the current view; the native backup round-trips the whole dataset in the
// app's own format (lossless JSON, plus CSV/TSV).
type Source =
  | { kind: "linkedin"; label: string; description: string }
  | { kind: "sheet"; fmt: SheetFormat }
  | { kind: "native"; label: string; description: string };

const LINKEDIN: Source = {
  kind: "linkedin",
  label: "LinkedIn capture (JSON)",
  description: "Paste the “Copy JSON” output from the APL Capture browser extension. Import only.",
};
const NATIVE: Source = {
  kind: "native",
  label: "App data — backup & share",
  description: "The whole dataset in the app's own format. JSON is lossless; CSV (Excel) and TSV are flat tables. Round-trips for backup or handing off.",
};
const SOURCES: Source[] = [LINKEDIN, NATIVE, ...SHEET_FORMATS.map((fmt) => ({ kind: "sheet", fmt }) as Source)];

const srcLabel = (s: Source) => (s.kind === "sheet" ? s.fmt.label : s.label);
const srcDesc = (s: Source) => (s.kind === "sheet" ? s.fmt.description : s.description);
const srcIcon = (s: Source) => (s.kind === "linkedin" ? "linkedin" : s.kind === "native" ? "database-export" : "table");

export function ImportPanel({
  companies, onImportCapture, onImportSheet, onExportAll, onImportNative, onClose,
}: {
  companies: Company[];
  onImportCapture: (rows: unknown[]) => Promise<ImportResult>;
  onImportSheet: (rows: SheetImportRow[]) => Promise<ImportResult>;
  onExportAll: () => Promise<Company[]>;
  onImportNative: (companies: unknown[]) => Promise<ImportResult>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [tab, setTab] = useState<"import" | "export">("import");
  const [text, setText] = useState("");
  const [nativeFmt, setNativeFmt] = useState<NativeFormatId>("json");
  const [allCompanies, setAllCompanies] = useState<Company[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Native export works on the entire dataset (not the filtered view) — fetch it lazily the first
  // time the export tab is shown.
  useEffect(() => {
    if (source?.kind === "native" && tab === "export" && allCompanies === null && !loadingAll) {
      setLoadingAll(true);
      onExportAll().then(setAllCompanies).catch((e) => setError(String(e))).finally(() => setLoadingAll(false));
    }
  }, [source, tab, allCompanies, loadingAll, onExportAll]);

  const exportText = useMemo(() => {
    if (source?.kind === "sheet") return toTsv(source.fmt.columns, source.fmt.build(companies));
    if (source?.kind === "native" && allCompanies) {
      return (NATIVE_FORMATS.find((f) => f.id === nativeFmt) ?? NATIVE_FORMATS[0]).serialize(allCompanies);
    }
    return "";
  }, [source, companies, allCompanies, nativeFmt]);

  const pick = (s: Source) => {
    setSource(s);
    setTab("import");
    setText(""); setError(null); setResult(null); setCopied(false);
  };

  const runImport = async () => {
    setError(null); setResult(null);
    if (!text.trim()) { setError("Nothing to import — paste your data or load a file first."); return; }
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
      } else if (source?.kind === "native") {
        const fmt = detectNativeFormat(text);
        let rows: unknown[];
        try { rows = fmt.parse(text); } catch (e) { setError(`Couldn't read that as ${fmt.label}: ${e}`); return; }
        if (rows.length === 0) { setError("No companies found in that backup."); return; }
        setResult(await onImportNative(rows));
        setAllCompanies(null); // dataset changed — re-fetch on next export
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't access the clipboard — select the text and copy it manually.");
    }
  };

  const downloadExport = () => {
    const fmt = NATIVE_FORMATS.find((f) => f.id === nativeFmt) ?? NATIVE_FORMATS[0];
    const blob = new Blob([exportText], { type: fmt.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apl-backup-${new Date().toISOString().slice(0, 10)}.${fmt.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setResult(null);
    setText(await file.text());
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
      <div className="grid gap-2 sm:grid-cols-2">
        {SOURCES.map((s) => {
          const active = source && srcLabel(source) === srcLabel(s);
          return (
            <button key={srcLabel(s)} onClick={() => pick(s)}
              className={`rounded-xl p-2.5 text-left transition ${active ? "bg-accent/40" : "bg-input hover:bg-accent/20"}`}>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-brand">
                <Icon name={srcIcon(s)} className={s.kind === "linkedin" ? "text-linkedin" : "text-brand"} />
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
          {source.kind !== "linkedin" && (
            <div className="mb-3 inline-flex rounded-xl bg-input p-0.5 text-sm">
              {(["import", "export"] as const).map((t) => (
                <button key={t} onClick={() => { setTab(t); setError(null); setResult(null); }}
                  className={`rounded-lg px-3 py-1 font-medium capitalize ${tab === t ? "bg-accent text-brand" : "text-muted hover:text-brand"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {tab === "import" || source.kind === "linkedin" ? (
            <>
              <p className="mb-2 text-xs text-muted">
                {source.kind === "linkedin"
                  ? "Paste the Copy JSON output from the APL Capture extension."
                  : source.kind === "native"
                    ? "Paste or load a backup (JSON, CSV, or TSV) — the format is detected automatically. Merge import: new companies are added and empty fields filled; nothing already in the app is overwritten."
                    : "Copy the rows from the spreadsheet (Ctrl/Cmd-C) and paste below — tab-separated. The header row is optional; instruction rows above it are ignored."}
              </p>
              {source.kind === "native" && (
                <div className="mb-2">
                  <input ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv"
                    className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
                  <button onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-input px-3 py-1.5 text-sm font-medium text-brand hover:bg-accent/20">
                    <Icon name="file-upload" /> Load file…
                  </button>
                </div>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={
                  source.kind === "linkedin" ? '[{"name":"…","company":"…","handle":"…", …}]'
                    : source.kind === "native" ? "Paste a JSON / CSV / TSV backup here, or use Load file…"
                      : "Paste spreadsheet rows here…"}
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
              {/* Native export: format selector (JSON lossless / CSV / TSV) */}
              {source.kind === "native" && (
                <div className="mb-2 inline-flex rounded-xl bg-input p-0.5 text-sm">
                  {NATIVE_FORMATS.map((f) => (
                    <button key={f.id} onClick={() => setNativeFmt(f.id)}
                      className={`rounded-lg px-3 py-1 font-medium ${nativeFmt === f.id ? "bg-accent text-brand" : "text-muted hover:text-brand"}`}>
                      {f.label}{f.lossless ? " · lossless" : ""}
                    </button>
                  ))}
                </div>
              )}
              <p className="mb-2 text-xs text-muted">
                {source.kind === "native"
                  ? loadingAll
                    ? "Loading the full dataset…"
                    : `${allCompanies?.length ?? 0} companies — the entire dataset. Download a file or copy it.`
                  : <>{companies.length} companies in the current view, as <strong>{srcLabel(source)}</strong> rows. Copy and paste straight into the spreadsheet.</>}
              </p>
              <textarea
                readOnly
                value={exportText}
                rows={7}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl bg-input p-2 font-mono text-[11px] text-brand focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
              {error && <p className="mt-2 text-xs text-danger"><Icon name="alert-circle" /> {error}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
                {source.kind === "native" && (
                  <button onClick={downloadExport} disabled={!exportText}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-input px-3 py-1.5 text-sm font-medium text-brand hover:bg-accent/20 disabled:opacity-50">
                    <Icon name="download" /> Download
                  </button>
                )}
                <button onClick={copyExport} disabled={!exportText}
                  className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-brand hover:bg-accent-strong disabled:opacity-50">
                  <Icon name={copied ? "check" : "content-copy"} /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
