import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchKakaoPaySubscriptionStatus, inactiveKakaoPaySubscription } from "../services/kakaopay";
import { fetchNicePaymentsSubscriptionStatus, inactiveNicePaymentsSubscription } from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { getTierLabel } from "../utils/appStateHelpers";

const SECTIONS = [
  { id: "account", label: "계정" },
  { id: "subscription", label: "구독" },
  { id: "theme", label: "테마" },
  { id: "feedback", label: "개선 요청" },
];

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getThemeLabel(theme) {
  return theme === "light" ? "라이트" : "다크";
}

function getSubscriptionStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "활성";
  if (normalized === "inactive") return "해지됨";
  return "미등록";
}

function SectionIcon({ id }) {
  const commonProps = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-4 w-4 shrink-0",
    "aria-hidden": true,
  };

  if (id === "account") {
    return (
      <svg {...commonProps}>
        <path d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
        <path d="M4.5 16.25a5.5 5.5 0 0 1 11 0" />
      </svg>
    );
  }

  if (id === "subscription") {
    return (
      <svg {...commonProps}>
        <rect x="3.5" y="5" width="13" height="10" rx="2" />
        <path d="M3.5 8.5h13" />
      </svg>
    );
  }

  if (id === "theme") {
    return (
      <svg {...commonProps}>
        <circle cx="10" cy="10" r="3.2" />
        <path d="M10 2.5v2" />
        <path d="M10 15.5v2" />
        <path d="M17.5 10h-2" />
        <path d="M4.5 10h-2" />
        <path d="m15.3 4.7-1.4 1.4" />
        <path d="m6.1 13.9-1.4 1.4" />
        <path d="m15.3 15.3-1.4-1.4" />
        <path d="m6.1 6.1-1.4-1.4" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M10 16.25c4.1 0 6.25-2.1 6.25-5.15 0-2.78-1.77-4.64-4.64-4.86-.57-1.57-2.04-2.49-3.98-2.49-2.5 0-4.38 1.6-4.38 3.92 0 .46.08.88.22 1.28C2.56 9.6 2 10.62 2 11.86c0 2.49 1.87 4.39 4.75 4.39h3.25Z" />
    </svg>
  );
}

