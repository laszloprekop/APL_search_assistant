import { useEffect, useState } from "react";
import type { LexiconPreview, LexiconSubmission } from "../types";
import { api } from "../api";
import { Icon } from "../lib/ui";

const enc = encodeURIComponent;
const fmt = (iso: string) => new Date(iso).toLocaleString();
const hasMarkers = (s?: string | null) => !!s && /\[\w+\?\]/.test(s);

// M5 (PRD §6.4, no auto-send): generate the ≥15-list, preview the cover email + CSV, send it
// yourself (mailto/Gmail + attach the downloaded CSV), then mark it submitted (snapshotted).
export function LexiconPanel({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<LexiconPreview | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeTable, setIncludeTable] = useState(true);
  const [subs, setSubs] = useState<LexiconSubmission[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const loadSubs = () => api.lexiconSubmissions().then(setSubs);
  useEffect(() => {
    api.lexiconPreview().then((d) => { setP(d); setTo(d.to); setSubject(d.subject ?? ""); setBody(d.body); });
    loadSubs();
  }, []);

  if (!p) return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">Loading…</div>
  );

  const finalBody = includeTable ? `${body}\n\n${p.table}` : body;
  const mailto = `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(finalBody)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(finalBody)}`;
  const enough = p.count >= p.target;

  const downloadCsv = () => {
    const blob = new Blob([p.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lexicon_list.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  };

  const submit = async () => {
    await api.lexiconSubmit({ companyIds: p.companyIds, to, subject: subject || null, body: finalBody, csv: p.csv });
    setMsg("Recorded as submitted ✓");
    loadSubs();
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Icon name="format-list-checks" className="text-indigo-500" /> Lexicon list
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${enough ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {p.count} / {p.target} ready
          </span>
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="close" /></button>
      </div>

      {!enough && (
        <p className="mb-3 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          <Icon name="alert-circle-outline" /> Only {p.count} companies have both a real email and phone.
          The bar is {p.target}; you can still preview/submit, but enrich more first if you can.
        </p>
      )}

      {p.count === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          No companies are list-ready yet. Get email + phone on some companies first.
        </p>
      ) : (
        <>
          <div className="mb-3 max-h-56 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-2 py-1">#</th><th className="px-2 py-1">Företag</th><th className="px-2 py-1">Ort</th>
                  <th className="px-2 py-1">Kontaktperson</th><th className="px-2 py-1">E-post</th><th className="px-2 py-1">Telefon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-1 font-medium text-slate-700">{r.foretag}</td>
                    <td className="px-2 py-1 text-slate-500">{r.ort}</td>
                    <td className="px-2 py-1 text-slate-500">{r.kontaktperson || "—"}{r.titel ? ` · ${r.titel}` : ""}</td>
                    <td className="px-2 py-1 text-slate-500">{r.epost}</td>
                    <td className="px-2 py-1 text-slate-500">{r.telefon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(hasMarkers(subject) || hasMarkers(body)) && (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              <Icon name="alert-circle-outline" /> The cover email has unset fields (<code>[field?]</code>).
              Fill them in Settings → Your details, or edit below.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-slate-500">To
              <input value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm" />
            </label>
            <label className="text-[11px] text-slate-500">Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm" />
            </label>
          </div>
          <label className="mt-2 block text-[11px] text-slate-500">Cover email body
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs leading-relaxed" />
          </label>
          <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={includeTable} onChange={(e) => setIncludeTable(e.target.checked)} className="accent-indigo-600" />
            Append the list as a table in the body (in addition to the CSV attachment)
          </label>

          <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
            <Icon name="information-outline" /> Email can't carry the attachment automatically:
            <b> 1.</b> Download the CSV → <b>2.</b> open the email + attach it → <b>3.</b> send, then mark submitted.
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={downloadCsv}
              className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
              <Icon name="download" /> 1 · Download CSV{downloaded && " ✓"}
            </button>
            <a href={mailto} className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <Icon name="email-fast-outline" /> 2 · Open in email app
            </a>
            <a href={gmail} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <Icon name="gmail" /> Open in Gmail
            </a>
            <button onClick={submit}
              className="ml-auto inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
              <Icon name="check-circle-outline" /> 3 · Mark as submitted
            </button>
            {msg && <span className="text-xs text-emerald-600">{msg}</span>}
          </div>
        </>
      )}

      {subs.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Past submissions</h4>
          <ul className="space-y-1 text-xs text-slate-500">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Icon name="history" className="text-slate-300" />
                {fmt(s.sentAt ?? s.createdAt)} · {s.companyCount} companies
                <button onClick={async () => { if (confirm("Remove this submission record?")) { await api.deleteLexiconSubmission(s.id); loadSubs(); } }}
                  className="text-slate-300 hover:text-rose-500" title="Remove record"><Icon name="close" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
