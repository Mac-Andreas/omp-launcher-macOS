import { DropdownBadge, DropdownItemMeta } from "../components/ThemedDropdown";
import { getSampVersionName } from "./helpers";
import { SAMPDLLVersions } from "./types";

// Public SA-MP release dates (source: SA-MP forum changelogs / blog posts).
// Used for the badge next to each entry in the version dropdown.
const INSTALLABLE_DATES: Partial<Record<SAMPDLLVersions, string>> = {
  "037R5_samp.dll": "Nov 2022",
  "037R4_samp.dll": "Jun 2021",
  "037R31_samp.dll": "Aug 2018",
  "037R3_samp.dll": "Jul 2018",
  "03DL_samp.dll": "Jan 2018",
  "037R2_samp.dll": "Apr 2018",
  "037R1_samp.dll": "May 2015",
};

// Versions the upstream launcher ships a DLL for. These are the only entries
// the dropdown can actually install — anything else is shown disabled with a
// LEGACY badge so users see the full release history but cannot pick a
// download we do not have.
export const ORDERED_INSTALLABLE: SAMPDLLVersions[] = [
  "037R5_samp.dll",
  "037R4_samp.dll",
  "037R31_samp.dll",
  "037R3_samp.dll",
  "03DL_samp.dll",
  "037R2_samp.dll",
  "037R1_samp.dll",
];

export const LATEST_SAMP_VERSION: SAMPDLLVersions = "037R5_samp.dll";

// Older 0.3 branch releases, listed for context only. The launcher does not
// bundle DLLs for these; they render disabled in the dropdown.
const LEGACY_NON_INSTALLABLE: { label: string; date: string }[] = [
  { label: "0.3z", date: "Feb 2014" },
  { label: "0.3x", date: "Jan 2013" },
  { label: "0.3e", date: "May 2012" },
  { label: "0.3d", date: "Dec 2011" },
  { label: "0.3c", date: "Dec 2010" },
  { label: "0.3b", date: "Aug 2010" },
  { label: "0.3a", date: "Oct 2009" },
];

// Build the dropdown's item list (newest first) and the per-item metadata
// ThemedDropdown uses to render badges and the disabled state. The (Latest)
// sugar option is intentionally absent — the LATEST badge on R5 communicates
// the same thing without a duplicate row.
export const buildSampVersionDropdownItems = (
  installedVersion?: SAMPDLLVersions
): {
  items: string[];
  meta: Record<string, DropdownItemMeta>;
} => {
  const items: string[] = [];
  const meta: Record<string, DropdownItemMeta> = {};

  for (const v of ORDERED_INSTALLABLE) {
    const name = getSampVersionName(v);
    items.push(name);
    const badges: DropdownBadge[] = [];
    // INSTALLED badge removed: it sat on the currently-selected row and was
    // mostly hidden behind the field's selection highlight. The SA-MP tile's
    // "Installed: vX" subtitle already conveys this.
    void installedVersion;
    if (v === "03DL_samp.dll") {
      badges.push({ label: "DL", tone: "accent" });
    } else if (v === LATEST_SAMP_VERSION) {
      badges.push({ label: "LATEST", tone: "primary" });
    }
    const date = INSTALLABLE_DATES[v];
    if (date) badges.push({ label: date, tone: "neutral" });
    meta[name] = { badges };
  }

  for (const entry of LEGACY_NON_INSTALLABLE) {
    items.push(entry.label);
    meta[entry.label] = {
      disabled: true,
      badges: [
        { label: "LEGACY", tone: "warning" },
        { label: entry.date, tone: "neutral" },
      ],
    };
  }

  return { items, meta };
};
