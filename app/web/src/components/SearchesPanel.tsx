import { useEffect, useRef, useState } from "react";
import type { SavedSearch } from "../types";
import { api } from "../api";
import { Icon } from "../lib/ui";

const PEOPLE_SEARCH = "https://www.linkedin.com/search/results/people/";

// Build the LinkedIn people-search URL from a Boolean query + any saved filter params
// (geoUrn, origin, network, …). Filters are stored as a decoded "k=v&k=v" fragment and
// re-encoded here, so brackets/quotes in geoUrn=["123"] come out correctly.
const linkedinUrl = (s: SavedSearch) => {
  const params = new URLSearchParams();
  if (s.query.trim()) params.set("keywords", s.query.trim());
  if (s.filters?.trim()) {
    for (const [k, v] of new URLSearchParams(s.filters.trim().replace(/^[?&]/, ""))) {
      if (k !== "keywords") params.set(k, v);
    }
  }
  return `${PEOPLE_SEARCH}?${params.toString()}`;
};

// Split a pasted LinkedIn people-search URL into the editable query + the remaining filter
// params (decoded for readability). Returns null if it isn't a LinkedIn search URL.
const splitLinkedinUrl = (text: string): { query: string; filters: string } | null => {
  let u: URL;
  try { u = new URL(text.trim()); } catch { return null; }
  if (!u.hostname.endsWith("linkedin.com") || !u.pathname.includes("/search/results/")) return null;
  const query = u.searchParams.get("keywords") ?? "";
  u.searchParams.delete("keywords");
  const filters = [...u.searchParams.entries()].map(([k, v]) => `${k}=${v}`).join("&");
  return { query, filters };
};

const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Saved LinkedIn Boolean searches. Maintain a list of queries (+ optional location/facet
// filters); click one to open the search page on LinkedIn (then run the extension's capture
// on the results). Persisted in the app DB.
export function SearchesPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<SavedSearch[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastAddedRef = useRef<string | null>(null);

  useEffect(() => { api.searches().then(setItems); }, []);

  const edit = (id: string, patch: Partial<SavedSearch>) => {
    setItems((xs) => xs?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? null);
    setDirty(true);
  };
  const add = () => {
    const id = newId();
    lastAddedRef.current = id;
    setItems((xs) => [...(xs ?? []), { id, label: "", query: "", filters: "" }]);
    setDirty(true);
  };
  const remove = (id: string) => {
    setItems((xs) => xs?.filter((s) => s.id !== id) ?? null);
    setDirty(true);
  };
  const move = (id: string, dir: -1 | 1) => {
    setItems((xs) => {
      if (!xs) return xs;
      const i = xs.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  // Pasting a full LinkedIn search URL into the query box splits it into query + filters.
  const onQueryPaste = (id: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const split = splitLinkedinUrl(e.clipboardData.getData("text"));
    if (!split) return; // not a URL — let the normal paste happen
    e.preventDefault();
    edit(id, split);
  };

  const save = async () => {
    if (!items) return;
    setSaving(true);
    // Drop empty rows (no label and no query) so a stray "Add" doesn't persist.
    const clean = items.filter((s) => s.label.trim() || s.query.trim());
    try {
      const saved = await api.putSearches(clean);
      setItems(saved);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const open = (s: SavedSearch) => {
    if (!s.query.trim() && !s.filters?.trim()) return;
    window.open(linkedinUrl(s), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="linkedin" className="text-linkedin" /> Boolean Search
          {items && <span className="text-sm font-normal text-faint">· {items.length}</span>}
        </h3>
        <button onClick={onClose} className="opacity-50 hover:opacity-100"><Icon name="close" /></button>
      </div>

      <p className="mb-3 text-xs text-muted">
        Keep your LinkedIn Boolean people-searches here. Click <Icon name="linkedin" className="text-linkedin" /> to
        open one on LinkedIn in a new tab — then run the extension's capture on the results.
        <br />
        <span className="text-faint">
          Tip: paste a full LinkedIn search URL into the query box — it splits into the editable
          query + its filters (location/geoUrn, …), which are kept and re-applied on open.
        </span>
      </p>

      {items === null ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          No saved searches yet. Add one — e.g.{" "}
          <code className="text-muted">("Test Manager" OR QA) AND ("Stockholm")</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2 rounded-xl bg-page p-2">
              <div className="flex shrink-0 flex-col pt-1.5">
                <button onClick={() => move(s.id, -1)} disabled={i === 0}
                  className="opacity-40 hover:opacity-100 disabled:invisible" title="Move up">
                  <Icon name="chevron-up" />
                </button>
                <button onClick={() => move(s.id, 1)} disabled={i === items.length - 1}
                  className="opacity-40 hover:opacity-100 disabled:invisible" title="Move down">
                  <Icon name="chevron-down" />
                </button>
              </div>

              <div className="grow space-y-1">
                <input
                  value={s.label}
                  autoFocus={lastAddedRef.current === s.id}
                  onChange={(e) => edit(s.id, { label: e.target.value })}
                  placeholder="Label (e.g. .NET leads · Stockholm)"
                  className="w-full rounded-lg bg-input px-2 py-1 text-sm font-medium text-brand focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <textarea
                  value={s.query}
                  onChange={(e) => edit(s.id, { query: e.target.value })}
                  onPaste={(e) => onQueryPaste(s.id, e)}
                  placeholder={'Boolean query, or paste a full LinkedIn search URL here'}
                  rows={2}
                  className="w-full resize-y rounded-lg bg-input px-2 py-1 font-mono text-xs text-brand focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <div className="flex items-center gap-1">
                  <Icon name="filter-variant" className="shrink-0 text-faint" title="Filters (geoUrn, origin, …)" />
                  <input
                    value={s.filters ?? ""}
                    onChange={(e) => edit(s.id, { filters: e.target.value })}
                    placeholder="Filters — e.g. geoUrn=[&quot;105077040&quot;]&amp;origin=FACETED_SEARCH (optional)"
                    className="w-full rounded-lg bg-input px-2 py-1 font-mono text-[11px] text-muted focus:outline-none focus:ring-2 focus:ring-accent/60"
                  />
                  {s.filters?.trim() && (
                    <button onClick={() => edit(s.id, { filters: "" })}
                      className="shrink-0 opacity-40 hover:text-danger hover:opacity-100" title="Clear filters">
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1 pt-0.5">
                <button onClick={() => open(s)} disabled={!s.query.trim() && !s.filters?.trim()}
                  className="rounded-lg bg-surface px-2 py-1 text-linkedin hover:bg-surface-hover disabled:opacity-30"
                  title="Open this search on LinkedIn">
                  <Icon name="linkedin" />
                </button>
                <button onClick={() => remove(s.id)}
                  className="rounded-lg px-2 py-1 opacity-40 hover:text-danger hover:opacity-100"
                  title="Delete">
                  <Icon name="delete-outline" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={add}
          className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover">
          <Icon name="plus" /> Add search
        </button>
        <button onClick={save} disabled={!dirty || saving}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-40">
          <Icon name="content-save" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}
