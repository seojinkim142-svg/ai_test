function Header({
  user,
  onSignOut,
  signingOut = false,
  theme = "dark",
  onToggleTheme,
  onOpenBilling,
  onOpenLogin,
}) {
  return (
    <header className="flex w-full items-center border-b border-white/10 px-10 py-3">
      <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">quiz and summarize</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-white sm:text-3xl">
            Zeusian.ai
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenBilling}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            결제/업그레이드
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="ghost-button text-xs text-slate-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": theme === "light" ? "14, 116, 144" : "148, 163, 184" }}
          >
            {theme === "light" ? "라이트 모드" : "다크 모드"}
          </button>

          {user && (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 shadow-inner shadow-black/30">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">사용자</span>
                <span className="text-sm font-semibold text-white leading-tight">{user.email}</span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {signingOut ? "로그아웃 중..." : "로그아웃"}
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
              로그인하기
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
