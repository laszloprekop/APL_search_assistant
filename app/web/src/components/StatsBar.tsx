import type { Stats } from "../types";
import { Icon, stageMeta, STAGES } from "../lib/ui";

export function StatsBar({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const pct = Math.min(100, Math.round((stats.readyForList / stats.target) * 100));
  const done = stats.readyForList >= stats.target;

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <Icon name="format-list-checks" className="text-brand" />
          <span className="text-2xl font-semibold text-brand">
            {stats.readyForList}
          </span>
          <span className="text-muted">/ {stats.target} hosts ready</span>
          <span className="text-xs text-faint">(mail + phone)</span>
        </div>
        <div className="flex items-baseline gap-2 text-muted">
          <Icon name="domain" className="opacity-50" />
          <span className="font-medium text-brand">{stats.total}</span> companies
        </div>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-brand ring-1 ring-accent-strong">
            <Icon name="check-circle" /> Target met — generate the Lexicon list
          </span>
        )}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full rounded-full transition-all ${done ? "bg-accent-strong" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {STAGES.map((s) => {
          const n = stats.byStage[s.value] ?? 0;
          if (!n) return null;
          return (
            <span
              key={s.value}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${stageMeta(s.value).badge}`}
            >
              {s.label} <span className="opacity-60">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
