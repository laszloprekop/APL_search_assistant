// Test fixtures for parser.js.
//
// These reproduce the SEMANTIC ANCHORS the parser relies on (role="listitem",
// aria-label, a[href*="/in/"], <p> text lines, "Current:/Past:/Summary:") rather than
// LinkedIn's hashed classes — which is exactly the contract the parser targets.
//
// Note: cards are authored FLAT (no <a> nested inside <a>) because the HTML parser would
// auto-close a nested anchor. The parser queries across the whole listitem, so flat
// structure is faithful. Each case derives from a real card in the captured sample.

const CARDS = [
  {
    label: "non-verified, img alt = name, Current line",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/ens98aln/" tabindex="0">card</a>
        <img alt="Andreas Larsson">
        <p>Andreas Larsson<span> • 2nd</span></p>
        <p><span>Team Lead / Software Developer</span></p>
        <p><span>Västerbotten County, Sweden</span></p>
        <a aria-label="Invite Andreas Larsson to connect" href="/preload/x?vanityName=ens98aln">Connect</a>
        <p><span>Current: Team Lead / Software Developer at Confirma Artvise AB</span></p>
      </div>`,
    expect: {
      name: "Andreas Larsson", title: "Team Lead / Software Developer",
      location: "Västerbotten County, Sweden", lan: "Västerbotten",
      company: "Confirma Artvise AB", company_confidence: "high",
      handle: "ens98aln", linkedin_url: "https://www.linkedin.com/in/ens98aln/",
    },
  },
  {
    label: "verified, empty img alt -> name from invite aria-label; trailing-desc cut",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/mrjohansson/" tabindex="0">card</a>
        <img alt="">
        <p>Morgan Johansson<span> • 2nd</span></p>
        <p><span>Senior Cloud Architect at Fxity</span></p>
        <p><span>Greater Umeå Metropolitan Area</span></p>
        <a aria-label="Invite Morgan Johansson to connect" href="/preload/x">Connect</a>
        <p><span>Current: Senior Cloud Architect at FXity - Architecture and development of Kubernetes...</span></p>
      </div>`,
    expect: {
      name: "Morgan Johansson", title: "Senior Cloud Architect at Fxity",
      location: "Greater Umeå Metropolitan Area", lan: "",
      company: "FXity", company_confidence: "high", handle: "mrjohansson",
    },
  },
  {
    label: "precedence: Current side-gig wins (documents the known imperfection)",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/cliveleddy/" tabindex="0">card</a>
        <img alt="Clive L.">
        <p>Clive L.<span> • 2nd</span></p>
        <p><span>Business &amp; Technology Specialist | ERP/MES Systems | Modern Web .NET</span></p>
        <p><span>Umeå, Västerbotten County, Sweden</span></p>
        <a aria-label="Invite Clive L. to connect" href="/preload/x">Connect</a>
        <p><span>Current: Group training instructor at IKSU - A main task is to create...</span></p>
      </div>`,
    expect: {
      name: "Clive L.", company: "IKSU", company_confidence: "high",
      location: "Umeå, Västerbotten County, Sweden", lan: "Västerbotten", handle: "cliveleddy",
    },
  },
  {
    label: "precedence: headline 'at X' beats a Past: line (the bug fix)",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/andersprintz/" tabindex="0">card</a>
        <img alt="anders printz">
        <p>anders printz<span> • 2nd</span></p>
        <p><span>Developer at mfex</span></p>
        <p><span>Greater Umeå Metropolitan Area</span></p>
        <a aria-label="Invite anders printz to connect" href="/preload/x">Connect</a>
        <p><span>Past: Technical Lead at upKeeper Solutions AB</span></p>
      </div>`,
    expect: {
      name: "anders printz", title: "Developer at mfex",
      company: "mfex", company_confidence: "medium", handle: "andersprintz",
    },
  },
  {
    label: "name from 'Send a message to'; Summary without 'at' -> company from headline",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/janssendon/" tabindex="0">card</a>
        <img alt="">
        <p>Don Janssen<span> • 3rd+</span></p>
        <p><span>Tech Lead at Euroclear</span></p>
        <p><span>Greater Umeå Metropolitan Area</span></p>
        <a aria-label="Send a message to Don Janssen" href="/messaging/compose/?x">Message</a>
        <p><span>Summary: ...and agile development. During the last 20 years...</span></p>
      </div>`,
    expect: {
      name: "Don Janssen", title: "Tech Lead at Euroclear",
      company: "Euroclear", company_confidence: "medium", handle: "janssendon",
    },
  },
  {
    label: "mutual-connection /in/ links must not hijack the primary profile URL",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/stefan-eriksson-52669972/" tabindex="0">card</a>
        <img alt="">
        <p>Stefan Eriksson<span> • 2nd</span></p>
        <p><span>Technical Lead &amp; Co Founder at Sportswik AB</span></p>
        <p><span>Greater Umeå Metropolitan Area</span></p>
        <a aria-label="Invite Stefan Eriksson to connect" href="/preload/x">Connect</a>
        <p><span>Current: Technical Lead &amp; CO-founder at Sportswik AB</span></p>
        <p><a href="https://www.linkedin.com/in/johan-saginer-eriksson/">Johan Saginer Eriksson</a>
           and <a href="https://www.linkedin.com/in/christian-holmstrand/">Christian Holmstrand</a>
           are mutual connections</p>
      </div>`,
    expect: {
      name: "Stefan Eriksson", company: "Sportswik AB", company_confidence: "high",
      handle: "stefan-eriksson-52669972",
      linkedin_url: "https://www.linkedin.com/in/stefan-eriksson-52669972/",
    },
  },
  {
    label: "percent-encoded handle is decoded; 'A - B at C' -> C",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/danielhellstr%C3%B6m/" tabindex="0">card</a>
        <img alt="Daniel Hellström">
        <p>Daniel Hellström<span> • 2nd</span></p>
        <p><span>CTO/Utvecklingschef - twoday INSIKT</span></p>
        <p><span>Umeå, Västerbotten County, Sweden</span></p>
        <a aria-label="Invite Daniel Hellström to connect" href="/preload/x">Connect</a>
        <p><span>Current: CTO/Utvecklingschef - twoday INSIKT at twoday Sweden</span></p>
      </div>`,
    expect: {
      name: "Daniel Hellström", title: "CTO/Utvecklingschef - twoday INSIKT",
      company: "twoday Sweden", company_confidence: "high",
      handle: "danielhellström",
      linkedin_url: "https://www.linkedin.com/in/danielhellstr%C3%B6m/",
    },
  },
  {
    label: "name fallback: no aria-label, no img -> shortest /in/ link text",
    html: `
      <div role="listitem">
        <a href="https://www.linkedin.com/in/nofallback/" tabindex="0"></a>
        <p><a href="https://www.linkedin.com/in/nofallback/">Test Person</a><span> • 2nd</span></p>
        <p><span>Developer</span></p>
        <p><span>Stockholm, Sweden</span></p>
        <p><span>Current: Developer at Acme AB</span></p>
      </div>`,
    expect: {
      name: "Test Person", title: "Developer", company: "Acme AB",
      company_confidence: "high", lan: "Stockholm", handle: "nofallback",
    },
  },
];

// The "Retry Premium / actively hiring" upsell — NOT a [role="listitem"], must be skipped.
const UPSELL = `
  <div class="upsell">
    <p>Easily find people who are actively hiring</p>
    <p>Search more efficiently with advanced search filters</p>
    <a href="https://www.linkedin.com/premium/products/?x">Retry Premium for SEK 0</a>
  </div>`;

// A directly-visited /in/ profile's top card — anonymized but structurally faithful to a
// real logged-in profile (the local, gitignored profile-sample.html). The redesigned DOM has
// fully hashed classes and NO <h1>: the name is the single <h2> matching the page <title>.
// Order: name <h2> · pronouns · "· 1st" degree · headline · current-company row · location ·
// "Contact info". A trailing "About" heading + Experience section bound the top card and let
// the same fixture exercise parseProfileExperience.
const PROFILE = {
  url: "https://www.linkedin.com/in/annabergstrom/",
  title: "(3) Anna Bergström | LinkedIn", // notification-count prefix must be stripped
  html: `
    <main>
      <section>
        <a href="https://www.linkedin.com/in/annabergstrom/"><div class="_88ea701d" aria-label="Anna Bergström"><figure></figure></div></a>
        <h2 class="_2eb95346 _24acea71 c351b56f">Anna Bergström</h2>
        <svg role="img" aria-label="View Anna’s verifications"></svg>
        <p class="_2eb95346 _1f780de2 c351b56f">She/Her</p>
        <div class="bde34a6e"><p class="_2eb95346 _1f780de2 c351b56f">· 1st</p></div>
        <p class="_2eb95346 _09b65e6e c351b56f">Lead Engineer &amp; Team Manager at Northwind Tech</p>
        <p class="_2eb95346 _1f780de2 fa602647 c351b56f">Northwind Tech · Some Other AB</p>
        <div class="e7886ddf">
          <p class="_2eb95346 _1f780de2 _354585b3 c351b56f">Kalmar County, Sweden</p>
          <p class="_2eb95346 _704502a2 c351b56f">·</p>
          <p class="_2eb95346 _34f4f05e c351b56f"><a href="#">Contact info</a></p>
        </div>
      </section>
      <h2>About</h2>
      <p>A section paragraph that must NOT be read as the headline or location.</p>
      <h2 componentkey="ProfileNullStateCardAnchor_Experience">Experience</h2>
      <div componentkey="entity-collection-item-1">
        <a href="https://www.linkedin.com/company/northwindtech/">
          <figure><img alt="Northwind Tech logo"></figure></a>
        <a href="https://www.linkedin.com/company/northwindtech/">
          <div><p>Lead Engineer</p><p>Northwind Tech · Full-time</p></div></a>
      </div>
    </main>`,
  expect: {
    name: "Anna Bergström",
    title: "Lead Engineer & Team Manager at Northwind Tech",
    location: "Kalmar County, Sweden",
    lan: "Kalmar",
    linkedin_url: "https://www.linkedin.com/in/annabergstrom/",
    handle: "annabergstrom",
  },
};

module.exports = { CARDS, UPSELL, PROFILE };
