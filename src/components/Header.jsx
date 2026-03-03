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
  onRefresh,
  isRefreshing = false,
  isPremiumTier = false,
  loadingTier = false,
  activeProfile = null,
  onOpenProfilePicker,
  onOpenProfilePinDialog,
  premiumSpaceMode = "profile",
  onTogglePremiumSpaceMode,
}) {
  const handleAvatarError = (event) => {
    const img = event.currentTarget;
    const step = Number(img.dataset.fallbackStep || "0");
    if (step >= 2) return;
    img.dataset.fallbackStep = String(step + 1);
    img.src = step === 0 ? DEFAULT_PROFILE_AVATAR : BACKUP_PROFILE_AVATAR;
  };

  const showPremiumButtons = Boolean(user && !loadingTier && isPremiumTier && activeProfile);

  return (
    <header className="flex w-full items-center border-b border-white/10 px-10 py-3">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">{"\uD034\uC988\uC640 \uC694\uC57D"}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-white sm:text-3xl">Zeusian</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <button
            type="button"
            onClick={onOpenBilling}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            {"\uC694\uAE08\uC81C"}
          </button>

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

          {user && (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 shadow-inner shadow-black/30">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">{"\uACC4\uC815"}</span>
                <span className="max-w-[180px] truncate text-sm font-semibold leading-tight text-white">
                  {user.email}
                </span>
              </div>
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
          )}

          {!user && (
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
    </header>
  );
});

export default Header;
