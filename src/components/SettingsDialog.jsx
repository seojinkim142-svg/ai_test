import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFeedbackInbox, fetchFeedbackReplies, sendFeedbackReply } from "../services/feedback";
import { fetchKakaoPaySubscriptionStatus, inactiveKakaoPaySubscription } from "../services/kakaopay";
import { fetchNicePaymentsSubscriptionStatus, inactiveNicePaymentsSubscription } from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { getTierLabel } from "../utils/appStateHelpers";

const SECTIONS = [
  { id: "account", label: "ê³„ì •" },
  { id: "subscription", label: "êµ¬ë…" },
  { id: "theme", label: "?Œë§ˆ" },
  { id: "feedback", label: "ê°œì„  ?”ì²­" },
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
  return theme === "light" ? "¶óÀÌÆ®" : "´ÙÅ©";
}

function getSubscriptionStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "?œì„±";
  if (normalized === "inactive") return "ºñÈ°¼º";
  return "¹Ìµî·Ï";
}

function getFeedbackCategoryLabel(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "bug") return "ë²„ê·¸";
  if (normalized === "feature") return "ê¸°ëŠ¥ ?œì•ˆ";
  if (normalized === "ux") return "»ç¿ë¼º";
  return "?¼ë°˜";
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
          setSubscriptionError("êµ¬ë… ?íƒœë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??");
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
        throw new Error("êµ¬ë… ?´ì??ëŠ” ë¡œê·¸???¸ì…˜???„ìš”?©ë‹ˆ??");
      }

      const activeProviders = [
        activeKakaoSubscription && {
          label: "Ä«Ä«¿ÀÆäÀÌ",
          cancel: () => inactiveKakaoPaySubscription({}, { accessToken }),
        },
        activeNiceSubscription && {
          label: "?˜ì´?¤í˜?´ë¨¼ì¸?ì¹´ë“œ",
          cancel: () => inactiveNicePaymentsSubscription({}, { accessToken }),
        },
      ].filter(Boolean);

      const results = await Promise.allSettled(activeProviders.map((provider) => provider.cancel()));
      const cancelledProviders = [];
      const failedMessages = [];

      results.forEach((result, index) => {
        const providerLabel = activeProviders[index]?.label || "êµ¬ë…";
        if (result.status === "fulfilled") {
          cancelledProviders.push(providerLabel);
          return;
        }
        failedMessages.push(`${providerLabel}: ${result.reason?.message || "?´ì????¤íŒ¨?ˆìŠµ?ˆë‹¤."}`);
      });

      await loadSubscriptions({ showLoading: false });
      await onRefresh?.();

      if (cancelledProviders.length) {
        setSubscriptionNotice(
          `${cancelledProviders.join(", ")} ?•ê¸°ê²°ì œë¥??´ì??ˆìŠµ?ˆë‹¤. ?„ì¬ ?´ìš© ê¸°ê°„?€ ë§Œë£Œ?¼ê¹Œì§€ ? ì??©ë‹ˆ??`
        );
      }

      if (failedMessages.length) {
        setSubscriptionError(
          cancelledProviders.length
            ? `?¼ë? êµ¬ë…ë§??´ì??˜ì—ˆ?µë‹ˆ?? ${failedMessages.join(" / ")}`
            : failedMessages.join(" / ")
        );
      }
    } catch (error) {
      setSubscriptionError(error?.message || "?Œëœ ?´ì????¤íŒ¨?ˆìŠµ?ˆë‹¤.");
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
          setFeedbackInboxError(error?.message || "?¼ë“œë°?ëª©ë¡??ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??");
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
        setFeedbackRepliesError(error?.message || "?µì¥??ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??");
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
        setFeedbackInboxError("?µì¥ ?´ìš©???…ë ¥?´ì£¼?¸ìš”.");
        return;
      }

      setFeedbackInboxError("");
      setFeedbackInboxNotice("");
      setSendingFeedbackReplyId(normalizedId);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("?µì¥??ë³´ë‚´?¤ë©´ ë¡œê·¸???¸ì…˜???„ìš”?©ë‹ˆ??");
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
        setFeedbackInboxNotice("?µì¥???„ì†¡?ˆìŠµ?ˆë‹¤.");
        await loadFeedbackInbox({ showLoading: false });
      } catch (error) {
        setFeedbackInboxError(error?.message || "?µì¥ ?„ì†¡???¤íŒ¨?ˆìŠµ?ˆë‹¤.");
      } finally {
        setSendingFeedbackReplyId(null);
      }
    },
    [feedbackReplyDrafts, loadFeedbackInbox, sendingFeedbackReplyId]
  );

  const currentPlanLabel = loadingTier ? "?•ì¸ ì¤?.." : getTierLabel(currentTier);
  const currentTierNote = loadingTier
    ? "?”ê¸ˆ???íƒœë¥?ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤."
    : currentTier === "free"
      ? "ë¬´ë£Œ ?Œëœ"
      : Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
        ? `${Number(currentTierRemainingDays)}???¨ìŒ`
        : currentTierExpiresAt
          ? `ë§Œë£Œ ${formatDateTime(currentTierExpiresAt)}`
          : "ë§Œë£Œ???•ì¸ ?„ìš”";

  const accountSummary = useMemo(() => {
    if (user?.email) {
      return {
        status: "ë¡œê·¸?¸ë¨",
        description: user.email,
      };
    }

    return {
      status: authEnabled ? "°Ô½ºÆ®" : "ºñÈ¸¿ø ¸ğµå",
      description: authEnabled
        ? "ë¡œê·¸????ê²°ì œ?€ ?¼ë“œë°±ì„ ?°ê²°?????ˆìŠµ?ˆë‹¤."
        : "?„ì¬??ë¡œê·¸???†ì´ ?¬ìš©?˜ëŠ” ëª¨ë“œ?…ë‹ˆ??",
    };
  }, [authEnabled, user?.email]);

  const paymentSummary = useMemo(() => {
    if (hasMultipleActiveSubscriptions) {
      return {
        value: "ë³µìˆ˜ ?•ê¸°ê²°ì œ",
        description: "ì¹´ì¹´?¤í˜?´ì? ì¹´ë“œ ?•ê¸°ê²°ì œê°€ ëª¨ë‘ ?œì„±?…ë‹ˆ??",
      };
    }

    if (activeNiceSubscription) {
      return {
        value: "ì¹´ë“œ ?•ê¸°ê²°ì œ",
        description: activeNiceSubscription.nextChargeAt
          ? `?¤ìŒ ê²°ì œ ${formatDateTime(activeNiceSubscription.nextChargeAt)}`
          : "ì¹´ë“œ ?ë™ê²°ì œ ?œì„±",
      };
    }

    if (activeKakaoSubscription) {
      return {
        value: "ì¹´ì¹´?¤í˜???•ê¸°ê²°ì œ",
        description: activeKakaoSubscription.nextChargeAt
          ? `?¤ìŒ ê²°ì œ ${formatDateTime(activeKakaoSubscription.nextChargeAt)}`
          : "ì¹´ì¹´?¤í˜???ë™ê²°ì œ ?œì„±",
      };
    }

    if (currentTier === "free") {
      return {
        value: "¹Ì±¸µ¶",
        description: "?„ì¬ Free ?Œëœ ?¬ìš© ì¤‘ì…?ˆë‹¤.",
      };
    }

    if (currentTierExpiresAt || Number.isFinite(Number(currentTierRemainingDays))) {
      return {
        value: "êµ¬ë… ?†ìŒ",
        description:
          Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
            ? `${Number(currentTierRemainingDays)}???¨ìŒ`
            : currentTierExpiresAt
              ? `ë§Œë£Œ ${formatDateTime(currentTierExpiresAt)}`
              : "?œì„± ?•ê¸°ê²°ì œ ?†ì´ ?´ìš© ì¤‘ì…?ˆë‹¤.",
      };
    }

    return {
      value: "?•ì¸ ?„ìš”",
      description: subscriptionError || "ê²°ì œ ?˜ë‹¨???„ì§ ?•ì¸?˜ì? ëª»í–ˆ?µë‹ˆ??",
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
      title: "Ä«Ä«¿ÀÆäÀÌ",
      rows: [
        { label: "?íƒœ", value: getSubscriptionStatusLabel(kakaoSubscription?.status) },
        { label: "¿ä±İÁ¦", value: getTierLabel(kakaoSubscription?.tier || "free") },
        { label: "ê²°ì œ ì£¼ê¸°", value: `${kakaoSubscription?.billingMonths || 1}ê°œì›”` },
        { label: "?¤ìŒ ê²°ì œ", value: formatDateTime(kakaoSubscription?.nextChargeAt) },
      ],
    },
    niceSubscription && {
      key: "nice",
      title: "ì¹´ë“œ ê²°ì œ",
      rows: [
        { label: "?íƒœ", value: getSubscriptionStatusLabel(niceSubscription?.status) },
        { label: "¿ä±İÁ¦", value: getTierLabel(niceSubscription?.tier || "free") },
        {
          label: "ê²°ì œ ?˜ë‹¨",
          value:
            niceSubscription?.cardName ||
            niceSubscription?.cardNoMasked ||
            niceSubscription?.bidMasked ||
            "-",
        },
        { label: "?¤ìŒ ê²°ì œ", value: formatDateTime(niceSubscription?.nextChargeAt) },
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
      title: "ê³„ì •",
      description: "?„ì¬ ë¡œê·¸???íƒœ?€ ?°ê²°??ê³„ì •???•ì¸?©ë‹ˆ??",
    },
    subscription: {
      title: "êµ¬ë…",
      description: "?„ì¬ ?Œëœê³?ê²°ì œ ë°©ì‹??ì§§ê²Œ ?•ì¸?©ë‹ˆ??",
    },
    theme: {
      title: "?Œë§ˆ",
      description: "???Œë§ˆë¥?ë°”ë¡œ ?„í™˜?©ë‹ˆ??",
    },
    feedback: {
      title: "ê°œì„  ?”ì²­",
      description: "ë¶ˆí¸???ì´???œì•ˆ??ë°”ë¡œ ?¨ê¹?ˆë‹¤.",
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
        aria-label="?¤ì • ì°??«ê¸°"
        onClick={onClose}
        className={`absolute inset-0 ${isLight ? "bg-slate-900/16" : "bg-black/76"} backdrop-blur-[2px]`}
      />

      <div
        className={`relative z-[171] flex max-h-[min(78vh,30rem)] w-full max-w-[36rem] flex-col overflow-hidden rounded-[1.2rem] border ${panelClass}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${headerClass}`}>
          <p className="text-sm font-semibold">?¤ì •</p>
          <button
            type="button"
            onClick={onClose}
            className={`${mutedTextClass} transition hover:text-white`}
            aria-label="?«ê¸°"
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
                  <MiniInfo label="ê³„ì • ?íƒœ" value={accountSummary.status} isLight={isLight} />
                  <MiniInfo label="?„ì¬ ?Œëœ" value={currentPlanLabel} isLight={isLight} />
                </div>

                <div className="mt-4">
                  <DetailRows
                    isLight={isLight}
                    rows={[
                      { label: "ÀÌ¸ŞÀÏ", value: user?.email || "-" },
                      { label: "?Œëœ ?íƒœ", value: currentTierNote },
                      {
                        label: "È°¼º ÇÁ·ÎÇÊ",
                        value:
                          activeProfile?.name ||
                          (currentTier === "premium" ? "? íƒ?˜ì? ?ŠìŒ" : "-"),
                      },
                      {
                        label: "ê³µê°„ ëª¨ë“œ",
                        value:
                          currentTier === "premium"
                            ? premiumSpaceMode === "shared"
                              ? "ê³µìœ  ?¤í˜?´ìŠ¤"
                              : "ê°œì¸ ?¤í˜?´ìŠ¤"
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
                      {isRefreshing ? "?™ê¸°??ì¤?.." : "?ˆë¡œê³ ì¹¨"}
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
                      {signingOut ? "ë¡œê·¸?„ì›ƒ ì¤?.." : "ë¡œê·¸?„ì›ƒ"}
                    </button>
                  ) : authEnabled ? (
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      ë¡œê·¸??                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {activeSection === "subscription" && (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniInfo label="êµ¬ë… ë°©ì‹" value={paymentSummary.value} isLight={isLight} />
                    <MiniInfo
                      label="?•ê¸°ê²°ì œ ?íƒœ"
                      value={
                        hasMultipleActiveSubscriptions
                          ? "ì¤‘ë³µ ?•ì¸ ?„ìš”"
                          : activeKakaoSubscription || activeNiceSubscription
                            ? "?œì„±"
                            : "?†ìŒ"
                      }
                      isLight={isLight}
                    />
                  </div>

                  <div className="mt-4">
                    <DetailRows
                      isLight={isLight}
                      rows={[
                        { label: "?„ì¬ ?Œëœ", value: currentPlanLabel },
                        { label: "?Œëœ ?íƒœ", value: currentTierNote },
                        { label: "ë§Œë£Œ/?¤ìŒ ê²°ì œ", value: nextBillingLabel },
                        {
                          label: "?ì„¸ ë©”ëª¨",
                          value: loadingSubscriptions
                            ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?.."
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
                        ?”ê¸ˆ???´ê¸°
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
                      {loadingSubscriptions ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?.." : "êµ¬ë… ?ˆë¡œê³ ì¹¨"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPlan}
                      disabled={loadingSubscriptions || !user || !hasActiveSubscription || isCancellingPlan}
                      className="ghost-button text-xs text-rose-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {isCancellingPlan ? "?Œëœ ì·¨ì†Œ ì¤?.." : "?Œëœ ì·¨ì†Œ"}
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
                          {option === "dark" ? "´ÙÅ©" : "¶óÀÌÆ®"}
                        </p>
                        <p className="mt-1 text-xs leading-5 opacity-80">
                          {option === "dark"
                            ? "?´ë‘??ë°°ê²½?¼ë¡œ ì§‘ì¤‘?˜ê¸° ì¢‹ìŠµ?ˆë‹¤."
                            : "ë°ì? ë°°ê²½?¼ë¡œ ë¬¸ì„œë¥?ë³´ê¸° ì¢‹ìŠµ?ˆë‹¤."}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className={`mt-4 text-sm ${bodyTextClass}`}>
                  ?„ì¬ {getThemeLabel(theme)} ?Œë§ˆê°€ ?ìš©?˜ì–´ ?ˆìŠµ?ˆë‹¤.
                </p>
              </div>
            )}

            {activeSection === "feedback" && (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${cardClass}`}>
                  <p className="text-sm font-semibold">¼­ºñ½º °³¼± ÀÇ°ßÀ» ÁÖ¼¼¿ä.</p>
                  <p className={`mt-3 text-sm leading-7 ${bodyTextClass}`}>
                    {onOpenFeedbackDialog
                      ? "ë²„ê·¸, ?œì•ˆ, ë¶ˆí¸???ì„ ì§§ê²Œ ?¨ê²¨ì£¼ì‹œë©??©ë‹ˆ?? ?´ë–¤ ?”ë©´?ì„œ ë§‰í˜”?”ì? ?ì–´ì£¼ì‹œë©?ë°”ë¡œ ?•ì¸?˜ê¸° ì¢‹ìŠµ?ˆë‹¤."
                      : "?„ì¬ ëª¨ë“œ?ì„œ???¼ë“œë°?ê¸°ëŠ¥???°ê²°?˜ì–´ ?ˆì? ?ŠìŠµ?ˆë‹¤."}
                  </p>

                  {onOpenFeedbackDialog && (
                    <button
                      type="button"
                      onClick={onOpenFeedbackDialog}
                      className={`mt-4 ghost-button text-sm ${isLight ? "text-slate-700" : "text-slate-100"}`}
                      style={{ "--ghost-color": isLight ? "71, 85, 105" : "226, 232, 240" }}
                    >
                      ÇÇµå¹é ³²±â±â
                    </button>
                  )}
                </div>

                {user?.id && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">?µì¥</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          ?´ì˜?ê? ë³´ë‚¸ ?µì¥???¤ë©´ ?¬ê¸°???•ì¸?????ˆìŠµ?ˆë‹¤.
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
                        {loadingFeedbackReplies ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?." : "?ˆë¡œê³ ì¹¨"}
                      </button>
                    </div>

                    {feedbackRepliesError && (
                      <p className={`mt-3 text-xs ${isLight ? "text-amber-600" : "text-amber-300"}`}>
                        {feedbackRepliesError}
                      </p>
                    )}

                    {loadingFeedbackReplies ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>?µì¥??ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤.</p>
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
                                <p className="text-sm font-semibold">?´ì˜?€ ?µì¥</p>
                                <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                  {formatDateTime(entry?.createdAt)}
                                  {entry?.responderEmail ? ` Â· ${entry.responderEmail}` : ""}
                                </p>
                                {entry?.feedback && (
                                  <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                    {getFeedbackCategoryLabel(entry.feedback.category)}
                                    {entry?.feedback?.docName ? ` Â· ${entry.feedback.docName}` : ""}
                                    {entry?.feedback?.panel ? ` Â· ${entry.feedback.panel}` : ""}
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
                                <span className="font-semibold">³»°¡ º¸³½ ÇÇµå¹é</span>
                                <p className="mt-1 whitespace-pre-wrap">{entry.feedback.excerpt}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>?„ì§ ë°›ì? ?µì¥???†ìŠµ?ˆë‹¤.</p>
                    )}
                  </div>
                )}

                {user?.id && canManageFeedback === true && (
                  <div className={`mt-3 rounded-2xl border p-4 ${cardClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">ÇÇµå¹é °ü¸®</p>
                        <p className={`mt-1 text-xs leading-5 ${bodyTextClass}`}>
                          ?œì¶œ???•ë³´?€ ë¬¸ë§¥??ë³´ê³  ë°”ë¡œ ?µì¥ ë©”ì¼??ë³´ë‚¼ ???ˆìŠµ?ˆë‹¤.
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
                        {loadingFeedbackInbox ? "ë¶ˆëŸ¬?¤ëŠ” ì¤?." : "?ˆë¡œê³ ì¹¨"}
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
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>?¼ë“œë°?ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤.</p>
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
                                    {entry?.userEmail || "?´ë©”???†ìŒ"} Â· {getFeedbackCategoryLabel(entry?.category)} Â·{" "}
                                    {formatDateTime(entry?.createdAt)}
                                  </p>
                                  {(entry?.docName || entry?.panel) && (
                                    <p className={`mt-1 text-[11px] ${mutedTextClass}`}>
                                      {[entry?.docName, entry?.panel].filter(Boolean).join(" Â· ")}
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
                                  {entry?.status === "replied" ? "´äÀå ¿Ï·á" : "¹Ì´äÀå"}
                                </span>
                              </div>

                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry?.content || "-"}</p>

                              {entry?.lastRepliedAt && (
                                <p className={`mt-3 text-[11px] leading-5 ${mutedTextClass}`}>
                                  ìµœê·¼ ?µì¥ {formatDateTime(entry.lastRepliedAt)}
                                  {entry?.lastReplyExcerpt ? ` Â· ${entry.lastReplyExcerpt}` : ""}
                                </p>
                              )}

                              <textarea
                                value={draftValue}
                                onChange={(event) => handleFeedbackReplyDraftChange(entryId, event.target.value)}
                                rows={3}
                                maxLength={2000}
                                placeholder="???¼ë“œë°±ì— ?µì¥???´ìš©???…ë ¥?˜ì„¸??"
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
                                  {isReplying ? "´äÀå Àü¼Û Áß.." : "´äÀå º¸³»±â"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : canManageFeedback ? (
                      <p className={`mt-4 text-sm ${bodyTextClass}`}>ìµœê·¼ ?¼ë“œë°±ì´ ?†ìŠµ?ˆë‹¤.</p>
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
