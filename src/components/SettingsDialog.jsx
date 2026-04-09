import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteFeedbackReply, fetchFeedbackInbox, fetchFeedbackReplies, sendFeedbackReply } from "../services/feedback";
import { fetchKakaoPaySubscriptionStatus, inactiveKakaoPaySubscription } from "../services/kakaopay";
import { fetchNicePaymentsSubscriptionStatus, inactiveNicePaymentsSubscription } from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { getTierLabel } from "../utils/appStateHelpers";
import { getSettingsCopy, getSettingsDateLocale, getSettingsLanguageOptions } from "../utils/settingsCopy";

function formatDateTime(value, locale = "ko-KR") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getThemeLabel(theme, copy) {
  return theme === "light" ? copy.theme.light : copy.theme.dark;
}

function getOutputLanguageLabel(outputLanguage) {
  return getSettingsLanguageOptions().find((option) => option.code === outputLanguage)?.label || "한국어";
}

function getSubscriptionStatusLabel(status, copy) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return copy.status.active;
  if (normalized === "inactive") return copy.status.inactive;
  return copy.status.none;
}

function getFeedbackCategoryLabel(category, copy) {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "bug") return copy.feedbackCategory.bug;
  if (normalized === "feature") return copy.feedbackCategory.feature;
  if (normalized === "ux") return copy.feedbackCategory.ux;
  return copy.feedbackCategory.general;
}

