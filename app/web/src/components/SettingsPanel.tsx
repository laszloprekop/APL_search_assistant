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
  const field = "w-full rounded-xl border border-border px-3 py-1.5 text-sm focus:border-accent-strong focus:outline-none disabled:bg-surface-hover disabled:text-faint";

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
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="cog" className="text-brand" /> Settings
        </h3>
        <button onClick={onClose} className="text-faint hover:text-brand"><Icon name="close" /></button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value as SearchProvider)} disabled={providerLocked} className={field}>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {provider !== "none" && (
          <label className="text-xs text-muted">
            API key {hasKey && <span className="text-success">• set</span>}
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
          <label className="text-xs text-muted sm:col-span-2">
            Search-Engine ID (cx)
            <input value={cseId} onChange={(e) => setCseId(e.target.value)} disabled={cseLocked} placeholder="e.g. 0123456789abc:xyz" className={field} />
          </label>
        )}
      </div>

      {anyLocked && (
        <p className="mt-2 rounded-lg bg-warning/10 px-2 py-1 text-[11px] text-warning">
          <Icon name="lock" /> Managed via user-secrets / environment — locked fields override the UI.
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        {meta.help}{" "}
        {meta.keyUrl && <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-brand underline hover:text-brand-hover">Get a key →</a>}
      </p>
      <p className="mt-1 text-[11px] text-faint">
        Keys are stored only in your local (git-ignored) database. Searches use the company name only — never a person's name.
      </p>

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="account-edit" className="text-brand" /> Your details (outreach)
        </h3>
        <p className="mb-2 text-[11px] text-faint">
          Fill the <code>{"{{your_*}}"}</code> / <code>{"{{period}}"}</code> merge fields in outreach drafts. Local-only.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Your name
            <input value={o.yourName} onChange={setOField("yourName")} placeholder="Förnamn Efternamn" className={field} />
          </label>
          <label className="text-xs text-muted">Praktikperiod
            <input value={o.period} onChange={setOField("period")} placeholder="feb–mar 2026" className={field} />
          </label>
          <label className="text-xs text-muted">Email (from-address you'll send with)
            <input value={o.email} onChange={setOField("email")} placeholder="namn@gmail.com" className={field} />
          </label>
          <label className="text-xs text-muted">Phone
            <input value={o.phone} onChange={setOField("phone")} placeholder="070-…" className={field} />
          </label>
          <label className="text-xs text-muted">LinkedIn URL
            <input value={o.linkedin} onChange={setOField("linkedin")} placeholder="linkedin.com/in/…" className={field} />
          </label>
          <label className="text-xs text-muted">Your area / background (for the call pitch)
            <input value={o.area} onChange={setOField("area")} placeholder="backend-utveckling" className={field} />
          </label>
          <label className="text-xs text-muted sm:col-span-2">Experience summary <span className="text-faint">({"{{your_experience}}"} — one or two sentences from your CV)</span>
            <textarea value={o.cvSummary} onChange={setOField("cvSummary")} rows={2}
              placeholder="t.ex. backend i C#/.NET, REST-API:er och SQL…"
              className={field + " resize-y"} />
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {savedMsg && <span className="text-xs text-success">{savedMsg}</span>}
        <button onClick={onClose} className="rounded-xl px-3 py-1.5 text-sm text-muted hover:bg-surface-hover">Close</button>
        <button onClick={save} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
          <Icon name="content-save" /> Save
        </button>
      </div>
    </div>
  );
}
