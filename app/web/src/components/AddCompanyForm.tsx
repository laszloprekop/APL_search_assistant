import { useState, type FormEvent } from "react";
import type { CompanyCreate, CompanySource, Contact } from "../types";
import { Icon, SOURCES } from "../lib/ui";

export function AddCompanyForm({ onCreate, onClose }: { onCreate: (dto: CompanyCreate) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<CompanySource>("Manual");
  const [lan, setLan] = useState("Norrbotten");
  const [kommun, setKommun] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const contacts: Contact[] = [];
    if (email.trim()) contacts.push({ type: "Email", value: email.trim(), source: "Manual" });
    if (phone.trim()) contacts.push({ type: "Phone", value: phone.trim(), source: "Manual" });
    onCreate({
      name: name.trim(), source,
      locationLan: lan || null, locationKommun: kommun || null, website: website || null,
      contacts,
    });
  };

  const field = "w-full rounded-xl bg-surface-hover px-3 py-1.5 text-sm text-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60";

  return (
    <form onSubmit={submit} className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="domain-plus" className="text-brand" /> Add company
        </h3>
        <button type="button" onClick={onClose} className="text-faint hover:text-brand"><Icon name="close" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-muted">
          Company name *
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus required />
        </label>
        <label className="text-xs text-muted">
          Source
          <select value={source} onChange={(e) => setSource(e.target.value as CompanySource)} className={field}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Län
          <input value={lan} onChange={(e) => setLan(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-muted">
          Kommun / ort
          <input value={kommun} onChange={(e) => setKommun(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-muted">
          Website
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className={field} placeholder="https://…" />
        </label>
        <label className="text-xs text-muted">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="kontakt@…" />
        </label>
        <label className="text-xs text-muted">
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="0920-…" />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Cancel</button>
        <button type="submit" className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
          <Icon name="content-save" /> Save
        </button>
      </div>
    </form>
  );
}
