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
  const field = "w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";

  const save = async () => {
    const t = await api.updateTemplate(sel, { subject: meta.hasSubject ? subject : null, body });
    setTpls((prev) => prev.map((x) => (x.kind === sel ? t : x)));
    setMsg("Saved ✓");
    setTimeout(() => setMsg(null), 1500);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Icon name="text-box-edit-outline" className="text-indigo-500" /> Templates
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="close" /></button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setSel(k.kind)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${sel === k.kind ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            {k.label}
          </button>
        ))}
      </div>

      {meta.hasSubject && (
        <label className="mb-2 block text-xs text-slate-500">Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
      )}
      <label className="block text-xs text-slate-500">Body
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
          className={field + " resize-y font-mono text-xs leading-relaxed"} />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-400">Merge fields:</span>
        {MERGE_FIELDS.map((f) => (
          <code key={f} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{f}</code>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Close</button>
        <button onClick={save} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          <Icon name="content-save" /> Save template
        </button>
      </div>
    </div>
  );
}
