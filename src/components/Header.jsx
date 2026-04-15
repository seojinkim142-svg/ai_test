import { memo } from "react";
import { getUiCopy } from "../utils/uiCopy";

const DEFAULT_PROFILE_AVATAR = "/pngegg.png";
const BACKUP_PROFILE_AVATAR = "/profile-default-character.svg";

const Header = memo(function Header({
  user,
  theme = "light",
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
  outputLanguage = "ko",
}) {
  const copy = getUiCopy(outputLanguage);
  const handleAvatarError = (event) => {
    const img = event.currentTarget;
    const step = Number(img.dataset.fallbackStep || "0");
    if (step >= 2) return;
    img.dataset.fallbackStep = String(step + 1);
    img.src = step === 0 ? DEFAULT_PROFILE_AVATAR : BACKUP_PROFILE_AVATAR;
  };

  const showPremiumButtons = Boolean(user && !loadingTier && isPremiumTier && activeProfile);
  const brandTierLabel = !loadingTier && isPremiumTier ? copy.planNames.premium : null;
  return (
    <header className="app-safe-top sticky top-0 z-40 flex w-full items-center border-b border-white/10 bg-slate-950/72 px-3 pb-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              aria-label={copy.header.homeAria}
              className="group rounded-xl px-1 py-0.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/55"
            >
              <div className="flex items-end gap-2 sm:gap-3">
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
              <div className="flex items-end gap-2 sm:gap-3">
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
                {isRefreshing ? copy.header.refreshing : copy.header.refresh}
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
                {copy.header.billing}
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
                {copy.header.settings}
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
                    ? copy.header.sharedSpace
                    : copy.header.personalSpace}
                </button>

                <button
                  type="button"
                  onClick={onOpenProfilePinDialog}
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  {copy.header.pinChange}
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
                {copy.header.login}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;
