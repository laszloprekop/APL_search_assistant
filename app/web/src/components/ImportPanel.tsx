import { useState } from "react";
import type { ImportResult } from "../types";
import { Icon } from "../lib/ui";

export function ImportPanel({
  onImport, onClose,
}: {
  onImport: (rows: unknown[]) => Promise<ImportResult>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setError(null);
    setResult(null);
    let rows: unknown;
    try {
      rows = JSON.parse(text);
    } catch {
      setError("That isn't valid JSON. Use the extension's “Copy JSON” button.");
      return;
    }
    if (!Array.isArray(rows)) {
      setError("Expected a JSON array of capture rows.");
      return;
    }
    setBusy(true);
    try {
      setResult(await onImport(rows));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="import" className="text-brand" /> Import LinkedIn capture
        </h3>
        <button onClick={onClose} className="text-faint hover:text-brand"><Icon name="close" /></button>
      </div>
      <p className="mb-2 text-xs text-muted">
        Paste the <strong>Copy JSON</strong> output from the APL Capture browser extension.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder='[{"name":"…","company":"…","handle":"…", …}]'
        className="w-full rounded-xl bg-surface-hover p-2 font-sans text-xs text-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60"
      />
      {error && <p className="mt-2 text-xs text-danger"><Icon name="alert-circle" /> {error}</p>}
      {result && (
        <p className="mt-2 text-xs text-success">
          <Icon name="check-circle" /> {result.companiesCreated} companies created · {result.personsAdded} persons added · {result.duplicatesSkipped} duplicates skipped
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
        <button onClick={run} disabled={busy} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          <Icon name="import" /> {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
