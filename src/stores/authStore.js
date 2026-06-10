import { create } from "zustand";

export const useAuthStore = create((set) => ({
  // Auth state (managed by useSupabaseAuth hook, synced here)
  user: null,
  authReady: false,
  isSigningOut: false,

  // UI overlays
  showAuth: false,
  showGuestIntro: false,
  skipPromoSplash: false,
  allowGuestLandingAfterSignOut: false,

  // Payment overlay
  showPayment: false,
  paymentReturnSignal: 0,

  // Settings overlay
  showSettings: false,

  // Tier info (managed by useUserTier hook, synced here)
  tier: "free",
  tierExpiresAt: null,
  tierRemainingDays: null,
  loadingTier: true,

  // Actions
  setUser: (user) => set({ user }),
  setAuthReady: (authReady) => set({ authReady }),
  setIsSigningOut: (isSigningOut) => set({ isSigningOut }),

  setShowAuth: (showAuth) => set({ showAuth }),
  setShowGuestIntro: (showGuestIntro) => set({ showGuestIntro }),
  setSkipPromoSplash: (skipPromoSplash) => set({ skipPromoSplash }),
  setAllowGuestLandingAfterSignOut: (v) => set({ allowGuestLandingAfterSignOut: v }),

  setShowPayment: (showPayment) => set({ showPayment }),
  setPaymentReturnSignal: (fn) =>
    set((state) => ({
      paymentReturnSignal: typeof fn === "function" ? fn(state.paymentReturnSignal) : fn,
    })),

  setShowSettings: (showSettings) => set({ showSettings }),

  setTierInfo: ({ tier, tierExpiresAt, tierRemainingDays, loadingTier }) =>
    set({ tier, tierExpiresAt, tierRemainingDays, loadingTier }),
}));
