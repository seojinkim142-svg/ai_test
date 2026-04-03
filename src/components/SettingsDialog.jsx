import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFeedbackInbox, fetchFeedbackReplies, sendFeedbackReply } from "../services/feedback";
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
  if (normalized === "inactive") return "비활성";
  return "없음";
}

function getFeedbackCategoryLabel(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "bug") return "버그";
  if (normalized === "feature") return "기능 제안";
  if (normalized === "ux") return "사용성";
  return "일반";
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
  const [feedbackInbox, setFeedbackInbox] = useState([]);
  const [loadingFeedbackInbox, setLoadingFeedbackInbox] = useState(false);
  const [canManageFeedback, setCanManageFeedback] = useState(false);
  const [feedbackInboxError, setFeedbackInboxError] = useState("");
  const [feedbackInboxNotice, setFeedbackInboxNotice] = useState("");
  const [feedbackReplyDrafts, setFeedbackReplyDrafts] = useState({});
  const [sendingFeedbackReplyId, setSendingFeedbackReplyId] = useState(null);
  const [feedbackReplies, setFeedbackReplies] = useState([]);
  const [loadingFeedbackReplies, setLoadingFeedbackReplies] = useState(false);
  const [feedbackRepliesError, setFeedbackRepliesError] = useState("");

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

  useEffect(() => {
    if (user?.id) return;
    setFeedbackInbox([]);
    setCanManageFeedback(false);
    setFeedbackInboxError("");
    setFeedbackInboxNotice("");
    setFeedbackReplyDrafts({});
    setSendingFeedbackReplyId(null);
    setFeedbackReplies([]);
    setFeedbackRepliesError("");
  }, [user?.id]);

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
        throw new Error("구독을 취소하려면 로그인 세션이 필요합니다.");
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
        failedMessages.push(`${providerLabel}: ${result.reason?.message || "취소에 실패했습니다."}`);
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
      setSubscriptionError(error?.message || "플랜 취소에 실패했습니다.");
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

  const loadFeedbackInbox = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!user?.id) {
        setFeedbackInbox([]);
        setCanManageFeedback(null);
        setFeedbackInboxError("");
        setFeedbackInboxNotice("");
        return;
      }

      if (showLoading) setLoadingFeedbackInbox(true);
      setFeedbackInboxError("");

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setCanManageFeedback(false);
          setFeedbackInbox([]);
          return;
        }

        const result = await fetchFeedbackInbox({ accessToken, limit: 20 });
        setFeedbackInbox(Array.isArray(result?.feedback) ? result.feedback : []);
        setCanManageFeedback(true);
      } catch (error) {
        if (Number(error?.status) === 403) {
          setCanManageFeedback(false);
          setFeedbackInbox([]);
          setFeedbackInboxError("");
        } else {
          setCanManageFeedback((prev) => (prev === null ? true : prev));
          setFeedbackInboxError(error?.message || "피드백 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (showLoading) setLoadingFeedbackInbox(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (activeSection !== "feedback" || !user?.id || canManageFeedback === false) return;
    loadFeedbackInbox({ showLoading: true });
  }, [activeSection, canManageFeedback, loadFeedbackInbox, user?.id]);

  const loadFeedbackReplies = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!user?.id) {
        setFeedbackReplies([]);
        setFeedbackRepliesError("");
        return;
      }

      if (showLoading) setLoadingFeedbackReplies(true);
      setFeedbackRepliesError("");

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setFeedbackReplies([]);
          return;
        }

        const result = await fetchFeedbackReplies({ accessToken, limit: 20 });
        setFeedbackReplies(Array.isArray(result?.replies) ? result.replies : []);
      } catch (error) {
        setFeedbackRepliesError(error?.message || "답장을 불러오지 못했습니다.");
      } finally {
        if (showLoading) setLoadingFeedbackReplies(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (activeSection !== "feedback" || !user?.id) return;
    loadFeedbackReplies({ showLoading: true });
  }, [activeSection, loadFeedbackReplies, user?.id]);

  const handleFeedbackReplyDraftChange = useCallback((feedbackId, value) => {
    setFeedbackReplyDrafts((prev) => ({
      ...prev,
      [feedbackId]: value,
    }));
  }, []);

  const handleSendFeedbackReply = useCallback(
    async (feedbackId) => {
      const normalizedId = Number(feedbackId);
      if (!Number.isFinite(normalizedId) || normalizedId <= 0 || sendingFeedbackReplyId != null) return;

      const draft = String(feedbackReplyDrafts?.[normalizedId] || "").trim();
      if (!draft) {
        setFeedbackInboxError("답장 내용을 입력해 주세요.");
        return;
      }

      setFeedbackInboxError("");
      setFeedbackInboxNotice("");
      setSendingFeedbackReplyId(normalizedId);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("답장을 보내려면 로그인 세션이 필요합니다.");
        }

        await sendFeedbackReply({
          accessToken,
          feedbackId: normalizedId,
          content: draft,
        });

        setFeedbackReplyDrafts((prev) => ({
          ...prev,
          [normalizedId]: "",
        }));
        setFeedbackInboxNotice("답장을 전송했습니다.");
        await loadFeedbackInbox({ showLoading: false });
      } catch (error) {
        setFeedbackInboxError(error?.message || "답장 전송에 실패했습니다.");
      } finally {
        setSendingFeedbackReplyId(null);
      }
    },
    [feedbackReplyDrafts, loadFeedbackInbox, sendingFeedbackReplyId]
  );

  const currentPlanLabel = loadingTier ? "확인 중.." : getTierLabel(currentTier);
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
        ? "로그인하면 결제와 피드백을 연결할 수 있습니다."
        : "현재는 로그인을 사용하지 않는 모드입니다.",
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
        description: "현재 Free 플랜 이용 중입니다.",
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
                          (currentTier === "premium" ? "선택된 프로필 없음" : "-"),
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
                      {isRefreshing ? "새로고침 중.." : "새로고침"}
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
                      {signingOut ? "로그아웃 중.." : "로그아웃"}
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
                            ? "불러오는 중.."
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
                      {loadingSubscriptions ? "불러오는 중.." : "구독 새로고침"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      disabled={loadingSubscriptions || !user || !hasActiveSubscription || isCancellingPlan}
                      className="ghost-button text-xs text-rose-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {isCancellingPlan ? "플랜 취소 중.." : "플랜 취소"}
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
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                  <p className="text-sm font-semibold">서비스 개선에 도움을 주세요.</p>
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

                {user?.id && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">답장</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          운영자가 보낸 답장이 오면 여기에서 확인할 수 있습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadFeedbackReplies({ showLoading: true })}
                        disabled={loadingFeedbackReplies}
                        className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                        data-ghost-size="sm"
                        style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
                      >
                        {loadingFeedbackReplies ? "불러오는 중.." : "새로고침"}
                      </button>
                    </div>

                    {feedbackRepliesError && (
                      <p className={`mt-3 text-xs ${isLight ? "text-amber-600" : "text-amber-300"}`}>
                        {feedbackRepliesError}
                      </p>
                    )}

                    {loadingFeedbackReplies ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>답장을 불러오는 중입니다.</p>
                    ) : feedbackReplies.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {feedbackReplies.map((entry) => (
                          <div
                            key={Number(entry?.id)}
                            className={`rounded-xl border p-3 ${
                              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">운영자 답장</p>
                                <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                  {formatDateTime(entry?.createdAt)}
                                  {entry?.responderEmail ? ` · ${entry.responderEmail}` : ""}
                                </p>
                                {entry?.feedback && (
                                  <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                    {getFeedbackCategoryLabel(entry.feedback.category)}
                                    {entry?.feedback?.docName ? ` · ${entry.feedback.docName}` : ""}
                                    {entry?.feedback?.panel ? ` · ${entry.feedback.panel}` : ""}
                                  </p>
                                )}
                              </div>
                            </div>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry?.content || "-"}</p>

                            {entry?.feedback?.excerpt && (
                              <div
                                className={`mt-3 rounded-xl border px-3 py-2 text-[11px] leading-5 ${
                                  isLight
                                    ? "border-slate-200 bg-slate-50 text-slate-600"
                                    : "border-white/10 bg-black/20 text-slate-300"
                                }`}
                              >
                                <span className="font-semibold">내가 보낸 피드백</span>
                                <p className="mt-1 whitespace-pre-wrap">{entry.feedback.excerpt}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>아직 받은 답장이 없습니다.</p>
                    )}
                  </div>
                )}

                {user?.id && canManageFeedback === true && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">피드백 관리</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          제출자의 정보와 문맥을 보고 바로 답장 메일을 보낼 수 있습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadFeedbackInbox({ showLoading: true })}
                        disabled={loadingFeedbackInbox}
                        className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                        data-ghost-size="sm"
                        style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
                      >
                        {loadingFeedbackInbox ? "불러오는 중.." : "새로고침"}
                      </button>
                    </div>

                    {feedbackInboxNotice && (
                      <p className={`mt-3 text-xs ${isLight ? "text-emerald-600" : "text-emerald-300"}`}>
                        {feedbackInboxNotice}
                      </p>
                    )}
                    {feedbackInboxError && (
                      <p className={`mt-3 text-xs ${isLight ? "text-amber-600" : "text-amber-300"}`}>
                        {feedbackInboxError}
                      </p>
                    )}

                    {loadingFeedbackInbox ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>피드백 목록을 불러오는 중입니다.</p>
                    ) : feedbackInbox.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {feedbackInbox.map((entry) => {
                          const entryId = Number(entry?.id);
                          const isReplying = sendingFeedbackReplyId === entryId;
                          const draftValue = feedbackReplyDrafts?.[entryId] || "";
                          const senderLabel =
                            entry?.userName || entry?.userEmail || entry?.userId || `feedback-${entryId}`;

                          return (
                            <div
                              key={entryId}
                              className={`rounded-xl border p-3 ${
                                isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{senderLabel}</p>
                                  <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                    {entry?.userEmail || "이메일 없음"} · {getFeedbackCategoryLabel(entry?.category)} ·{" "}
                                    {formatDateTime(entry?.createdAt)}
                                  </p>
                                  {(entry?.docName || entry?.panel) && (
                                    <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                      {[entry?.docName, entry?.panel].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                    entry?.status === "replied"
                                      ? isLight
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-emerald-400/10 text-emerald-200"
                                      : isLight
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-amber-400/10 text-amber-200"
                                  }`}
                                >
                                  {entry?.status === "replied" ? "답장 완료" : "미답장"}
                                </span>
                              </div>

                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry?.content || "-"}</p>

                              {entry?.lastRepliedAt && (
                                <p className={`mt-3 text-[11px] leading-5 ${mutedTextClass}`}>
                                  최근 답장 {formatDateTime(entry.lastRepliedAt)}
                                  {entry?.lastReplyExcerpt ? ` · ${entry.lastReplyExcerpt}` : ""}
                                </p>
                              )}

                              <textarea
                                value={draftValue}
                                onChange={(event) => handleFeedbackReplyDraftChange(entryId, event.target.value)}
                                rows={3}
                                maxLength={2000}
                                placeholder="이 피드백에 답장할 내용을 입력하세요."
                                className={`mt-3 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                                  isLight
                                    ? "border-slate-300 bg-white text-slate-900"
                                    : "border-white/15 bg-white/5 text-slate-100"
                                }`}
                              />

                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleSendFeedbackReply(entryId)}
                                  disabled={isReplying || !String(draftValue || "").trim()}
                                  className="ghost-button text-xs text-emerald-100"
                                  data-ghost-size="sm"
                                  style={{ "--ghost-color": "52, 211, 153" }}
                                >
                                  {isReplying ? "답장 전송 중.." : "답장 보내기"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : canManageFeedback ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>최근 피드백이 없습니다.</p>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
