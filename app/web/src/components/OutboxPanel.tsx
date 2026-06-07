import { useEffect, useState } from "react";
import type { Outreach, OutreachChannel } from "../types";
import { api } from "../api";
import { Icon } from "../lib/ui";

const channelMeta: Record<OutreachChannel, { icon: string; cls: string }> = {
  Email: { icon: "email-outline", cls: "text-brand" },
  Linkedin: { icon: "linkedin", cls: "text-linkedin" },
  Phone: { icon: "phone-outline", cls: "text-success" },
};

const fmt = (iso: string) => new Date(iso).toLocaleString();

// Outbox / activity log (PRD §7): everything you've sent, copied, or logged, newest first.
export function OutboxPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Outreach[] | null>(null);

  const load = () => api.outbox().then(setItems);
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Remove this Outbox entry? (Doesn't change the company's stage.)")) return;
    await api.deleteOutreach(id);
    load();
  };

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-brand">
          <Icon name="tray-full" className="text-brand" /> Outbox
          {items && <span className="text-sm font-normal text-faint">· {items.length}</span>}
        </h3>
        <button onClick={onClose} className="opacity-50 hover:opacity-100"><Icon name="close" /></button>
      </div>

      {items === null ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          Nothing logged yet. Use a company's Outreach card, then mark it sent/logged.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((o) => {
            const m = channelMeta[o.channel];
            return (
              <li key={o.id} className="flex items-start gap-3 py-2 text-sm">
                <Icon name={m.icon} className={`mt-0.5 shrink-0 ${m.cls}`} title={o.channel} />
                <div className="min-w-0 grow">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-brand">{o.companyName}</span>
                    {o.personName && <span className="text-xs text-faint">· {o.personName}</span>}
                    <span className="rounded-lg bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {o.kind === "Followup" ? "follow-up" : o.channel.toLowerCase()} · {o.status.toLowerCase()}
                    </span>
                    <span className="text-[11px] text-faint">{fmt(o.sentAt ?? o.createdAt)}</span>
                  </div>
                  {o.subject && <div className="truncate text-xs text-muted">{o.subject}</div>}
                  {o.outcome && <div className="text-xs text-muted">↳ {o.outcome}</div>}
                </div>
                <button onClick={() => del(o.id)} className="shrink-0 opacity-40 hover:text-danger hover:opacity-100" title="Remove entry">
                  <Icon name="close" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
