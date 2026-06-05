import type { CompanyStage, CompanySource, EnrichmentStatus } from "../types";

// Material Design Icon (https://pictogrammers.com/library/mdi/). Usage: <Icon name="domain" />
export function Icon({ name, className, title }: { name: string; className?: string; title?: string }) {
  return <i className={`mdi mdi-${name} ${className ?? ""}`} title={title} aria-hidden="true" />;
}

export const STAGES: { value: CompanyStage; label: string; badge: string }[] = [
  { value: "Identified", label: "Identified", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
  { value: "Enriched", label: "Enriched", badge: "bg-sky-100 text-sky-700 ring-sky-200" },
  { value: "Ready", label: "Ready", badge: "bg-indigo-100 text-indigo-700 ring-indigo-200" },
  { value: "Contacted", label: "Contacted", badge: "bg-amber-100 text-amber-700 ring-amber-200" },
  { value: "Replied", label: "Replied", badge: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  { value: "ClosedPositive", label: "Closed ✓", badge: "bg-green-100 text-green-700 ring-green-200" },
  { value: "ClosedNegative", label: "Closed ✗", badge: "bg-rose-100 text-rose-600 ring-rose-200" },
];
export const stageMeta = (s: CompanyStage) => STAGES.find((x) => x.value === s) ?? STAGES[0];

export const SOURCES: CompanySource[] = ["LinkedIn", "Allabolag", "Manual"];
export const sourceIcon = (s: CompanySource) =>
  s === "LinkedIn" ? "linkedin" : s === "Allabolag" ? "office-building-marker" : "pencil";

export const ENRICHMENT: { value: EnrichmentStatus; label: string; icon: string; cls: string }[] = [
  { value: "Pending", label: "Pending", icon: "clock-outline", cls: "text-slate-400" },
  { value: "Enriched", label: "Enriched", icon: "check-decagram", cls: "text-emerald-500" },
  { value: "NeedsManualLookup", label: "Needs lookup", icon: "phone-alert", cls: "text-amber-500" },
];
export const enrichmentMeta = (s: EnrichmentStatus) =>
  ENRICHMENT.find((x) => x.value === s) ?? ENRICHMENT[0];
