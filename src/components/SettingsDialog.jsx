import { useEffect } from "react";

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

function formatRemainingDays(value) {
  if (!Number.isFinite(Number(value))) return "-";
  const days = Math.max(0, Math.floor(Number(value)));
  return `${days}일`;
}

function SettingsActionButton({
  children,
  onClick,
  disabled = false,
  variant = "default",
}) {
  const baseClassName =
    "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition";
  const variantClassName =
    variant === "primary"
      ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
      : "border border-white/10 bg-white/5 text-white hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClassName} ${variantClassName} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-slate-400">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-white">{value || "-"}</dd>
    </div>
  );
}

export default function SettingsDialog({
  onClose,
  theme = "dark",
  onThemeChange,
  user = null,
  authEnabled = true,
  currentTier = "free",
  currentTierExpiresAt = null,
  currentTierRemainingDays = null,
  loadingTier = false,
  activeProfile = null,
  premiumSpaceMode = "profile",
  onOpenBilling,
  onOpenFeedbackDialog,
  onOpenLogin,
  onSignOut,
  signingOut = false,
  onRefresh,
  isRefreshing = false,
}) {
  const isLight = theme === "light";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const accountRows = [
    {
      label: "로그인 상태",
      value: user?.email || (authEnabled ? "로그인 안 됨" : "게스트 모드"),
    },
    {
      label: "이용 등급",
      value: loadingTier ? "불러오는 중.." : String(currentTier || "free").toUpperCase(),
    },
    {
      label: "만료일",
      value: loadingTier ? "불러오는 중.." : formatDate(currentTierExpiresAt),
    },
    {
      label: "남은 기간",
      value: loadingTier ? "불러오는 중.." : formatRemainingDays(currentTierRemainingDays),
    },
  ];

  const profileRows = [
    {
      label: "활성 프로필",
      value: activeProfile?.name || "기본 프로필",
    },
    {
      label: "공간 모드",
      value: premiumSpaceMode === "shared" ? "공유" : "개인",
    },
  ];

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onClose?.()}
        aria-label="설정 닫기"
      />
      <div
        className={`relative z-[171] w-full max-w-2xl rounded-[28px] border shadow-2xl ${
          isLight
            ? "border-slate-200 bg-slate-50 text-slate-900"
            : "border-white/10 bg-[#0b1120] text-white"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Settings</p>
            <h2 className="mt-2 text-2xl font-bold">설정</h2>
            <p className={`mt-2 text-sm ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              테마, 계정, 구독 상태를 여기서 확인할 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              isLight ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-white/10 hover:bg-white/15"
            }`}
          >
            닫기
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"}`}>
            <h3 className="text-sm font-semibold">계정</h3>
            <dl className="mt-4 space-y-3">
              {accountRows.map((row) => (
                <DetailRow key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          </section>

          <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"}`}>
            <h3 className="text-sm font-semibold">프로필</h3>
            <dl className="mt-4 space-y-3">
              {profileRows.map((row) => (
                <DetailRow key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          </section>

          <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"}`}>
            <h3 className="text-sm font-semibold">화면</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              <SettingsActionButton
                variant="primary"
                onClick={() => onThemeChange?.(isLight ? "dark" : "light")}
              >
                {isLight ? "다크 모드로 변경" : "라이트 모드로 변경"}
              </SettingsActionButton>
              <SettingsActionButton onClick={() => onRefresh?.()} disabled={isRefreshing}>
                {isRefreshing ? "동기화 중.." : "새로고침"}
              </SettingsActionButton>
            </div>
          </section>

          <section className={`rounded-2xl border p-4 ${isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"}`}>
            <h3 className="text-sm font-semibold">빠른 작업</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {onOpenBilling ? (
                <SettingsActionButton onClick={() => onOpenBilling?.()} variant="primary">
                  결제 관리
                </SettingsActionButton>
              ) : null}
              {onOpenFeedbackDialog ? (
                <SettingsActionButton onClick={() => onOpenFeedbackDialog?.()}>
                  개선 요청 보내기
                </SettingsActionButton>
              ) : null}
              {!user && authEnabled && onOpenLogin ? (
                <SettingsActionButton onClick={() => onOpenLogin?.()}>
                  로그인
                </SettingsActionButton>
              ) : null}
              {user && onSignOut ? (
                <SettingsActionButton onClick={() => onSignOut?.()} disabled={signingOut}>
                  {signingOut ? "로그아웃 중.." : "로그아웃"}
                </SettingsActionButton>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
