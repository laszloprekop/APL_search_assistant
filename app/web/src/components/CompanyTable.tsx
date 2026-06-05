import { Fragment, useState } from "react";
import type { Company, CompanyStage, Contact, ContactType, ContactSource } from "../types";
import { Icon, STAGES, stageMeta, sourceIcon, enrichmentMeta } from "../lib/ui";

interface Props {
  companies: Company[];
  onChangeStage: (c: Company, stage: CompanyStage) => void;
  onDelete: (id: string) => void;
  onAddContact: (companyId: string, contact: Contact) => void;
  onDeleteContact: (id: string) => void;
}

export function CompanyTable({ companies, onChangeStage, onDelete, onAddContact, onDeleteContact }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (companies.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
        <Icon name="inbox-outline" className="text-3xl" />
        <p className="mt-2">No companies yet. Add one manually or import a LinkedIn capture.</p>
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-8 px-3 py-2"></th>
            <th className="px-3 py-2">Company</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2 text-center">Channels</th>
            <th className="px-3 py-2 text-center">Enrich</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2 text-center">Ready</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {companies.map((c) => {
            const person = c.persons[0];
            const em = enrichmentMeta(c.enrichmentStatus);
            return (
              <Fragment key={c.id}>
                <tr className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 align-top">
                    <button onClick={() => toggle(c.id)} className="text-slate-400 hover:text-slate-700">
                      <Icon name={open.has(c.id) ? "chevron-down" : "chevron-right"} />
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Icon name={sourceIcon(c.source)} className="text-slate-400" title={c.source} />
                      {c.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {[c.locationKommun, c.locationLan].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {person ? (
                      <div>
                        <div className="text-slate-700">{person.name}</div>
                        <div className="text-xs text-slate-400">{person.title || "—"}</div>
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    {c.persons.length > 1 && (
                      <span className="text-xs text-slate-400">+{c.persons.length - 1} more</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center align-top">
                    <span className="inline-flex gap-1.5">
                      <Icon name="email" className={c.hasEmail ? "text-emerald-500" : "text-slate-200"} />
                      <Icon name="phone" className={c.hasPhone ? "text-emerald-500" : "text-slate-200"} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center align-top" title={em.label}>
                    <Icon name={em.icon} className={em.cls} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      value={c.stage}
                      onChange={(e) => onChangeStage(c, e.target.value as CompanyStage)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${stageMeta(c.stage).badge}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center align-top">
                    {c.readyForList ? (
                      <Icon name="check-circle" className="text-green-500" />
                    ) : (
                      <Icon name="circle-outline" className="text-slate-200" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-slate-300 hover:text-rose-500"
                      title="Delete company"
                    >
                      <Icon name="trash-can-outline" />
                    </button>
                  </td>
                </tr>
                {open.has(c.id) && (
                  <tr className="bg-slate-50/50">
                    <td></td>
                    <td colSpan={7} className="px-3 py-3">
                      <ExpandedRow c={c} onAddContact={onAddContact} onDeleteContact={onDeleteContact} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExpandedRow({
  c, onAddContact, onDeleteContact,
}: {
  c: Company;
  onAddContact: (companyId: string, contact: Contact) => void;
  onDeleteContact: (id: string) => void;
}) {
  const [type, setType] = useState<ContactType>("Email");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<ContactSource>("Website");

  const submit = () => {
    if (!value.trim()) return;
    onAddContact(c.id, { type, value: value.trim(), source });
    setValue("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
          <Icon name="account-multiple" /> Persons
        </h4>
        {c.persons.length === 0 && <p className="text-xs text-slate-400">None</p>}
        <ul className="space-y-1">
          {c.persons.map((p) => (
            <li key={p.id} className="text-sm text-slate-700">
              {p.linkedInUrl ? (
                <a href={p.linkedInUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                  {p.name}
                </a>
              ) : p.name}
              {p.title && <span className="text-slate-400"> · {p.title}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
          <Icon name="card-account-mail" /> Contacts
        </h4>
        <ul className="mb-2 space-y-1">
          {c.contacts.map((ct) => (
            <li key={ct.id} className="flex items-center gap-2 text-sm text-slate-700">
              <Icon name={ct.type === "Email" ? "email" : "phone"} className="text-slate-400" />
              <span>{ct.value}</span>
              <span className="text-xs text-slate-400">({ct.source})</span>
              <button onClick={() => ct.id && onDeleteContact(ct.id)} className="text-slate-300 hover:text-rose-500">
                <Icon name="close" />
              </button>
            </li>
          ))}
          {c.contacts.length === 0 && <li className="text-xs text-slate-400">None</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={type} onChange={(e) => setType(e.target.value as ContactType)} className="rounded border border-slate-200 px-1.5 py-1 text-xs">
            <option value="Email">Email</option>
            <option value="Phone">Phone</option>
          </select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={type === "Email" ? "kontakt@…" : "0920-…"}
            className="grow rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <select value={source} onChange={(e) => setSource(e.target.value as ContactSource)} className="rounded border border-slate-200 px-1.5 py-1 text-xs">
            <option value="Website">Website</option>
            <option value="Switchboard">Switchboard</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Manual">Manual</option>
          </select>
          <button onClick={submit} className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700">
            <Icon name="plus" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
