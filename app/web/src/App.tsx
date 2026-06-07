import { useCallback, useEffect, useState } from "react";
import type { Company, CompanyCreate, CompanyStage, CompanyUpdate, Contact, OutreachStatus, SheetImportRow, Stats } from "./types";
import { api, toUpdate } from "./api";
import { Icon, STAGES } from "./lib/ui";
import { StatsBar } from "./components/StatsBar";
import { CompanyTable } from "./components/CompanyTable";
import { AddCompanyForm } from "./components/AddCompanyForm";
import { ImportPanel } from "./components/ImportPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { OutboxPanel } from "./components/OutboxPanel";
import { TemplatesPanel } from "./components/TemplatesPanel";
import { LexiconPanel } from "./components/LexiconPanel";
import { SearchesPanel } from "./components/SearchesPanel";
import { UserGuide } from "./components/UserGuide";

function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [panel, setPanel] = useState<"none" | "add" | "import" | "settings" | "outbox" | "templates" | "lexicon" | "searches">("none");
  const [guideOpen, setGuideOpen] = useState(false);

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

  // Auto-refresh so data the browser extension POSTs shows up without a manual reload:
  // refetch when the app tab regains focus/visibility, plus a slow backstop poll.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const t = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(t);
    };
  }, [load]);

  const createCompany = async (dto: CompanyCreate) => { await api.createCompany(dto); setPanel("none"); load(); };
  const changeStage = async (c: Company, stage: CompanyStage) => { await api.updateCompany(c.id, toUpdate(c, { stage })); load(); };
  const deleteCompany = async (id: string) => { if (confirm("Delete this company?")) { await api.deleteCompany(id); load(); } };
  const addContact = async (companyId: string, contact: Contact) => { await api.addContact(companyId, contact); load(); };
  const deleteContact = async (id: string) => { await api.deleteContact(id); load(); };
  const importCapture = async (rows: unknown[]) => { const r = await api.importCapture(rows); load(); return r; };
  const importSheet = async (rows: SheetImportRow[]) => { const r = await api.importSheet(rows); load(); return r; };
  const exportAll = () => api.exportAll();
  const importNative = async (rows: unknown[]) => { const r = await api.importNative(rows); load(); return r; };
  const updateFields = async (c: Company, over: Partial<CompanyUpdate>) => { await api.updateCompany(c.id, toUpdate(c, over)); load(); };
  const enrich = async (c: Company, website?: string) => { const r = await api.enrich(c.id, website); load(); return r; };
  const findWebsite = (c: Company) => api.findWebsite(c.id);
  const findLinkedin = async (c: Company) => { const r = await api.findLinkedin(c.id); load(); return r; };
  const setContactStatus = async (id: string, status: OutreachStatus) => { await api.setContactStatus(id, status); load(); };
  const enrichPerson = async (personId: string) => { const r = await api.enrichPerson(personId); load(); return r; };

  return (
    <div className="min-h-full bg-page text-brand">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-brand">
              <Icon name="briefcase-search" className="text-brand" />
              APL Search Assistant
            </h1>
            <p className="text-sm text-muted"></p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setGuideOpen(true)}
              title="User guide — how the app works, step by step"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="book-open-page-variant" className="text-brand" /> Guide
            </button>
            <button onClick={() => setPanel(panel === "searches" ? "none" : "searches")}
              title="Saved LinkedIn Boolean searches — click to open one"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="linkedin" className="text-linkedin" /> Boolean Search
            </button>
            <button onClick={() => setPanel(panel === "lexicon" ? "none" : "lexicon")}
              title="Generate + submit the ≥15 Lexicon list"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="format-list-checks" className="text-brand" /> Lexicon list
            </button>
            <button onClick={() => setPanel(panel === "outbox" ? "none" : "outbox")}
              title="Outbox — outreach activity log"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="tray-full" /> Outbox
            </button>
            <button onClick={() => setPanel(panel === "templates" ? "none" : "templates")}
              title="Outreach templates"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="text-box-multiple-outline" />
            </button>
            <button onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
              title="Settings"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="cog" />
            </button>
            <button onClick={() => setPanel(panel === "import" ? "none" : "import")}
              title="Import / export — LinkedIn capture JSON and company/contact spreadsheets"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
              <Icon name="swap-vertical" className="text-brand" /> Import / Export
            </button>
            <button onClick={() => setPanel(panel === "add" ? "none" : "add")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
              <Icon name="plus" /> Add company
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            <Icon name="alert-circle" /> {error}
          </div>
        )}

        <div className="mb-4"><StatsBar stats={stats} /></div>

        {panel === "add" && <div className="mb-4"><AddCompanyForm onCreate={createCompany} onClose={() => setPanel("none")} /></div>}
        {panel === "import" && <div className="mb-4"><ImportPanel companies={companies} onImportCapture={importCapture} onImportSheet={importSheet} onExportAll={exportAll} onImportNative={importNative} onClose={() => setPanel("none")} /></div>}
        {panel === "settings" && <div className="mb-4"><SettingsPanel onClose={() => setPanel("none")} onSaved={load} /></div>}
        {panel === "outbox" && <div className="mb-4"><OutboxPanel onClose={() => setPanel("none")} /></div>}
        {panel === "templates" && <div className="mb-4"><TemplatesPanel onClose={() => setPanel("none")} /></div>}
        {panel === "lexicon" && <div className="mb-4"><LexiconPanel onClose={() => setPanel("none")} /></div>}
        {panel === "searches" && <div className="mb-4"><SearchesPanel onClose={() => setPanel("none")} /></div>}

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted"><Icon name="filter-variant" /> Filter</span>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl bg-input px-2 py-1 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent/60">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} className="accent-brand" />
            Ready only (mail + phone)
          </label>
          <span className="ml-auto text-muted">{companies.length} shown</span>
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
          onSetContactStatus={setContactStatus}
          onEnrichPerson={enrichPerson}
          onRefresh={load}
        />
      </div>

      {guideOpen && <UserGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

export default App;