function getLocalizedTierLabel(tier, copy) {
  return copy.planNames[tier] || getTierLabel(tier);
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

  if (id === "language") {
    return (
      <svg {...commonProps}>
        <circle cx="10" cy="10" r="6.5" />
        <path d="M3.8 10h12.4" />
        <path d="M10 3.5c1.7 1.8 2.6 4 2.6 6.5S11.7 14.7 10 16.5C8.3 14.7 7.4 12.5 7.4 10S8.3 5.3 10 3.5Z" />
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
  outputLanguage = "ko",
  onOutputLanguageChange,
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
  const copy = getSettingsCopy(outputLanguage);
  const dateLocale = getSettingsDateLocale(outputLanguage);
  const sections = useMemo(
    () => [
      { id: "account", label: copy.sections.account },
      { id: "subscription", label: copy.sections.subscription },
      { id: "theme", label: copy.sections.theme },
      { id: "feedback", label: copy.sections.feedback },
      { id: "language", label: copy.sections.language },
    ],
    [copy]
  );
  const outputLanguageOptions = useMemo(() => getSettingsLanguageOptions(), []);
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
  const [deletingFeedbackReplyId, setDeletingFeedbackReplyId] = useState(null);

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
          setSubscriptionError(copy.subscription.loadFailed);
        }
      } finally {
        if (showLoading) setLoadingSubscriptions(false);
      }
    },
    [copy.subscription.loadFailed, user?.id]
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
    setDeletingFeedbackReplyId(null);
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
        throw new Error(copy.subscription.cancelNeedsSession);
      }

      const activeProviders = [
        activeKakaoSubscription && {
          label: copy.subscription.kakaoPay,
          cancel: () => inactiveKakaoPaySubscription({}, { accessToken }),
        },
        activeNiceSubscription && {
          label: copy.subscription.niceCardLabel,
          cancel: () => inactiveNicePaymentsSubscription({}, { accessToken }),
        },
      ].filter(Boolean);

      const results = await Promise.allSettled(activeProviders.map((provider) => provider.cancel()));
      const cancelledProviders = [];
      const failedMessages = [];

      results.forEach((result, index) => {
        const providerLabel = activeProviders[index]?.label || copy.subscription.cancelProviderFallback;
        if (result.status === "fulfilled") {
          cancelledProviders.push(providerLabel);
          return;
        }
        failedMessages.push(`${providerLabel}: ${result.reason?.message || copy.subscription.cancelFailed}`);
      });

      await loadSubscriptions({ showLoading: false });
      await onRefresh?.();

      if (cancelledProviders.length) {
        setSubscriptionNotice(copy.subscription.cancelledNotice(cancelledProviders));
      }

      if (failedMessages.length) {
        setSubscriptionError(
          cancelledProviders.length
            ? copy.subscription.partialCancelled(failedMessages.join(" / "))
            : failedMessages.join(" / ")
        );
      }
    } catch (error) {
      setSubscriptionError(error?.message || copy.subscription.planCancelFailed);
    } finally {
      setIsCancellingPlan(false);
    }
  }, [
    activeKakaoSubscription,
    activeNiceSubscription,
    copy.subscription,
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
          setFeedbackInboxError(error?.message || copy.feedback.inboxLoadFailed);
        }
      } finally {
        if (showLoading) setLoadingFeedbackInbox(false);
      }
    },
    [copy.feedback.inboxLoadFailed, user?.id]
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
        if (result?.syncError) {
          setFeedbackRepliesError(result.syncError);
        }
      } catch (error) {
        setFeedbackRepliesError(error?.message || copy.feedback.replyLoadFailed);
      } finally {
        if (showLoading) setLoadingFeedbackReplies(false);
      }
    },
    [copy.feedback.replyLoadFailed, user?.id]
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

  const handleDeleteFeedbackReply = useCallback(
    async (replyId) => {
      const normalizedId = Number(replyId);
      if (!Number.isFinite(normalizedId) || normalizedId <= 0 || deletingFeedbackReplyId != null) return;
      if (!window.confirm(copy.feedback.deleteConfirm)) return;

      setFeedbackRepliesError("");
      setDeletingFeedbackReplyId(normalizedId);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error(copy.feedback.replyDeleteNeedsSession);
        }

        await deleteFeedbackReply({
          accessToken,
          replyId: normalizedId,
        });

        setFeedbackReplies((prev) => prev.filter((entry) => Number(entry?.id) !== normalizedId));
      } catch (error) {
        setFeedbackRepliesError(error?.message || copy.feedback.replyDeleteFailed);
      } finally {
        setDeletingFeedbackReplyId(null);
      }
    },
    [copy.feedback.deleteConfirm, copy.feedback.replyDeleteFailed, copy.feedback.replyDeleteNeedsSession, deletingFeedbackReplyId]
  );

  const handleSendFeedbackReply = useCallback(
    async (feedbackId) => {
      const normalizedId = Number(feedbackId);
      if (!Number.isFinite(normalizedId) || normalizedId <= 0 || sendingFeedbackReplyId != null) return;

      const draft = String(feedbackReplyDrafts?.[normalizedId] || "").trim();
      if (!draft) {
        setFeedbackInboxError(copy.feedback.replyDraftRequired);
        return;
      }

      setFeedbackInboxError("");
      setFeedbackInboxNotice("");
      setSendingFeedbackReplyId(normalizedId);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error(copy.feedback.replyNeedsSession);
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
        setFeedbackInboxNotice(copy.feedback.replySent);
        await loadFeedbackInbox({ showLoading: false });
      } catch (error) {
        setFeedbackInboxError(error?.message || copy.feedback.replySendFailed);
      } finally {
        setSendingFeedbackReplyId(null);
      }
    },
    [
      copy.feedback.replyDraftRequired,
      copy.feedback.replyNeedsSession,
      copy.feedback.replySendFailed,
      copy.feedback.replySent,
      feedbackReplyDrafts,
      loadFeedbackInbox,
      sendingFeedbackReplyId,
    ]
  );

  const currentPlanLabel = loadingTier ? copy.subscription.loadingPlan : getLocalizedTierLabel(currentTier, copy);
  const currentTierNote = loadingTier
    ? copy.subscription.loadingStatus
    : currentTier === "free"
      ? copy.subscription.freePlan
      : Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
        ? copy.subscription.daysRemaining(Number(currentTierRemainingDays))
        : currentTierExpiresAt
          ? copy.subscription.expiresOn(formatDateTime(currentTierExpiresAt, dateLocale))
          : copy.subscription.expiryUnknown;

  const accountSummary = useMemo(() => {
    if (user?.email) {
      return {
        status: copy.account.loggedIn,
        description: user.email,
      };
    }

    return {
      status: authEnabled ? copy.account.guest : copy.account.guestMode,
      description: authEnabled
        ? copy.account.guestDescription
        : copy.account.guestModeDescription,
    };
  }, [authEnabled, copy.account, user?.email]);

  const paymentSummary = useMemo(() => {
    if (hasMultipleActiveSubscriptions) {
      return {
        value: copy.subscription.multipleRecurring,
        description: copy.subscription.multipleRecurringDescription,
      };
    }

    if (activeNiceSubscription) {
      return {
        value: copy.subscription.cardRecurring,
        description: activeNiceSubscription.nextChargeAt
          ? copy.subscription.nextPaymentInline(formatDateTime(activeNiceSubscription.nextChargeAt, dateLocale))
          : copy.subscription.cardRecurringActive,
      };
    }

    if (activeKakaoSubscription) {
      return {
        value: copy.subscription.kakaoRecurring,
        description: activeKakaoSubscription.nextChargeAt
          ? copy.subscription.nextPaymentInline(formatDateTime(activeKakaoSubscription.nextChargeAt, dateLocale))
          : copy.subscription.kakaoRecurringActive,
      };
    }

    if (currentTier === "free") {
      return {
        value: copy.subscription.unsubscribed,
        description: copy.subscription.freePlanDescription,
      };
    }

    if (currentTierExpiresAt || Number.isFinite(Number(currentTierRemainingDays))) {
      return {
        value: copy.subscription.noSubscription,
        description:
          Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
            ? copy.subscription.daysRemaining(Number(currentTierRemainingDays))
            : currentTierExpiresAt
              ? copy.subscription.expiresOn(formatDateTime(currentTierExpiresAt, dateLocale))
              : copy.subscription.withoutRecurring,
      };
    }

    return {
      value: copy.common.unknown,
      description: subscriptionError || copy.subscription.paymentMethodUnknown,
    };
  }, [
    activeKakaoSubscription,
    activeNiceSubscription,
    copy.common.unknown,
    copy.subscription,
    currentTier,
    currentTierExpiresAt,
    currentTierRemainingDays,
    dateLocale,
    hasMultipleActiveSubscriptions,
    subscriptionError,
  ]);

  const subscriptionCards = [
    kakaoSubscription && {
      key: "kakao",
      title: copy.subscription.kakaoPay,
      rows: [
        { label: copy.subscription.status, value: getSubscriptionStatusLabel(kakaoSubscription?.status, copy) },
        { label: copy.subscription.plan, value: getLocalizedTierLabel(kakaoSubscription?.tier || "free", copy) },
        { label: copy.subscription.billingCycle, value: copy.subscription.months(kakaoSubscription?.billingMonths || 1) },
        { label: copy.subscription.nextPayment, value: formatDateTime(kakaoSubscription?.nextChargeAt, dateLocale) },
      ],
    },
    niceSubscription && {
      key: "nice",
      title: copy.subscription.cardPayment,
      rows: [
        { label: copy.subscription.status, value: getSubscriptionStatusLabel(niceSubscription?.status, copy) },
        { label: copy.subscription.plan, value: getLocalizedTierLabel(niceSubscription?.tier || "free", copy) },
        {
          label: copy.subscription.paymentMethod,
          value:
            niceSubscription?.cardName ||
            niceSubscription?.cardNoMasked ||
            niceSubscription?.bidMasked ||
            "-",
        },
        { label: copy.subscription.nextPayment, value: formatDateTime(niceSubscription?.nextChargeAt, dateLocale) },
      ],
    },
  ].filter(Boolean);

  const nextBillingLabel =
    activeNiceSubscription?.nextChargeAt || activeKakaoSubscription?.nextChargeAt
      ? formatDateTime(activeNiceSubscription?.nextChargeAt || activeKakaoSubscription?.nextChargeAt, dateLocale)
      : currentTier === "free"
        ? "-"
        : currentTierExpiresAt
          ? formatDateTime(currentTierExpiresAt, dateLocale)
          : currentTierNote;

  const sectionMeta = {
    account: {
      title: copy.account.title,
      description: copy.account.description,
    },
    subscription: {
      title: copy.subscription.title,
      description: copy.subscription.description,
    },
    theme: {
      title: copy.sections.theme,
      description: copy.theme.current(getThemeLabel(theme, copy)),
    },
    language: {
      title: copy.language.title,
      description: "",
    },
    feedback: {
      title: copy.feedback.title,
      description: copy.feedback.description,
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
        aria-label={copy.modal.closeAria}
        onClick={onClose}
        className={`absolute inset-0 ${isLight ? "bg-slate-900/16" : "bg-black/76"} backdrop-blur-[2px]`}
      />

      <div
        className={`relative z-[171] flex max-h-[min(78vh,30rem)] w-full max-w-[36rem] flex-col overflow-hidden rounded-[1.2rem] border ${panelClass}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${headerClass}`}>
          <p className="text-sm font-semibold">{copy.modal.title}</p>
          <button
            type="button"
            onClick={onClose}
            className={`${mutedTextClass} transition hover:text-white`}
            aria-label={copy.modal.close}
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
              {sections.map((section) => {
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
              {sectionMeta[activeSection].description ? (
                <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                  {sectionMeta[activeSection].description}
                </p>
              ) : null}
            </div>

            {activeSection === "account" && (
              <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniInfo label={copy.account.accountStatus} value={accountSummary.status} isLight={isLight} />
                  <MiniInfo label={copy.account.currentPlan} value={currentPlanLabel} isLight={isLight} />
                </div>

                <div className="mt-4">
                  <DetailRows
                    isLight={isLight}
                    rows={[
                      { label: copy.account.email, value: user?.email || "-" },
                      { label: copy.account.planStatus, value: currentTierNote },
                      {
                        label: copy.account.activeProfile,
                        value:
                          activeProfile?.name ||
                          (currentTier === "premium" ? copy.account.noActiveProfile : "-"),
                      },
                      {
                        label: copy.account.spaceMode,
                        value:
                          currentTier === "premium"
                            ? premiumSpaceMode === "shared"
                              ? copy.account.sharedSpace
                              : copy.account.personalSpace
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
                      {isRefreshing ? copy.common.refreshing : copy.common.refresh}
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
                      {signingOut ? copy.common.loggingOut : copy.common.logout}
                    </button>
                  ) : authEnabled ? (
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      {copy.common.login}
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {activeSection === "subscription" && (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                    <MiniInfo label={copy.subscription.subscriptionMethod} value={paymentSummary.value} isLight={isLight} />
                  </div>

                  <div className="mt-4">
                    <DetailRows
                      isLight={isLight}
                      rows={[
                        { label: copy.account.currentPlan, value: currentPlanLabel },
                        { label: copy.account.planStatus, value: currentTierNote },
                        { label: copy.subscription.expiryOrNextPayment, value: nextBillingLabel },
                        {
                          label: copy.subscription.detailMemo,
                          value: loadingSubscriptions
                            ? copy.common.loading
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
                        {copy.subscription.openBilling}
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
                      {loadingSubscriptions ? copy.common.loading : copy.subscription.refreshSubscription}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      disabled={loadingSubscriptions || !user || !hasActiveSubscription || isCancellingPlan}
                      className="ghost-button text-xs text-rose-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {isCancellingPlan ? copy.subscription.cancellingPlan : copy.subscription.cancelPlan}
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
                          {option === "dark" ? copy.theme.dark : copy.theme.light}
                        </p>
                        <p className="mt-1 text-xs leading-5 opacity-80">
                          {option === "dark"
                            ? copy.theme.darkDescription
                            : copy.theme.lightDescription}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className="hidden">
                  {copy.theme.current(getThemeLabel(theme, copy))}
                </p>
              </div>
            )}

            {activeSection === "language" && (
              <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {outputLanguageOptions.map((option) => {
                    const isActive = outputLanguage === option.code;
                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => onOutputLanguageChange?.(option.code)}
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
                        <p className="text-sm font-semibold">{option.label}</p>
                      </button>
                    );
                  })}
                </div>

                <p className="hidden">
                  {copy.language.current(getOutputLanguageLabel(outputLanguage))}
                </p>
              </div>
            )}

            {activeSection === "feedback" && (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                  <p className="text-sm font-semibold">{copy.feedback.introTitle}</p>
                  <p className={`mt-3 text-sm leading-7 ${bodyTextClass}`}>
                    {onOpenFeedbackDialog
                      ? copy.feedback.introDescription
                      : copy.feedback.introDisabled}
                  </p>

                  {onOpenFeedbackDialog && (
                    <button
                      type="button"
                      onClick={onOpenFeedbackDialog}
                      className={`mt-4 ghost-button text-sm ${isLight ? "text-slate-700" : "text-slate-100"}`}
                      style={{ "--ghost-color": isLight ? "71, 85, 105" : "226, 232, 240" }}
                    >
                      {copy.feedback.leaveFeedback}
                    </button>
                  )}
                </div>

                {user?.id && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{copy.feedback.repliesTitle}</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          {copy.feedback.repliesDescription}
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
                        {loadingFeedbackReplies ? copy.common.loading : copy.common.refresh}
                      </button>
                    </div>

                    {feedbackRepliesError && (
                      <p className={`mt-3 text-xs ${isLight ? "text-amber-600" : "text-amber-300"}`}>
                        {feedbackRepliesError}
                      </p>
                    )}

                    {loadingFeedbackReplies ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>{copy.feedback.repliesLoading}</p>
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
                                <p className="text-sm font-semibold">{copy.feedback.adminReply}</p>
                                <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                  {formatDateTime(entry?.createdAt, dateLocale)}
                                  {entry?.responderEmail ? ` · ${entry.responderEmail}` : ""}
                                </p>
                                {entry?.feedback && (
                                  <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                    {getFeedbackCategoryLabel(entry.feedback.category, copy)}
                                    {entry?.feedback?.docName ? ` · ${entry.feedback.docName}` : ""}
                                    {entry?.feedback?.panel ? ` · ${entry.feedback.panel}` : ""}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteFeedbackReply(entry?.id)}
                                disabled={deletingFeedbackReplyId != null}
                                className="ghost-button text-xs text-rose-100"
                                data-ghost-size="sm"
                                style={{ "--ghost-color": "244, 63, 94" }}
                              >
                                {deletingFeedbackReplyId === Number(entry?.id) ? copy.common.deleting : copy.common.delete}
                              </button>
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
                                <span className="font-semibold">{copy.feedback.myFeedback}</span>
                                <p className="mt-1 whitespace-pre-wrap">{entry.feedback.excerpt}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>{copy.feedback.noReplies}</p>
                    )}
                  </div>
                )}

                {user?.id && canManageFeedback === true && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{copy.feedback.managementTitle}</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          {copy.feedback.managementDescription}
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
                        {loadingFeedbackInbox ? copy.common.loading : copy.common.refresh}
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
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>{copy.feedback.inboxLoading}</p>
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
                                    {entry?.userEmail || copy.feedback.noEmail} · {getFeedbackCategoryLabel(entry?.category, copy)} ·{" "}
                                    {formatDateTime(entry?.createdAt, dateLocale)}
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
                                  {entry?.status === "replied" ? copy.common.replied : copy.common.unreplied}
                                </span>
                              </div>

                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry?.content || "-"}</p>

                              {entry?.lastRepliedAt && (
                                <p className={`mt-3 text-[11px] leading-5 ${mutedTextClass}`}>
                                  {copy.feedback.recentReply(formatDateTime(entry.lastRepliedAt, dateLocale))}
                                  {entry?.lastReplyExcerpt ? ` · ${entry.lastReplyExcerpt}` : ""}
                                </p>
                              )}

                              <textarea
                                value={draftValue}
                                onChange={(event) => handleFeedbackReplyDraftChange(entryId, event.target.value)}
                                rows={3}
                                maxLength={2000}
                                placeholder={copy.feedback.replyPlaceholder}
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
                                  {isReplying ? copy.common.sending : copy.common.send}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : canManageFeedback ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>{copy.feedback.noRecentFeedback}</p>
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
