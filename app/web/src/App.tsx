import { useCallback, useEffect, useState } from "react";
import type { Company, CompanyCreate, CompanyStage, CompanyUpdate, Contact, Stats } from "./types";
import { api, toUpdate } from "./api";
import { Icon, STAGES } from "./lib/ui";
import { StatsBar } from "./components/StatsBar";
import { CompanyTable } from "./components/CompanyTable";
import { AddCompanyForm } from "./components/AddCompanyForm";
import { ImportPanel } from "./components/ImportPanel";
import { SettingsPanel } from "./components/SettingsPanel";

function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [panel, setPanel] = useState<"none" | "add" | "import" | "settings">("none");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [cs, st] = await Promise.all([
        api.companies({ stage: stageFilter || undefined, ready: readyOnly || undefined }),
        api.stats(),
      ]);
      setCompanies(cs);
      setStats(st);
    } catch (e) {
      setError(`Can't reach the API. Is it running on :5099?  (${e})`);
    }
  }, [stageFilter, readyOnly]);

  useEffect(() => { load(); }, [load]);

  const createCompany = async (dto: CompanyCreate) => { await api.createCompany(dto); setPanel("none"); load(); };
  const changeStage = async (c: Company, stage: CompanyStage) => { await api.updateCompany(c.id, toUpdate(c, { stage })); load(); };
  const deleteCompany = async (id: string) => { if (confirm("Delete this company?")) { await api.deleteCompany(id); load(); } };
  const addContact = async (companyId: string, contact: Contact) => { await api.addContact(companyId, contact); load(); };
  const deleteContact = async (id: string) => { await api.deleteContact(id); load(); };
  const importCapture = async (rows: unknown[]) => { const r = await api.importCapture(rows); load(); return r; };
  const updateFields = async (c: Company, over: Partial<CompanyUpdate>) => { await api.updateCompany(c.id, toUpdate(c, over)); load(); };
  const enrich = async (c: Company, website?: string) => { const r = await api.enrich(c.id, website); load(); return r; };
  const findWebsite = (c: Company) => api.findWebsite(c.id);
  const findLinkedin = async (c: Company) => { const r = await api.findLinkedin(c.id); load(); return r; };

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <Icon name="briefcase-search" className="text-indigo-500" />
              APL Search Assistant
            </h1>
            <p className="text-sm text-slate-400">Company pipeline · M1</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
              title="Settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              <Icon name="cog" />
            </button>
            <button onClick={() => setPanel(panel === "import" ? "none" : "import")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              <Icon name="linkedin" className="text-[#0a66c2]" /> Import capture
            </button>
            <button onClick={() => setPanel(panel === "add" ? "none" : "add")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Icon name="plus" /> Add company
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            <Icon name="alert-circle" /> {error}
          </div>
        )}

        <div className="mb-4"><StatsBar stats={stats} /></div>

        {panel === "add" && <div className="mb-4"><AddCompanyForm onCreate={createCompany} onClose={() => setPanel("none")} /></div>}
        {panel === "import" && <div className="mb-4"><ImportPanel onImport={importCapture} onClose={() => setPanel("none")} /></div>}
        {panel === "settings" && <div className="mb-4"><SettingsPanel onClose={() => setPanel("none")} onSaved={load} /></div>}

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-400"><Icon name="filter-variant" /> Filter</span>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} className="accent-indigo-600" />
            Ready only (mail + phone)
          </label>
          <span className="ml-auto text-slate-400">{companies.length} shown</span>
        </div>

        <CompanyTable
          companies={companies}
          onChangeStage={changeStage}
          onDelete={deleteCompany}
          onAddContact={addContact}
          onDeleteContact={deleteContact}
          onEnrich={enrich}
          onUpdateFields={updateFields}
          onFindWebsite={findWebsite}
          onFindLinkedin={findLinkedin}
        />
      </div>
    </div>
  );
}

export default App;
