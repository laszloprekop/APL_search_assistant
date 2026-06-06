import { Fragment, useEffect, useRef, useState } from "react";
import type {
  Company, CompanyStage, CompanyUpdate, Contact, ContactType, ContactSource, EnrichResponse,
  FindLinkedinResponse, FindWebsiteResponse, WebsiteCandidate,
} from "../types";
import { Icon, STAGES, stageMeta, sourceIcon, enrichmentMeta } from "../lib/ui";

interface Props {
  companies: Company[];
  onChangeStage: (c: Company, stage: CompanyStage) => void;
  onDelete: (id: string) => void;
  onAddContact: (companyId: string, contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onEnrich: (c: Company, website?: string) => Promise<EnrichResponse>;
  onUpdateFields: (c: Company, over: Partial<CompanyUpdate>) => void;
  onFindWebsite: (c: Company) => Promise<FindWebsiteResponse>;
  onFindLinkedin: (c: Company) => Promise<FindLinkedinResponse>;
}

export function CompanyTable({
  companies, onChangeStage, onDelete, onAddContact, onDeleteContact, onEnrich, onUpdateFields, onFindWebsite, onFindLinkedin,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // The collapsed-row "next step" chip opens the row AND auto-runs the matching action
  // (Find website when there's no site yet; Find contacts when there's a site but no
  // email/phone). EnrichmentSection consumes `pending` on mount and clears it.
  const [pending, setPending] = useState<Record<string, "website" | "contacts">>({});
  const startNext = (c: Company) => {
    const kind: "website" | "contacts" = c.website ? "contacts" : "website";
    setOpen((p) => new Set(p).add(c.id));
    setPending((p) => ({ ...p, [c.id]: kind }));
  };
  const clearPending = (id: string) => setPending((p) => { const n = { ...p }; delete n[id]; return n; });

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
                <tr className={open.has(c.id) ? "bg-indigo-50/60" : "hover:bg-slate-50/70"}>
                  <td className="px-3 py-2 align-top">
                    <button onClick={() => toggle(c.id)} className="text-slate-400 hover:text-slate-700">
                      <Icon name={open.has(c.id) ? "chevron-down" : "chevron-right"} />
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Icon name={sourceIcon(c.source)} className="text-slate-400" title={c.source} />
                      {c.linkedInUrl ? (
                        <a href={c.linkedInUrl} target="_blank" rel="noreferrer"
                          className="hover:text-[#0a66c2] hover:underline"
                          title="Open LinkedIn company page">
                          {c.name}
                        </a>
                      ) : (
                        <a
                          href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name)}`}
                          target="_blank" rel="noreferrer"
                          className="decoration-dotted underline-offset-2 hover:text-[#0a66c2] hover:underline"
                          title="Search this company on LinkedIn (capture its page to save the exact URL)">
                          {c.name}
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {[c.locationKommun, c.locationLan].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {!c.readyForList && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startNext(c); }}
                        className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                        title="Next manual step for this company">
                        <Icon name={c.website ? "card-account-mail" : "magnify"} />
                        {c.website ? "Find contacts" : "Find website"}
                      </button>
                    )}
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
                  <tr className="bg-indigo-50/60">
                    <td></td>
                    <td colSpan={7} className="px-3 py-3">
                      <ExpandedRow c={c} onAddContact={onAddContact} onDeleteContact={onDeleteContact} onEnrich={onEnrich} onUpdateFields={onUpdateFields} onFindWebsite={onFindWebsite} onFindLinkedin={onFindLinkedin} autoRun={pending[c.id] ?? null} onAutoRan={() => clearPending(c.id)} />
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
  c, onAddContact, onDeleteContact, onEnrich, onUpdateFields, onFindWebsite, onFindLinkedin, autoRun, onAutoRan,
}: {
  c: Company;
  onAddContact: (companyId: string, contact: Contact) => void;
  onDeleteContact: (id: string) => void;
  onEnrich: (c: Company, website?: string) => Promise<EnrichResponse>;
  onUpdateFields: (c: Company, over: Partial<CompanyUpdate>) => void;
  onFindWebsite: (c: Company) => Promise<FindWebsiteResponse>;
  onFindLinkedin: (c: Company) => Promise<FindLinkedinResponse>;
  autoRun: "website" | "contacts" | null;
  onAutoRan: () => void;
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
    <div className="space-y-4">
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
              <Icon name={ct.type === "Email" ? "email" : "phone"} className={ct.source === "Guessed" ? "text-amber-500" : "text-slate-400"} />
              <span className={ct.source === "Guessed" ? "text-amber-700" : undefined}>{ct.value}</span>
              {ct.source === "Guessed" ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                  title="Generic pattern — unverified. Call to confirm; not counted toward the ≥15 list.">
                  guessed · verify
                </span>
              ) : ct.sourceUrl ? (
                <a href={ct.sourceUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-500 hover:underline" title={`Extracted from ${ct.sourceUrl}`}>
                  ({ct.source} <Icon name="open-in-new" className="text-[10px]" />)
                </a>
              ) : (
                <span className="text-xs text-slate-400">({ct.source})</span>
              )}
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
      <EnrichmentSection c={c} onEnrich={onEnrich} onUpdateFields={onUpdateFields} onFindWebsite={onFindWebsite} onFindLinkedin={onFindLinkedin} autoRun={autoRun} onAutoRan={onAutoRan} />
    </div>
  );
}

function EnrichmentSection({
  c, onEnrich, onUpdateFields, onFindWebsite, onFindLinkedin, autoRun, onAutoRan,
}: {
  c: Company;
  onEnrich: (c: Company, website?: string) => Promise<EnrichResponse>;
  onUpdateFields: (c: Company, over: Partial<CompanyUpdate>) => void;
  onFindWebsite: (c: Company) => Promise<FindWebsiteResponse>;
  onFindLinkedin: (c: Company) => Promise<FindLinkedinResponse>;
  autoRun: "website" | "contacts" | null;
  onAutoRan: () => void;
}) {
  const [website, setWebsite] = useState(c.website ?? "");
  const [orgNumber, setOrgNumber] = useState(c.orgNumber ?? "");
  const [lan, setLan] = useState(c.locationLan ?? "");
  const [kommun, setKommun] = useState(c.locationKommun ?? "");
  const [revenueBand, setRevenueBand] = useState(c.revenueBand ?? "");
  const [employeeCount, setEmployeeCount] = useState(c.employeeCount ?? "");
  const [financialNote, setFinancialNote] = useState(c.financialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cands, setCands] = useState<WebsiteCandidate[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const find = async () => {
    setBusy(true); setSearchMsg(null); setCands(null);
    try {
      // Resolve the canonical LinkedIn company page (stores it → name links to /about/) and
      // search for the website, in one click.
      const [w, li] = await Promise.all([onFindWebsite(c), onFindLinkedin(c)]);
      const notes: string[] = [];
      if (li.linkedInUrl) notes.push("LinkedIn page found — the company name now opens its About page.");
      if (w.error) notes.push(w.error);
      else if (w.candidates.length === 0) notes.push(`No website match for "${w.query}" — open the LinkedIn About page to grab it.`);
      else setCands(w.candidates);
      setSearchMsg(notes.join(" ") || null);
    } catch (e) { setSearchMsg(String(e)); }
    finally { setBusy(false); }
  };

  const pick = async (url: string) => {
    setWebsite(url); setCands(null); setBusy(true); setMsg(null);
    try { setMsg((await onEnrich(c, url)).message); }
    catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  };

  const em = enrichmentMeta(c.enrichmentStatus);
  const inp = "w-full rounded border border-slate-200 px-2 py-1 text-xs";

  const save = () =>
    onUpdateFields(c, {
      website: website || null, orgNumber: orgNumber || null,
      locationLan: lan || null, locationKommun: kommun || null,
      revenueBand: revenueBand || null, employeeCount: employeeCount || null,
      financialNote: financialNote || null,
    });

  const auto = async () => {
    let url = website.trim();
    if (!url) {
      const v = window.prompt("Company website URL to fetch contacts from:");
      if (!v) return;
      url = v.trim();
      setWebsite(url);
    }
    setBusy(true);
    setMsg(null);
    try { setMsg((await onEnrich(c, url)).message); }
    catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  };

  // Triggered by the collapsed-row "next step" chip: run the right action exactly once.
  // The ref guard survives React StrictMode's dev mount→cleanup→mount, which would
  // otherwise fire two concurrent enrich calls that race past the server-side dedupe.
  const ranFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRun) return;
    const key = `${c.id}:${autoRun}`;
    if (ranFor.current === key) return;
    ranFor.current = key;
    (autoRun === "website" ? find : auto)();
    onAutoRan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
          <Icon name="database-search" /> Enrichment
        </h4>
        <span className={`inline-flex items-center gap-1 text-xs ${em.cls}`}>
          <Icon name={em.icon} /> {em.label}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={find} disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            <Icon name="magnify" /> {busy ? "Searching…" : "Find online"}
          </button>
          <button onClick={auto} disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Icon name="web" /> {busy ? "Fetching…" : "Auto-enrich from website"}
          </button>
        </div>
      </div>
      {searchMsg && <p className="mb-2 text-xs text-amber-600">{searchMsg}</p>}
      {cands && cands.length > 0 && (
        <div className="mb-2 space-y-1">
          <p className="text-[11px] text-slate-400">Click the link to preview, “Use” to set it + enrich:</p>
          {cands.map((cand) => (
            <div key={cand.url}
              className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
              <a href={cand.url} target="_blank" rel="noreferrer" title="Preview in new tab"
                className="flex items-center gap-1 font-medium text-indigo-600 hover:underline">
                <Icon name="open-in-new" className="text-slate-400" />
                {cand.url.replace(/^https?:\/\//, "")}
              </a>
              <span className="truncate text-slate-400">{cand.title}</span>
              {cand.reason && <span className="ml-auto shrink-0 text-[10px] text-emerald-600">{cand.reason}</span>}
              <button onClick={() => pick(cand.url)}
                className="shrink-0 rounded bg-indigo-600 px-2 py-0.5 font-medium text-white hover:bg-indigo-700">
                Use
              </button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="mb-2 text-xs text-slate-500">{msg}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-slate-500 sm:col-span-3">
          <span className="flex items-center gap-1">
            Website
            {c.website && (
              <a href={c.website} target="_blank" rel="noreferrer" title="Open saved website"
                className="text-indigo-500 hover:underline">
                <Icon name="open-in-new" /> open
              </a>
            )}
          </span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Org.nr
          <input value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Län
          <input value={lan} onChange={(e) => setLan(e.target.value)} className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Kommun
          <input value={kommun} onChange={(e) => setKommun(e.target.value)} className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Revenue band
          <input value={revenueBand} onChange={(e) => setRevenueBand(e.target.value)} className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Employees
          <input value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} className={inp} />
        </label>
        <label className="text-[11px] text-slate-500">Financial note
          <input value={financialNote} onChange={(e) => setFinancialNote(e.target.value)} className={inp} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={save} className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700">
          <Icon name="content-save" /> Save fields
        </button>
        <a
          href={`https://www.allabolag.se/bransch-sök?q=${encodeURIComponent(c.name)}`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          title="Open this company on allabolag (Cloudflare blocks auto-fetch — copy org.nr / financials into the fields above)">
          <Icon name="open-in-new" /> Open on allabolag
        </a>
        <span className="text-[11px] text-slate-400">copy org.nr / financials into the fields above.</span>
      </div>
    </div>
  );
}
