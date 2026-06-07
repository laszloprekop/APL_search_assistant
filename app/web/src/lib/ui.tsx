import type { CompanyStage, CompanySource, EnrichmentStatus } from "../types";

// Material Design Icon (https://pictogrammers.com/library/mdi/). Usage: <Icon name="domain" />
export function Icon({ name, className, title }: { name: string; className?: string; title?: string }) {
  return <i className={`mdi mdi-${name} ${className ?? ""}`} title={title} aria-hidden="true" />;
}

export const STAGES: { value: CompanyStage; label: string; badge: string }[] = [
  { value: "Identified", label: "Identified", badge: "bg-surface-hover text-muted ring-border" },
  { value: "Enriched", label: "Enriched", badge: "bg-brand text-white ring-brand" },
  { value: "Ready", label: "Ready", badge: "bg-accent text-brand ring-accent-strong" },
  { value: "Contacted", label: "Contacted", badge: "bg-warning text-white ring-warning" },
  { value: "Replied", label: "Replied", badge: "bg-success text-white ring-success" },
  { value: "ClosedPositive", label: "Closed ✓", badge: "bg-success text-white ring-success" },
  { value: "ClosedNegative", label: "Closed ✗", badge: "bg-danger text-white ring-danger" },
];
export const stageMeta = (s: CompanyStage) => STAGES.find((x) => x.value === s) ?? STAGES[0];

export const SOURCES: CompanySource[] = ["LinkedIn", "Allabolag", "Manual"];
export const sourceIcon = (s: CompanySource) =>
  s === "LinkedIn" ? "linkedin" : s === "Allabolag" ? "office-building-marker" : "pencil";

export const ENRICHMENT: { value: EnrichmentStatus; label: string; icon: string; cls: string }[] = [
  { value: "Pending", label: "Pending", icon: "clock-outline", cls: "opacity-40" },
  { value: "Enriched", label: "Enriched", icon: "check-decagram", cls: "text-success" },
  { value: "NeedsManualLookup", label: "Needs lookup", icon: "phone-alert", cls: "text-warning" },
];
export const enrichmentMeta = (s: EnrichmentStatus) =>
  ENRICHMENT.find((x) => x.value === s) ?? ENRICHMENT[0];
