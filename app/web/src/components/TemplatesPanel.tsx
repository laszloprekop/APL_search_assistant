import { useEffect, useState } from "react";
import type { Template, TemplateKind } from "../types";
import { api } from "../api";
import { Icon } from "../lib/ui";

const KINDS: { kind: TemplateKind; label: string; hasSubject: boolean }[] = [
  { kind: "ColdEmail", label: "Cold email", hasSubject: true },
  { kind: "Followup", label: "Follow-up email", hasSubject: true },
  { kind: "LinkedinInmail", label: "LinkedIn inMail", hasSubject: false },
  { kind: "CallScript", label: "Phone script", hasSubject: false },
  { kind: "Lexicon", label: "Lexicon cover email", hasSubject: true },
];

const MERGE_FIELDS = [
  "{{name}}", "{{company}}", "{{stack}}", "{{ort}}",
  "{{your_name}}", "{{your_experience}}", "{{your_email}}", "{{your_phone}}",
  "{{your_linkedin}}", "{{period}}", "{{your_area}}",
];

// Edit the five seeded templates (PRD §6.5). {{merge_field}} tokens are filled per company at
// draft time; an unset field shows as [field?] in the draft.
export function TemplatesPanel({ onClose }: { onClose: () => void }) {
  const [tpls, setTpls] = useState<Template[]>([]);
  const [sel, setSel] = useState<TemplateKind>("ColdEmail");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api.templates().then(setTpls); }, []);
  useEffect(() => {
    const t = tpls.find((x) => x.kind === sel);
    if (t) { setSubject(t.subject ?? ""); setBody(t.body); }
  }, [sel, tpls]);

  const meta = KINDS.find((k) => k.kind === sel)!;
  const field = "w-full rounded-xl border border-border px-3 py-1.5 text-sm focus:border-accent-strong focus:outline-none";

  const save = async () => {
    const t = await api.updateTemplate(sel, { subject: meta.hasSubject ? subject : null, body });
    setTpls((prev) => prev.map((x) => (x.kind === sel ? t : x)));
    setMsg("Saved ✓");
    setTimeout(() => setMsg(null), 1500);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="text-box-edit-outline" className="text-brand" /> Templates
        </h3>
        <button onClick={onClose} className="text-faint hover:text-brand"><Icon name="close" /></button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setSel(k.kind)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${sel === k.kind ? "border-accent-strong bg-accent text-brand" : "border-border text-muted hover:bg-surface-hover"}`}>
            {k.label}
          </button>
        ))}
      </div>

      {meta.hasSubject && (
        <label className="mb-2 block text-xs text-muted">Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
      )}
      <label className="block text-xs text-muted">Body
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
          className={field + " resize-y font-mono text-xs leading-relaxed"} />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-faint">Merge fields:</span>
        {MERGE_FIELDS.map((f) => (
          <code key={f} className="rounded-lg bg-surface-hover px-1 py-0.5 text-[10px] text-muted">{f}</code>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {msg && <span className="text-xs text-success">{msg}</span>}
        <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
        <button onClick={save} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
          <Icon name="content-save" /> Save template
        </button>
      </div>
    </div>
  );
}
