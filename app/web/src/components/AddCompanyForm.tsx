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

  const field = "w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Icon name="domain-plus" className="text-indigo-500" /> Add company
        </h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="close" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-slate-500">
          Company name *
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus required />
        </label>
        <label className="text-xs text-slate-500">
          Source
          <select value={source} onChange={(e) => setSource(e.target.value as CompanySource)} className={field}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Län
          <input value={lan} onChange={(e) => setLan(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          Kommun / ort
          <input value={kommun} onChange={(e) => setKommun(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-slate-500">
          Website
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className={field} placeholder="https://…" />
        </label>
        <label className="text-xs text-slate-500">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="kontakt@…" />
        </label>
        <label className="text-xs text-slate-500">
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="0920-…" />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          <Icon name="content-save" /> Save
        </button>
      </div>
    </form>
  );
}
