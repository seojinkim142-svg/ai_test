import { create } from "zustand";
import { PREMIUM_SPACE_MODE_PROFILE } from "../utils/appStateHelpers";

export const usePremiumStore = create((set) => ({
  premiumProfiles: [],
  activePremiumProfileId: null,
  premiumSpaceMode: PREMIUM_SPACE_MODE_PROFILE,

  // Actions
  setPremiumProfiles: (fn) =>
    set((state) => ({
      premiumProfiles: typeof fn === "function" ? fn(state.premiumProfiles) : fn,
    })),
  setActivePremiumProfileId: (v) => set({ activePremiumProfileId: v }),
  setPremiumSpaceMode: (v) => set({ premiumSpaceMode: v }),
}));
