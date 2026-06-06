import { useEffect, useState } from "react";
import { api } from "../api";
import type { SearchProvider } from "../types";
import { Icon } from "../lib/ui";

const PROVIDERS: { value: SearchProvider; label: string; help: string; keyUrl?: string }[] = [
  { value: "none", label: "None (manual URLs)", help: "No web search — paste websites by hand." },
  { value: "brave", label: "Brave Search API", help: "~2,000 free queries/month. One API key.", keyUrl: "https://api-dashboard.search.brave.com/" },
  { value: "google", label: "Google Programmable Search", help: "Free 100/day. Needs an API key AND a Search-Engine ID (cx).", keyUrl: "https://developers.google.com/custom-search/v1/introduction" },
  { value: "serper", label: "Serper.dev (Google proxy)", help: "Cheap paid; real Google results.", keyUrl: "https://serper.dev/" },
];

export function SettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState<SearchProvider>("none");
  const [apiKey, setApiKey] = useState("");
  const [cseId, setCseId] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [providerLocked, setProviderLocked] = useState(false);
  const [keyLocked, setKeyLocked] = useState(false);
  const [cseLocked, setCseLocked] = useState(false);

  // "Your details" — feed the {{your_*}} / {{period}} outreach merge fields.
  const [o, setO] = useState({ yourName: "", cvSummary: "", email: "", phone: "", linkedin: "", period: "", area: "" });
  const setOField = (k: keyof typeof o) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setO((prev) => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    api.getSettings().then((s) => {
      setProvider(s.searchProvider);
      setHasKey(s.searchHasApiKey);
      setCseId(s.searchGoogleCseId ?? "");
      setProviderLocked(s.providerFromEnv);
      setKeyLocked(s.apiKeyFromEnv);
      setCseLocked(s.cseIdFromEnv);
    });
    api.getOutreachSettings().then((s) =>
      setO({
        yourName: s.yourName ?? "", cvSummary: s.cvSummary ?? "", email: s.email ?? "",
        phone: s.phone ?? "", linkedin: s.linkedin ?? "", period: s.period ?? "", area: s.area ?? "",
      }));
  }, []);

  const anyLocked = providerLocked || keyLocked || cseLocked;

  const meta = PROVIDERS.find((p) => p.value === provider)!;
  const field = "w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

  const save = async () => {
    const dto: { searchProvider: string; searchGoogleCseId: string | null; searchApiKey?: string } = {
      searchProvider: provider,
      searchGoogleCseId: cseId || null,
    };
    if (apiKey.trim()) dto.searchApiKey = apiKey.trim(); // blank = keep existing key
    await api.putSettings(dto);
    await api.putOutreachSettings(o);
    setApiKey("");
    const s = await api.getSettings();
    setHasKey(s.searchHasApiKey);
    setSavedMsg("Saved ✓");
    onSaved();
    setTimeout(() => setSavedMsg(null), 1500);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Icon name="cog" className="text-indigo-500" /> Settings
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="close" /></button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value as SearchProvider)} disabled={providerLocked} className={field}>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {provider !== "none" && (
          <label className="text-xs text-slate-500">
            API key {hasKey && <span className="text-emerald-600">• set</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={keyLocked}
              placeholder={keyLocked ? "set via env / user-secrets" : hasKey ? "•••••••• (leave blank to keep)" : "paste API key"}
              className={field}
            />
          </label>
        )}

        {provider === "google" && (
          <label className="text-xs text-slate-500 sm:col-span-2">
            Search-Engine ID (cx)
            <input value={cseId} onChange={(e) => setCseId(e.target.value)} disabled={cseLocked} placeholder="e.g. 0123456789abc:xyz" className={field} />
          </label>
        )}
      </div>

      {anyLocked && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          <Icon name="lock" /> Managed via user-secrets / environment — locked fields override the UI.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        {meta.help}{" "}
        {meta.keyUrl && <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Get a key →</a>}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        Keys are stored only in your local (git-ignored) database. Searches use the company name only — never a person's name.
      </p>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
          <Icon name="account-edit" className="text-indigo-500" /> Your details (outreach)
        </h3>
        <p className="mb-2 text-[11px] text-slate-400">
          Fill the <code>{"{{your_*}}"}</code> / <code>{"{{period}}"}</code> merge fields in outreach drafts. Local-only.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Your name
            <input value={o.yourName} onChange={setOField("yourName")} placeholder="Förnamn Efternamn" className={field} />
          </label>
          <label className="text-xs text-slate-500">Praktikperiod
            <input value={o.period} onChange={setOField("period")} placeholder="feb–mar 2026" className={field} />
          </label>
          <label className="text-xs text-slate-500">Email (from-address you'll send with)
            <input value={o.email} onChange={setOField("email")} placeholder="namn@gmail.com" className={field} />
          </label>
          <label className="text-xs text-slate-500">Phone
            <input value={o.phone} onChange={setOField("phone")} placeholder="070-…" className={field} />
          </label>
          <label className="text-xs text-slate-500">LinkedIn URL
            <input value={o.linkedin} onChange={setOField("linkedin")} placeholder="linkedin.com/in/…" className={field} />
          </label>
          <label className="text-xs text-slate-500">Your area / background (for the call pitch)
            <input value={o.area} onChange={setOField("area")} placeholder="backend-utveckling" className={field} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">Experience summary <span className="text-slate-300">({"{{your_experience}}"} — one or two sentences from your CV)</span>
            <textarea value={o.cvSummary} onChange={setOField("cvSummary")} rows={2}
              placeholder="t.ex. backend i C#/.NET, REST-API:er och SQL…"
              className={field + " resize-y"} />
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {savedMsg && <span className="text-xs text-emerald-600">{savedMsg}</span>}
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Close</button>
        <button onClick={save} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          <Icon name="content-save" /> Save
        </button>
      </div>
    </div>
  );
}
