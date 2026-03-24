import { memo } from "react";

const DEFAULT_PROFILE_AVATAR = "/pngegg.png";
const BACKUP_PROFILE_AVATAR = "/profile-default-character.svg";

const Header = memo(function Header({
  user,
  theme = "dark",
  onGoHome,
  onOpenBilling,
  onOpenSettings,
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
  const brandTierLabel = !loadingTier && isPremiumTier ? "Premium" : null;
  return (
    <header className="app-safe-top sticky top-0 z-40 flex w-full items-center border-b border-white/10 bg-slate-950/72 px-3 pb-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              aria-label={"\uD648\uC73C\uB85C \uC774\uB3D9"}
              className="group rounded-xl px-1 py-0.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/55"
            >
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/75 transition group-hover:text-emerald-100 sm:text-sm sm:tracking-[0.2em]">
                {"\uD034\uC988\uC640 \uC694\uC57D"}
              </p>
              <div className="mt-1 flex items-end gap-2 sm:gap-3">
                <h1 className="text-2xl font-bold leading-none text-white transition group-hover:text-emerald-50 sm:text-3xl">
                  Zeusian.ai
                </h1>
                {brandTierLabel && (
                  <span className="pb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80 transition group-hover:text-emerald-100 sm:text-sm">
                    {brandTierLabel}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/75 sm:text-sm sm:tracking-[0.2em]">
                {"\uD034\uC988\uC640 \uC694\uC57D"}
              </p>
              <div className="mt-1 flex items-end gap-2 sm:gap-3">
                <h1 className="text-2xl font-bold leading-none text-white sm:text-3xl">Zeusian.ai</h1>
                {brandTierLabel && (
                  <span className="pb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80 sm:text-sm">
                    {brandTierLabel}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-end gap-2 sm:w-auto">
          <div className="flex w-[14.75rem] max-w-full flex-wrap justify-end gap-2 sm:w-auto sm:max-w-none sm:justify-end">
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

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="ghost-button text-xs text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": theme === "light" ? "14, 116, 144" : "148, 163, 184" }}
              >
                설정
              </button>
            )}

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
        </div>
      </div>
    </header>
  );
});

export default Header;
