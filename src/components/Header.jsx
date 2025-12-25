function Header({ user, onSignOut, signingOut = false }) {
  return (
    <header className="flex w-full items-center border-b border-white/10 px-10 py-3">
      <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">quiz and summarize</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-white sm:text-3xl">
            Zeusian.ai
          </h1>
        </div>

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
              className="rounded-full bg-emerald-400/80 px-3 py-1 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {signingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
