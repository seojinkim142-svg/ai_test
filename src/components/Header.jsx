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
  onOpenBilling,
  onOpenLogin,
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
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">quiz and summarize</p>
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
              홈으로
            </button>
          )}
          <button
            type="button"
            onClick={onOpenBilling}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            요금제
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="ghost-button text-xs text-slate-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": theme === "light" ? "14, 116, 144" : "148, 163, 184" }}
          >
            {theme === "light" ? "라이트" : "다크"}
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
                {premiumSpaceMode === "shared" ? "공유 스페이스" : "개인 스페이스"}
              </button>

              <button
                type="button"
                onClick={onOpenProfilePinDialog}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                PIN 변경
              </button>
            </>
          )}

          {user && (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 shadow-inner shadow-black/30">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Account</span>
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
                {signingOut ? "로그아웃 중.." : "로그아웃"}
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
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
});

export default Header;
