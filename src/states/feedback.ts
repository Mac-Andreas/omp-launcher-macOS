import { create } from "zustand";

// Shared feedback-campaign state. One fetch on app start populates `campaign`;
// the title-bar button, the main-window banner, and the popup all read from
// here so there's a single source of truth (and a single network request).
//
// `source` identifies this build to the backend — the macOS build reports
// "macandreas" so campaigns can target it specifically.
const SUPABASE_URL = "https://tmenljjfshefocoqnwgi.supabase.co";
const SUPABASE_ANON = "sb_publishable_waBEtV1eAdoXRMET_ZRxpw_ANZUgZBw";
const SOURCE = "macandreas";

export interface FeedbackQuestion {
  text: string;
  type?: "likert" | "mcq" | "text";
  options?: string[];
  label1?: string;
  label5?: string;
}

export interface FeedbackPage {
  title?: string;
  questions: FeedbackQuestion[];
}

export interface FeedbackCampaign {
  id: number;
  title: string;
  description?: string;
  pages?: FeedbackPage[];
  // Legacy flat campaigns without pages.
  questions?: FeedbackQuestion[];
}

interface FeedbackState {
  campaign: FeedbackCampaign | null;
  // True once the initial fetch has resolved (success or empty).
  loaded: boolean;
  // Whether the paged popup is open.
  popupOpen: boolean;
  fetchCampaign: () => Promise<void>;
  openPopup: () => void;
  closePopup: () => void;
  submit: (answers: Record<string, string | number>) => Promise<void>;
}

async function fetchActiveCampaign(): Promise<FeedbackCampaign | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feedback_campaigns?select=*&status=eq.active&order=activated_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const campaign = rows?.find(
      (c: any) => !c.target_source || c.target_source === SOURCE
    );
    return campaign ?? null;
  } catch {
    return null;
  }
}

export const useFeedback = create<FeedbackState>((set, get) => ({
  campaign: null,
  loaded: false,
  popupOpen: false,

  fetchCampaign: async () => {
    const campaign = await fetchActiveCampaign();
    set({ campaign, loaded: true });
  },

  openPopup: () => {
    if (get().campaign) set({ popupOpen: true });
  },
  closePopup: () => set({ popupOpen: false }),

  submit: async (answers) => {
    const campaign = get().campaign;
    if (!campaign) return;
    const anonId =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("telemetry-anonymous-id") ?? "unknown"
        : "unknown";
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/feedback_responses`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          anonymous_id: anonId,
          source: SOURCE,
          answers,
        }),
      });
    } catch {
      /* silent — feedback is best-effort */
    }
  },
}));
