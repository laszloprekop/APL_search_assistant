import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../lib/ui";

// A slide-in walkthrough of the whole app, in a What → How (+ Why) narrative. It reuses the same
// MDI icons the features themselves use, so the guide reads as a legend for the live UI.
export function UserGuide({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(false);

  // Animate in on mount, and close on Esc. The 10ms defer lets the off-screen start state paint
  // before we flip to the on-screen one, so the transform actually transitions.
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { setShown(false); setTimeout(onClose, 200); };

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-page shadow-2xl transition-transform duration-200 ease-out ${shown ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand">
            <Icon name="book-open-page-variant" className="text-brand" />
            User guide
          </h2>
          <button onClick={close} title="Close (Esc)" className="opacity-50 hover:opacity-100">
            <Icon name="close" className="text-xl" />
          </button>
        </header>

        <div className="grow overflow-y-auto px-5 py-4">
          <Intro />
          <div className="space-y-5">
            {STEPS.map((s, i) => <StepCard key={i} n={i + 1} {...s} />)}
          </div>
          <Faq />
          <p className="mt-6 mb-2 text-center text-xs text-faint">
            <Icon name="cursor-default-click-outline" /> Tip: almost every icon and button has a tooltip — hover to see what it does.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Intro() {
  return (
    <div className="mb-5 rounded-2xl border border-accent-strong/40 bg-accent/10 p-4 text-sm text-muted">
      <p className="flex items-center gap-1.5 font-semibold text-brand">
        <Icon name="briefcase-search" className="text-brand" /> What this app is for
      </p>
      <p className="mt-1.5">
        It automates the grindy parts of the APL (internship) search and gets you to one concrete
        deliverable: a list of <strong>≥15 host companies</strong> that each have a real email{" "}
        <em>and</em> phone number. You stay in control of every message that goes out.
      </p>
      <p className="mt-2">
        The big number at the top — <Icon name="format-list-checks" className="text-brand" />{" "}
        <strong>“X / 15 hosts ready”</strong> — is your progress bar. The rest of the app exists to
        move companies toward counting in it.
      </p>
    </div>
  );
}

interface Step {
  icon: string;
  iconClass?: string;
  title: string;
  what: ReactNode;
  how: ReactNode;
  why?: ReactNode;
}

function StepCard({ n, icon, iconClass, title, what, how, why }: Step & { n: number }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-brand">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
        <Icon name={icon} className={iconClass ?? "text-brand"} />
        {title}
      </h3>
      <dl className="mt-2 space-y-2 text-sm">
        <Line label="What" tone="text-muted">{what}</Line>
        <Line label="How" tone="text-brand">{how}</Line>
        {why && <Line label="Why" tone="text-success">{why}</Line>}
      </dl>
    </section>
  );
}

function Line({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className={`w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{label}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

// Inline icon+label chip so the prose can point at exactly the control you'll click.
function Ref({ icon, iconClass, children }: { icon: string; iconClass?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-surface-hover px-1.5 py-0.5 text-[12px] font-medium text-muted">
      <Icon name={icon} className={iconClass} /> {children}
    </span>
  );
}

const STEPS: Step[] = [
  {
    icon: "domain",
    title: "The company pipeline",
    what: <>One table, one row per company, with its <strong>stage</strong> (Identified → Enriched → Ready → Contacted → Replied → Closed), email/phone channels, enrichment status, and whether it’s list-ready.</>,
    how: <>Filter by stage or <Ref icon="checkbox-marked-outline">Ready only</Ref> at the top. Click an empty part of a row to expand it; edit any field inline. Use the <Ref icon="plus" iconClass="text-brand">Add company</Ref> button to add one by hand.</>,
    why: <>Everything else hangs off this row — enrichment, contacts and outreach all live inside the expanded company.</>,
  },
  {
    icon: "linkedin",
    iconClass: "text-linkedin",
    title: "Bring companies in (browser extension)",
    what: <>The Chrome extension does <strong>assisted, manual capture</strong> — no auto-crawling. It captures people from a LinkedIn search, walks profiles to grab company websites, and reads org.nr / phone / financials from allabolag.se.</>,
    how: <>Browse a search yourself, capture the visible results, hit <strong>Copy JSON</strong>, then paste it into <Ref icon="swap-vertical" iconClass="text-brand">Import / Export</Ref> here. The same panel imports company / contact <strong>spreadsheets</strong> (paste tab-separated rows) and exports the current view back out for sharing. It also does a full <strong>backup &amp; share</strong> of the whole dataset in the app's own format — lossless JSON, or CSV (Excel) / TSV — that you can download and re-import later. Imports are deduped, so re-importing is safe.</>,
    why: <>One click = one navigation, only the page you opened. That keeps the tool inside each site’s terms of service.</>,
  },
  {
    icon: "magnify",
    title: "Enrich — the 3 numbered steps",
    what: <>Inside an expanded row, a row of numbered pills fills in the missing data: <Ref icon="numeric-1-circle" iconClass="text-success">Find Company Website</Ref> <Ref icon="numeric-2-circle" iconClass="text-success">Scan Company Contacts</Ref> <Ref icon="numeric-3-circle" iconClass="text-success">Scan Allabolag</Ref></>,
    how: <>Click them left to right. <strong>1</strong> searches for the site, <strong>2</strong> politely fetches its contact/team pages and extracts emails &amp; phones, <strong>3</strong> opens allabolag for the extension to grab org.nr &amp; financials. A finished step turns into a plain capsule with a <Icon name="refresh" className="text-faint" /> — click to re-run.</>,
    why: <>Clicking a step both opens the row <em>and</em> auto-runs that action, so the common path is a single click. Steps degrade gracefully: any fetch that fails just leaves the field for you to type in.</>,
  },
  {
    icon: "card-account-mail",
    title: "Contacts as reach-out points",
    what: <>Every email, phone, and LinkedIn profile is a <strong>trackable contact point</strong> with its own status (Not contacted → Contacted → Replied → Bounced → Closed), grouped under <Ref icon="account-multiple">Persons</Ref> or as generic company points.</>,
    how: <>Add one on the left of the expanded row. Use <Ref icon="account-search">Find contact</Ref> next to a person to look up just their email/phone on the company site. Set each point’s status from its dropdown as you reach out.</>,
    why: <>Tracking per contact point (not per company) means you know exactly which address bounced and which person replied.</>,
  },
  {
    icon: "send-outline",
    title: "Outreach — 3 channels, no auto-send",
    what: <>At the bottom of an expanded company, the <Ref icon="send-outline">Outreach</Ref> card drafts a personalized message in three channels: <Ref icon="email-outline" iconClass="text-brand">Email</Ref> <Ref icon="linkedin" iconClass="text-linkedin">LinkedIn</Ref> <Ref icon="phone-outline" iconClass="text-success">Phone</Ref></>,
    how: <>Pick who to address and Cold vs Follow-up, click a channel, and review the merge-filled draft. Email opens a prefilled compose window (mailto / <Ref icon="gmail">Gmail</Ref>); LinkedIn copies the text; Phone shows a call script + <code>tel:</code> link. Then <Ref icon="check-circle-outline" iconClass="text-success">Mark as sent</Ref> / Log call.</>,
    why: <><strong>Nothing sends automatically</strong> — you send, copy, or call yourself. Marking it logged advances the company’s stage and records it in the Outbox.</>,
  },
  {
    icon: "cog",
    title: "Settings — search + your details",
    what: <>Two things: a <strong>search provider + API key</strong> (Brave / Google PSE / Serper) that powers “Find website”, and <Ref icon="account-edit">Your details</Ref> (name, period, email, phone, LinkedIn, area, CV summary).</>,
    how: <>Open <Ref icon="cog">Settings</Ref> from the header. Without a provider you just paste website URLs by hand. Your details fill the <code>{"{{your_*}}"}</code> / <code>{"{{period}}"}</code> tokens in every draft.</>,
    why: <>Fill your details once and all outreach drafts come out personalized. Keys + details stay only in your local, git-ignored database.</>,
  },
  {
    icon: "text-box-edit-outline",
    title: "Templates",
    what: <>Five editable templates — cold email, follow-up, LinkedIn inMail, phone script, and the Lexicon cover email — each with <code>{"{{merge_field}}"}</code> tokens.</>,
    how: <>Open <Ref icon="text-box-multiple-outline">Templates</Ref>, pick one, edit the text, and drop in merge fields from the list at the bottom. Tokens are filled per company at draft time.</>,
    why: <>An unset token shows as <code>[field?]</code> in the draft so a half-filled message is obvious before you send it.</>,
  },
  {
    icon: "tray-full",
    title: "Outbox",
    what: <>An activity log of everything you’ve sent, copied, or logged — newest first, per company and channel.</>,
    how: <>Open <Ref icon="tray-full">Outbox</Ref> from the header to review past touches; remove an entry if you logged it by mistake.</>,
    why: <>It’s your paper trail for follow-ups — and removing an entry deliberately does <em>not</em> rewind the company’s stage.</>,
  },
  {
    icon: "format-list-checks",
    title: "Submit the Lexicon ≥15 list",
    what: <>The finish line: generate the required contact list (clean CSV + a cover email from the Lexicon template) and record that you submitted it.</>,
    how: <>Open <Ref icon="format-list-checks" iconClass="text-brand">Lexicon list</Ref> and follow the three steps: <strong>1</strong> <Ref icon="download">Download CSV</Ref> → <strong>2</strong> <Ref icon="email-fast-outline">open the email</Ref> &amp; attach it → <strong>3</strong> <Ref icon="check-circle-outline" iconClass="text-success">Mark as submitted</Ref>.</>,
    why: <>Email can’t carry the attachment for you, hence the manual attach step. Submitting snapshots exactly what was sent, for your records.</>,
  },
];

function Faq() {
  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-brand">
        <Icon name="frequently-asked-questions" className="text-brand" /> FAQ — the less obvious bits
      </h3>
      <div className="space-y-2">
        <QA q="A company has an email and phone but isn’t counted in “X / 15 ready”. Why?">
          The list bar needs <strong>both a real email and a real phone</strong>. A{" "}
          <span className="rounded-lg bg-warning/10 px-1 text-[11px] font-medium text-warning">guessed</span>{" "}
          contact (an amber <Icon name="email" className="text-warning" /> like <code>info@…</code>) doesn’t count — it’s a generic pattern, not a verified address. Confirm it by phone, then add it as a non-guessed point.
        </QA>
        <QA q="What does the amber “guessed” badge mean?">
          Enrichment couldn’t find a person’s real address, so it offered a common pattern (<code>info@</code>, <code>kontakt@</code>) that merely passed an MX check. It’s flagged and deliberately excluded from the ≥15 list until you verify it.
        </QA>
        <QA q="Why did clicking a step pill open the row and immediately start working?">
          The numbered steps are shortcuts: one click expands the company <em>and</em> runs that action (find website / scan contacts). Re-clicking a finished <Icon name="refresh" className="text-faint" /> step just re-runs it.
        </QA>
        <QA q="“Find contact” on a person is greyed out.">
          It needs the <strong>company website first</strong> — that’s where it looks the person up. Run step <Icon name="numeric-1-circle" className="text-success" /> (Find Company Website) and it’ll enable.
        </QA>
        <QA q="Why doesn’t the app just send the emails?">
          By design, <strong>nothing sends automatically</strong>. Every message opens in your own mail/Gmail compose window (or is copied for LinkedIn) so you review and send it yourself. The app only logs that you did.
        </QA>
        <QA q="I see [field?] in a draft.">
          That’s an unset merge field. Fill it in <Ref icon="cog">Settings → Your details</Ref> (or just edit the draft text before sending).
        </QA>
        <QA q="Allabolag capture — why does a name mismatch still land correctly?">
          The app pins the allabolag page to that exact company row via a hidden link, so “Euroclear” vs “Euroclear Sweden AB” still saves the org.nr / financials onto the right entry.
        </QA>
        <QA q="The table updated on its own.">
          The app re-fetches when you return to the tab (plus a slow background poll), so data the extension posts shows up without a manual reload.
        </QA>
      </div>
    </section>
  );
}

function QA({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-surface">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand hover:bg-surface-hover">
        <Icon name={open ? "chevron-down" : "chevron-right"} className="shrink-0 opacity-50" />
        {q}
      </button>
      {open && <p className="border-t border-border px-3 py-2 text-sm text-muted">{children}</p>}
    </div>
  );
}
