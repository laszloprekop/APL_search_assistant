import { useState } from "react";
import type { Company, OutreachChannel, OutreachDraft, OutreachKind } from "../types";
import { api } from "../api";
import { Icon } from "../lib/ui";

const CHANNELS: { ch: OutreachChannel; label: string; icon: string; iconCls: string }[] = [
  { ch: "Email", label: "Email draft", icon: "email-outline", iconCls: "text-brand" },
  { ch: "Linkedin", label: "LinkedIn message", icon: "linkedin", iconCls: "text-linkedin" },
  { ch: "Phone", label: "Phone script", icon: "phone-outline", iconCls: "text-success" },
];

const enc = encodeURIComponent;
const hasMarkers = (s?: string | null) => !!s && /\[\w+\?\]/.test(s);
const fieldCls = "rounded-xl bg-surface-hover px-1.5 py-1 text-xs text-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60";
const inputCls = "mt-0.5 w-full rounded-xl bg-surface-hover px-2 py-1 text-sm text-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60";
const ghostBtn = "inline-flex items-center gap-1 rounded-xl bg-surface-hover px-3 py-1.5 text-xs font-medium text-brand hover:bg-border";

// Per-company outreach (PRD §6.5, no auto-send): pick a channel + optional person, preview the
// merge-filled draft, then send it yourself (mailto/Gmail), copy it (LinkedIn), or follow the
// script (Phone) — and log it so the pipeline stage advances.
export function OutreachCard({ company, onLogged }: { company: Company; onLogged: () => void }) {
  const [target, setTarget] = useState(""); // personId, or "" = company / generic
  const [kind, setKind] = useState<OutreachKind>("Cold");
  const [busy, setBusy] = useState<OutreachChannel | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Open modal state
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("");
  const [logged, setLogged] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const open = async (ch: OutreachChannel) => {
    setBusy(ch); setErr(null);
    try {
      const d = await api.outreachDraft(company.id, { channel: ch, kind, personId: target || null });
      setDraft(d); setTo(d.to ?? ""); setSubject(d.subject ?? ""); setBody(d.body);
      setOutcome(""); setLogged(false); setCopyMsg(null);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(null); }
  };

  const close = () => setDraft(null);

  const log = async () => {
    if (!draft) return;
    await api.logOutreach(company.id, {
      channel: draft.channel,
      kind: draft.channel === "Email" ? kind : "Cold",
      personId: target || null,
      subject: subject || null, body, outcome: outcome || null,
    });
    setLogged(true);
    onLogged();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setCopyMsg("Copied ✓"); }
    catch { setCopyMsg("Copy failed — select & copy manually."); }
    setTimeout(() => setCopyMsg(null), 1600);
  };

  const mailto = `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`;
  const ch = draft?.channel;

  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1 text-xs font-bold uppercase text-brand">
          <Icon name="send-outline" /> Outreach
        </h4>
        {company.persons.length > 0 && (
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            title="Who to address (blank = company / generic)" className={fieldCls}>
            <option value="">Company (generic)</option>
            {company.persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value as OutreachKind)}
          title="Email template: first touch or follow-up" className={fieldCls}>
          <option value="Cold">Cold (first)</option>
          <option value="Followup">Follow-up</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <button key={c.ch} onClick={() => open(c.ch)} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-brand hover:bg-border disabled:opacity-50">
            <Icon name={c.icon} className={c.iconCls} /> {busy === c.ch ? "…" : c.label}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <p className="mt-2 text-[11px] text-muted">
        Drafts merge your details (Settings) + company data. Nothing sends automatically — you send,
        copy, or call, then mark it logged.
      </p>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-2xl bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold text-brand">
                <Icon name={CHANNELS.find((c) => c.ch === ch)!.icon} />
                {ch === "Email" ? "Email draft" : ch === "Linkedin" ? "LinkedIn message" : "Phone script"}
                <span className="text-sm font-normal text-muted">· {company.name}</span>
              </h3>
              <button onClick={close} className="text-faint hover:text-brand"><Icon name="close" /></button>
            </div>

            {(hasMarkers(body) || hasMarkers(subject)) && (
              <p className="mb-2 rounded-lg border-l-4 border-warning bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                <Icon name="alert-circle-outline" /> Some fields are unset (shown as <code>[field?]</code>).
                Fill them in Settings → Your details, or edit below before sending.
              </p>
            )}

            {ch === "Email" && (
              <label className="block text-[11px] text-muted">To
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@…" className={inputCls} />
              </label>
            )}
            {ch === "Email" && (
              <label className="mt-2 block text-[11px] text-muted">Subject
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
              </label>
            )}
            <label className="mt-2 block text-[11px] text-muted">
              {ch === "Phone" ? "Script (follow during the call)" : "Body"}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={ch === "Phone" ? 14 : 12}
                className="mt-0.5 w-full whitespace-pre-wrap rounded-xl bg-surface-hover px-2 py-1.5 font-mono text-xs leading-relaxed text-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60" />
            </label>

            {ch === "Phone" && (
              <label className="mt-2 block text-[11px] text-muted">Call outcome (logged)
                <input value={outcome} onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g. reached växeln, got dev-lead's email + direct number" className={inputCls} />
              </label>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ch === "Email" && (<>
                <a href={mailto} className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover">
                  <Icon name="email-fast-outline" /> Open in email app
                </a>
                <a href={gmail} target="_blank" rel="noreferrer" className={ghostBtn}>
                  <Icon name="gmail" /> Open in Gmail
                </a>
              </>)}
              {ch === "Linkedin" && (<>
                <button onClick={copy} className="inline-flex items-center gap-1 rounded-xl bg-linkedin px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  <Icon name="content-copy" /> Copy message
                </button>
                {to && <a href={to} target="_blank" rel="noreferrer" className={ghostBtn}>
                  <Icon name="open-in-new" /> Open profile
                </a>}
                {copyMsg && <span className="text-xs font-medium text-success">{copyMsg}</span>}
              </>)}
              {ch === "Phone" && to && (
                <a href={`tel:${to}`} className="inline-flex items-center gap-1 rounded-xl bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90">
                  <Icon name="phone" /> Call {to}
                </a>
              )}

              <button onClick={log} disabled={logged}
                className="ml-auto inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-brand hover:bg-accent-strong disabled:opacity-50">
                <Icon name={logged ? "check" : "check-circle-outline"} />
                {logged ? "Logged" : ch === "Phone" ? "Log call" : "Mark as sent"}
              </button>
              <button onClick={close} className="rounded-xl px-3 py-1.5 text-xs text-muted hover:bg-surface-hover">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