function MiniInfo({ label, value, isLight }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
      }`}
    >
      <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailRows({ rows, isLight }) {
  return (
    <dl className="space-y-2.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4">
          <dt className={isLight ? "text-slate-500" : "text-slate-400"}>{row.label}</dt>
          <dd className="max-w-[66%] text-right font-medium leading-5">{row.value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SettingsDialog({
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
  const [activeSection, setActiveSection] = useState("account");
  const [kakaoSubscription, setKakaoSubscription] = useState(null);
  const [niceSubscription, setNiceSubscription] = useState(null);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionNotice, setSubscriptionNotice] = useState("");
  const [isCancellingPlan, setIsCancellingPlan] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const loadSubscriptions = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!user?.id) {
        setKakaoSubscription(null);
        setNiceSubscription(null);
        setSubscriptionError("");
        setSubscriptionNotice("");
        return;
      }

      if (showLoading) setLoadingSubscriptions(true);
      setSubscriptionError("");

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setKakaoSubscription(null);
          setNiceSubscription(null);
          return;
        }

        const [kakaoResult, niceResult] = await Promise.allSettled([
          fetchKakaoPaySubscriptionStatus({ accessToken }),
          fetchNicePaymentsSubscriptionStatus({ accessToken }),
        ]);

        setKakaoSubscription(
          kakaoResult.status === "fulfilled" ? kakaoResult.value?.subscription || null : null
        );
        setNiceSubscription(
          niceResult.status === "fulfilled" ? niceResult.value?.subscription || null : null
        );

        if (kakaoResult.status === "rejected" && niceResult.status === "rejected") {
          setSubscriptionError("구독 상태를 불러오지 못했습니다.");
        }
      } finally {
        if (showLoading) setLoadingSubscriptions(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    loadSubscriptions({ showLoading: true });
  }, [loadSubscriptions]);

  const activeKakaoSubscription =
    kakaoSubscription?.status === "active" ? kakaoSubscription : null;
  const activeNiceSubscription =
    niceSubscription?.status === "active" ? niceSubscription : null;
  const hasActiveSubscription = Boolean(activeKakaoSubscription || activeNiceSubscription);
  const hasMultipleActiveSubscriptions =
    Boolean(activeKakaoSubscription && activeNiceSubscription);

  const handleCancelPlan = useCallback(async () => {
    if (!user?.id || isCancellingPlan || !hasActiveSubscription) return;

    setSubscriptionError("");
    setSubscriptionNotice("");
    setIsCancellingPlan(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("구독 해지에는 로그인 세션이 필요합니다.");
      }

      const activeProviders = [
        activeKakaoSubscription && {
          label: "카카오페이",
          cancel: () => inactiveKakaoPaySubscription({}, { accessToken }),
        },
        activeNiceSubscription && {
          label: "나이스페이먼츠 카드",
          cancel: () => inactiveNicePaymentsSubscription({}, { accessToken }),
        },
      ].filter(Boolean);

      const results = await Promise.allSettled(activeProviders.map((provider) => provider.cancel()));
      const cancelledProviders = [];
      const failedMessages = [];

      results.forEach((result, index) => {
        const providerLabel = activeProviders[index]?.label || "구독";
        if (result.status === "fulfilled") {
          cancelledProviders.push(providerLabel);
          return;
        }
        failedMessages.push(`${providerLabel}: ${result.reason?.message || "해지에 실패했습니다."}`);
      });

      await loadSubscriptions({ showLoading: false });
      await onRefresh?.();

      if (cancelledProviders.length) {
        setSubscriptionNotice(
          `${cancelledProviders.join(", ")} 정기결제를 해지했습니다. 현재 이용 기간은 만료일까지 유지됩니다.`
        );
      }

      if (failedMessages.length) {
        setSubscriptionError(
          cancelledProviders.length
            ? `일부 구독만 해지되었습니다. ${failedMessages.join(" / ")}`
            : failedMessages.join(" / ")
        );
      }
    } catch (error) {
      setSubscriptionError(error?.message || "플랜 해지에 실패했습니다.");
    } finally {
      setIsCancellingPlan(false);
    }
  }, [
    activeKakaoSubscription,
    activeNiceSubscription,
    hasActiveSubscription,
    isCancellingPlan,
    loadSubscriptions,
    onRefresh,
    user?.id,
  ]);

  const currentPlanLabel = loadingTier ? "확인 중..." : getTierLabel(currentTier);
  const currentTierNote = loadingTier
    ? "요금제 상태를 불러오는 중입니다."
    : currentTier === "free"
      ? "무료 플랜"
      : Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
        ? `${Number(currentTierRemainingDays)}일 남음`
        : currentTierExpiresAt
          ? `만료 ${formatDateTime(currentTierExpiresAt)}`
          : "만료일 확인 필요";

  const accountSummary = useMemo(() => {
    if (user?.email) {
      return {
        status: "로그인됨",
        description: user.email,
      };
    }

    return {
      status: authEnabled ? "게스트" : "비회원 모드",
      description: authEnabled
        ? "로그인 후 결제와 피드백을 연결할 수 있습니다."
        : "현재는 로그인 없이 사용하는 모드입니다.",
    };
  }, [authEnabled, user?.email]);

  const paymentSummary = useMemo(() => {
    if (hasMultipleActiveSubscriptions) {
      return {
        value: "복수 정기결제",
        description: "카카오페이와 카드 정기결제가 모두 활성입니다.",
      };
    }

    if (activeNiceSubscription) {
      return {
        value: "카드 정기결제",
        description: activeNiceSubscription.nextChargeAt
          ? `다음 결제 ${formatDateTime(activeNiceSubscription.nextChargeAt)}`
          : "카드 자동결제 활성",
      };
    }

    if (activeKakaoSubscription) {
      return {
        value: "카카오페이 정기결제",
        description: activeKakaoSubscription.nextChargeAt
          ? `다음 결제 ${formatDateTime(activeKakaoSubscription.nextChargeAt)}`
          : "카카오페이 자동결제 활성",
      };
    }

    if (currentTier === "free") {
      return {
        value: "미구독",
        description: "현재 Free 플랜 사용 중입니다.",
      };
    }

    if (currentTierExpiresAt || Number.isFinite(Number(currentTierRemainingDays))) {
      return {
        value: "구독 없음",
        description:
          Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
            ? `${Number(currentTierRemainingDays)}일 남음`
            : currentTierExpiresAt
              ? `만료 ${formatDateTime(currentTierExpiresAt)}`
              : "활성 정기결제 없이 이용 중입니다.",
      };
    }

    return {
      value: "확인 필요",
      description: subscriptionError || "결제 수단을 아직 확인하지 못했습니다.",
    };
  }, [
    activeKakaoSubscription,
    activeNiceSubscription,
    currentTier,
    currentTierExpiresAt,
    currentTierRemainingDays,
    hasMultipleActiveSubscriptions,
    subscriptionError,
  ]);

  const subscriptionCards = [
    kakaoSubscription && {
      key: "kakao",
      title: "카카오페이",
      rows: [
        { label: "상태", value: getSubscriptionStatusLabel(kakaoSubscription?.status) },
        { label: "요금제", value: getTierLabel(kakaoSubscription?.tier || "free") },
        { label: "결제 주기", value: `${kakaoSubscription?.billingMonths || 1}개월` },
        { label: "다음 결제", value: formatDateTime(kakaoSubscription?.nextChargeAt) },
      ],
    },
    niceSubscription && {
      key: "nice",
      title: "카드 결제",
      rows: [
        { label: "상태", value: getSubscriptionStatusLabel(niceSubscription?.status) },
        { label: "요금제", value: getTierLabel(niceSubscription?.tier || "free") },
        {
          label: "결제 수단",
          value:
            niceSubscription?.cardName ||
            niceSubscription?.cardNoMasked ||
            niceSubscription?.bidMasked ||
            "-",
        },
        { label: "다음 결제", value: formatDateTime(niceSubscription?.nextChargeAt) },
      ],
    },
  ].filter(Boolean);

  const nextBillingLabel =
    activeNiceSubscription?.nextChargeAt || activeKakaoSubscription?.nextChargeAt
      ? formatDateTime(activeNiceSubscription?.nextChargeAt || activeKakaoSubscription?.nextChargeAt)
      : currentTier === "free"
        ? "-"
        : currentTierExpiresAt
          ? formatDateTime(currentTierExpiresAt)
          : currentTierNote;

  const sectionMeta = {
    account: {
      title: "계정",
      description: "현재 로그인 상태와 연결된 계정을 확인합니다.",
    },
    subscription: {
      title: "구독",
      description: "현재 플랜과 결제 방식을 짧게 확인합니다.",
    },
    theme: {
      title: "테마",
      description: "앱 테마를 바로 전환합니다.",
    },
    feedback: {
      title: "개선 요청",
      description: "불편한 점이나 제안을 바로 남깁니다.",
    },
  };

  const panelClass = isLight
    ? "border-slate-200 bg-[#f7f7f7] text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
    : "border-white/10 bg-[#232323] text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.72)]";
  const headerClass = isLight ? "border-slate-200 bg-white/90" : "border-white/10 bg-white/5";
  const asideClass = isLight ? "border-slate-200 bg-[#f3f3f3]" : "border-white/10 bg-[#2c2c2c]";
  const cardClass = isLight ? "border-slate-200 bg-white" : "border-white/10 bg-[#313131]";
  const mutedTextClass = isLight ? "text-slate-500" : "text-slate-400";
  const bodyTextClass = isLight ? "text-slate-600" : "text-slate-300";

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center px-4 py-5">
      <button
        type="button"
        aria-label="설정 창 닫기"
        onClick={onClose}
        className={`absolute inset-0 ${isLight ? "bg-slate-900/16" : "bg-black/76"} backdrop-blur-[2px]`}
      />

      <div
        className={`relative z-[171] flex max-h-[min(78vh,30rem)] w-full max-w-[36rem] flex-col overflow-hidden rounded-[1.2rem] border ${panelClass}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${headerClass}`}>
          <p className="text-sm font-semibold">설정</p>
          <button
            type="button"
            onClick={onClose}
            className={`${mutedTextClass} transition hover:text-white`}
            aria-label="닫기"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="m5 5 10 10" />
              <path d="m15 5-10 10" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className={`w-[9.6rem] shrink-0 border-r px-3 py-3 ${asideClass}`}>
            <nav className="grid gap-1">
              {SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? isLight
                          ? "bg-slate-900 text-white"
                          : "bg-white/10 text-white"
                        : isLight
                          ? "text-slate-600 hover:bg-white hover:text-slate-900"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <SectionIcon id={section.id} />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="show-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div>
              <p className="text-base font-semibold">{sectionMeta[activeSection].title}</p>
              <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                {sectionMeta[activeSection].description}
              </p>
            </div>

            {activeSection === "account" && (
              <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniInfo label="계정 상태" value={accountSummary.status} isLight={isLight} />
                  <MiniInfo label="현재 플랜" value={currentPlanLabel} isLight={isLight} />
                </div>

                <div className="mt-4">
                  <DetailRows
                    isLight={isLight}
                    rows={[
                      { label: "이메일", value: user?.email || "-" },
                      { label: "플랜 상태", value: currentTierNote },
                      {
                        label: "활성 프로필",
                        value:
                          activeProfile?.name ||
                          (currentTier === "premium" ? "선택되지 않음" : "-"),
                      },
                      {
                        label: "공간 모드",
                        value:
                          currentTier === "premium"
                            ? premiumSpaceMode === "shared"
                              ? "공유 스페이스"
                              : "개인 스페이스"
                            : "-",
                      },
                    ]}
                  />
                </div>

                <p className={`mt-4 text-xs leading-5 ${bodyTextClass}`}>
                  {accountSummary.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {user && onRefresh && (
                    <button
                      type="button"
                      onClick={onRefresh}
                      disabled={isRefreshing}
                      className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                      data-ghost-size="sm"
                      style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
                    >
                      {isRefreshing ? "동기화 중..." : "새로고침"}
                    </button>
                  )}
                  {user ? (
                    <button
                      type="button"
                      onClick={onSignOut}
                      disabled={signingOut}
                      className="ghost-button text-xs text-rose-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {signingOut ? "로그아웃 중..." : "로그아웃"}
                    </button>
                  ) : authEnabled ? (
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      로그인
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {activeSection === "subscription" && (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniInfo label="구독 방식" value={paymentSummary.value} isLight={isLight} />
                    <MiniInfo
                      label="정기결제 상태"
                      value={
                        hasMultipleActiveSubscriptions
                          ? "중복 확인 필요"
                          : activeKakaoSubscription || activeNiceSubscription
                            ? "활성"
                            : "없음"
                      }
                      isLight={isLight}
                    />
                  </div>

                  <div className="mt-4">
                    <DetailRows
                      isLight={isLight}
                      rows={[
                        { label: "현재 플랜", value: currentPlanLabel },
                        { label: "플랜 상태", value: currentTierNote },
                        { label: "만료/다음 결제", value: nextBillingLabel },
                        {
                          label: "상세 메모",
                          value: loadingSubscriptions
                            ? "불러오는 중..."
                            : paymentSummary.description,
                        },
                      ]}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {onOpenBilling && (
                      <button
                        type="button"
                        onClick={onOpenBilling}
                        className="ghost-button text-xs text-emerald-100"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "52, 211, 153" }}
                      >
                        요금제 열기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => loadSubscriptions({ showLoading: true })}
                      disabled={loadingSubscriptions || !user}
                      className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                      data-ghost-size="sm"
                      style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
                    >
                      {loadingSubscriptions ? "불러오는 중..." : "구독 새로고침"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      disabled={loadingSubscriptions || !user || !hasActiveSubscription || isCancellingPlan}
                      className="ghost-button text-xs text-rose-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {isCancellingPlan ? "플랜 취소 중..." : "플랜 취소"}
                    </button>
                  </div>

                  {subscriptionNotice && (
                    <p className={`mt-3 text-xs ${isLight ? "text-emerald-600" : "text-emerald-300"}`}>
                      {subscriptionNotice}
                    </p>
                  )}
                  {subscriptionError && (
                    <p className={`mt-3 text-xs ${isLight ? "text-amber-600" : "text-amber-300"}`}>
                      {subscriptionError}
                    </p>
                  )}
                </div>

                {subscriptionCards.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {subscriptionCards.map((card) => (
                      <div key={card.key} className={`rounded-2xl border p-4 ${cardClass}`}>
                        <p className="text-sm font-semibold">{card.title}</p>
                        <div className="mt-3">
                          <DetailRows rows={card.rows} isLight={isLight} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeSection === "theme" && (
              <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {["dark", "light"].map((option) => {
                    const isActive = theme === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onThemeChange?.(option)}
                        aria-pressed={isActive}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? isLight
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-emerald-300/40 bg-emerald-400/12 text-emerald-100"
                            : isLight
                              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                              : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20"
                        }`}
                      >
                        <p className="text-sm font-semibold">
                          {option === "dark" ? "다크" : "라이트"}
                        </p>
                        <p className="mt-1 text-xs leading-5 opacity-80">
                          {option === "dark"
                            ? "어두운 배경으로 집중하기 좋습니다."
                            : "밝은 배경으로 문서를 보기 좋습니다."}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className={`mt-4 text-sm ${bodyTextClass}`}>
                  현재 {getThemeLabel(theme)} 테마가 적용되어 있습니다.
                </p>
              </div>
            )}

            {activeSection === "feedback" && (
              <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <p className="text-sm font-semibold">서비스 개선에 도움을 주세요</p>
                <p className={`mt-3 text-sm leading-7 ${bodyTextClass}`}>
                  {onOpenFeedbackDialog
                    ? "버그, 제안, 불편한 점을 짧게 남겨주시면 됩니다. 어떤 화면에서 막혔는지 적어주시면 바로 확인하기 좋습니다."
                    : "현재 모드에서는 피드백 기능이 연결되어 있지 않습니다."}
                </p>

                {onOpenFeedbackDialog && (
                  <button
                    type="button"
                    onClick={onOpenFeedbackDialog}
                    className={`mt-4 ghost-button text-sm ${isLight ? "text-slate-700" : "text-slate-100"}`}
                    style={{ "--ghost-color": isLight ? "71, 85, 105" : "226, 232, 240" }}
                  >
                    피드백 남기기
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
