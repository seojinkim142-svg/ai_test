import { memo } from "react";

const DEFAULT_PROFILE_AVATAR = "/pngegg.png";
const BACKUP_PROFILE_AVATAR = "/profile-default-character.svg";

const Header = memo(function Header({
  user,
  onSignOut,
  signingOut = false,
  theme = "dark",
  onToggleTheme,
  onGoHome,
  onOpenFeedbackDialog,
  onOpenBilling,
  onOpenLogin,
  showBilling = true,
  onRefresh,
  isRefreshing = false,
  isPremiumTier = false,
  loadingTier = false,
  activeProfile = null,
  onOpenProfilePicker,
  onOpenProfilePinDialog,
  premiumSpaceMode = "profile",
  onTogglePremiumSpaceMode,
  authEnabled = true,
}) {
  const handleAvatarError = (event) => {
    const img = event.currentTarget;
    const step = Number(img.dataset.fallbackStep || "0");
    if (step >= 2) return;
    img.dataset.fallbackStep = String(step + 1);
    img.src = step === 0 ? DEFAULT_PROFILE_AVATAR : BACKUP_PROFILE_AVATAR;
  };

  const showPremiumButtons = Boolean(user && !loadingTier && isPremiumTier && activeProfile);
  const tierBadgeLabel = loadingTier ? "Sync" : isPremiumTier ? "Premium" : "Free";

  return (
    <header className="app-safe-top sticky top-0 z-40 flex w-full items-center border-b border-white/10 bg-slate-950/72 px-3 pb-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/75 sm:text-sm sm:tracking-[0.2em]">
              {"\uD034\uC988\uC640 \uC694\uC57D"}
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-none text-white sm:text-3xl">Zeusian</h1>
          </div>
          {user && (
            <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 sm:hidden">
              {tierBadgeLabel}
            </span>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="mobile-chip-row flex items-center gap-2 sm:flex-wrap sm:justify-end">
            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {"\uD648\uC73C\uB85C"}
              </button>
            )}

            {user && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="ghost-button text-xs text-emerald-100 sm:hidden"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {isRefreshing ? "\uB3D9\uAE30\uD654 \uC911..." : "\uC0C8\uB85C\uACE0\uCE68"}
              </button>
            )}

            {onOpenFeedbackDialog && (
              <button
                type="button"
                onClick={onOpenFeedbackDialog}
                className="ghost-button text-xs text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                {"\uD53C\uB4DC\uBC31"}
              </button>
            )}

            {showBilling && (
              <button
                type="button"
                onClick={onOpenBilling}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "16, 185, 129" }}
              >
                {"\uC694\uAE08\uC81C"}
              </button>
            )}

              <button
                type="button"
                onClick={onToggleTheme}
                className="ghost-button text-xs text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": theme === "light" ? "14, 116, 144" : "148, 163, 184" }}
              >
                {theme === "light" ? "\uB77C\uC774\uD2B8" : "\uB2E4\uD06C"}
              </button>

            {showPremiumButtons && (
              <>
                <button
                  type="button"
                  onClick={onOpenProfilePicker}
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-emerald-200/50 bg-black/20"
                    aria-hidden="true"
                  >
                    <img
                      src={activeProfile.avatar || DEFAULT_PROFILE_AVATAR}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={handleAvatarError}
                    />
                  </span>
                  <span>{activeProfile.name}</span>
                </button>

                <button
                  type="button"
                  onClick={onTogglePremiumSpaceMode}
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{
                    "--ghost-color":
                      premiumSpaceMode === "shared" ? "16, 185, 129" : "148, 163, 184",
                  }}
                >
                  {premiumSpaceMode === "shared"
                    ? "\uACF5\uC720 \uC2A4\uD398\uC774\uC2A4"
                    : "\uAC1C\uC778 \uC2A4\uD398\uC774\uC2A4"}
                </button>

                <button
                  type="button"
                  onClick={onOpenProfilePinDialog}
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  PIN {"\uBCC0\uACBD"}
                </button>
              </>
            )}

            {!user && authEnabled && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {"\uB85C\uADF8\uC778"}
              </button>
            )}
          </div>

          {user && (
            <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner shadow-black/30 sm:w-auto sm:rounded-full sm:py-1.5">
              <div className="min-w-0 flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">
                  {"\uACC4\uC815"}
                </span>
                <span className="max-w-[220px] truncate text-sm font-semibold leading-tight text-white">
                  {user.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 sm:inline-flex">
                  {tierBadgeLabel}
                </span>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signingOut}
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  {signingOut ? "\uB85C\uADF8\uC544\uC6C3 \uC911..." : "\uB85C\uADF8\uC544\uC6C3"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
});

export default Header;
