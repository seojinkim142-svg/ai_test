import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approveKakaoPay, chargeKakaoPaySubscription, fetchKakaoPaySubscriptionStatus, inactiveKakaoPaySubscription, requestKakaoPayReady } from "../services/kakaopay";
import { fetchProTrialStatus } from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { useCardPayment } from "../hooks/useCardPayment";
import { useNiceSubscription } from "../hooks/useNiceSubscription";
import { COMPANY_INFO, LEGAL_LINKS } from "../legal/companyInfo";
import { resolvePublicAppOrigin } from "../utils/appOrigin";
import { clearPaymentReturnPending, markPaymentReturnPending } from "../utils/paymentReturn";

const tierMeta = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};
const planLabelKo = {
  Free: "Free",
  Pro: "Pro",
  Premium: "Premium",
};

const KAKAOPAY_STORAGE_KEY = "kakaopay_session";
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const REFUND_POLICY_TITLE = "[서비스 제공 기간 및 환불 규정 안내]";
const REFUND_POLICY_PRIMARY_ITEMS = [
  "서비스는 구독권 혹은 체험권 구매 후 즉시 사이트에서 제공됩니다.",
  "정기구독 상품의 경우, 정기구독 취소 시 결제된 이용일제 서비스가 제공되며, 그 이후 서비스 사용이 중단됩니다.",
];
const REFUND_POLICY_NOTICE = "다음과 같은 내용으로 환불 규정이 적용됩니다.";
const REFUND_POLICY_SECONDARY_ITEMS = [
  "\"소비자보호법 17조 2항의 5조,용역 또는 '문화산업진흥 기본법'제 2조 제 5호의 디지털 콘텐츠의 제공이 개시된 경우\"의 법률에 따라 정보열람 및 다운로드 상품으로 환불이 제한됨을 안내드립니다.",
];
const REFUND_POLICY_FOOTNOTE =
  "다만, 정보열람 기록이 없을 경우, 7일 이내 청역 철회가 가능합니다.";
const PAYMENT_DISCLOSURE_TITLE = "[서비스 제공 기간 및 이용 조건 안내]";
const PAYMENT_DISCLOSURE_NOTICE = "결제 전 아래 이용 조건을 확인해 주세요.";
const PAYMENT_REFUND_ITEMS = [
  "본 서비스는 디지털 콘텐츠로서 실물 배송 및 교환 대상이 아닙니다.",
  "환불은 관계 법령, 이용약관 및 결제 화면에 고지된 기준에 따라 처리됩니다.",
  "서비스 제공이 개시된 이후의 환불은 약관 및 관계 법령상 제한될 수 있습니다.",
];
const PLAN_OPTIONS = [
  {
    name: "Free",
    label: "Free",
    price: "무료",
    desc: "입문",
    features: ["PDF 최대 4개", "요약 / 퀴즈 / OX 기본", "기본 저장 공간"],
    cta: "Free 선택",
    accent: "148, 163, 184",
  },
  {
    name: "Pro",
    label: "Pro",
    price: "4,900원 / 월",
    desc: "개인 학습",
    features: ["업로드 무제한", "요약 / 퀴즈 / OX / 플래시카드", "우선 처리"],
    cta: "Pro 업그레이드",
    accent: "16, 185, 129",
  },
  {
    name: "Premium",
    label: "Premium",
    price: "16,000원 / 월",
    desc: "공유 학습",
    features: ["최대 4명", "공유 워크스페이스", "팀 학습 플로우"],
    cta: "Premium 업그레이드",
    accent: "56, 189, 248",
  },
];
const kakaoPayPlans = {
  Pro: {
    baseAmount: 4900,
    tier: "pro",
    itemName: "제우시안 프로 월간권",
  },
  Premium: {
    baseAmount: 16000,
    tier: "premium",
    itemName: "제우시안 프리미엄 월간권",
  },
};
const BILLING_MONTH_OPTIONS = [1, 2];
const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const KAKAO_RETURN_QUERY_KEYS = ["pg_token", "kakaoPay", "message"];

function buildKakaoReturnUrl(state) {
  if (typeof window === "undefined") return "";

  const appOrigin = resolvePublicAppOrigin() || window.location.origin;

  try {
    const target = new URL("/api/kakaopay/return", `${appOrigin}/`);
    target.searchParams.set("state", String(state || "").trim().toLowerCase() || "fail");
    if (IS_NATIVE_PLATFORM) {
      target.searchParams.set("mode", "native");
    }
    return target.toString();
  } catch {
    return "";
  }
}

function getKakaoReturnKey(params) {
  const parts = KAKAO_RETURN_QUERY_KEYS.map((key) => `${key}:${String(params.get(key) || "").trim()}`);
  const hasValue = parts.some((entry) => !entry.endsWith(":"));
  return hasValue ? parts.join("|") : "";
}

function shouldUseMobileKakaoRedirect() {
  if (typeof window === "undefined") return false;

  const ua = String(window.navigator?.userAgent || "");
  const platform = String(window.navigator?.platform || "");
  const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);
  const hasTouch = "ontouchstart" in window || maxTouchPoints > 0;
  const isIpad =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  const isMobilePhone = /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua);

  return isMobilePhone || isIpad || isAndroidTablet || (hasTouch && /Mobile/i.test(ua));
}

function resolveKakaoRedirectUrl(data) {
  const pcUrl = String(data?.next_redirect_pc_url || "").trim();
  const mobileUrl = String(data?.next_redirect_mobile_url || "").trim();
  const appUrl = String(data?.next_redirect_app_url || "").trim();

  if (IS_NATIVE_PLATFORM) {
    return appUrl || mobileUrl || pcUrl;
  }

  if (shouldUseMobileKakaoRedirect()) {
    return mobileUrl || appUrl || pcUrl;
  }

  return pcUrl || mobileUrl || appUrl;
}

function formatTierExpiryLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function addMonthsLocal(dateInput, monthsToAdd) {
  const base = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(base.getTime())) return new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + monthsToAdd);
  return next;
}

function getTierTimeRemaining(expiresAt, nowMs = Date.now()) {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;

  const now = new Date(nowMs);
  const expiresMs = expiry.getTime();
  const nowTime = now.getTime();

  if (!Number.isFinite(nowTime) || expiresMs <= nowTime) {
    return {
      months: 0,
      days: 0,
      hours: 0,
      expired: true,
      totalDaysCeil: 0,
    };
  }

  let months = (expiry.getFullYear() - now.getFullYear()) * 12 + (expiry.getMonth() - now.getMonth());
  if (months < 0) months = 0;

  let anchor = addMonthsLocal(now, months);
  while (months > 0 && anchor.getTime() > expiresMs) {
    months -= 1;
    anchor = addMonthsLocal(now, months);
  }
  while (months < 240 && addMonthsLocal(now, months + 1).getTime() <= expiresMs) {
    months += 1;
  }
  anchor = addMonthsLocal(now, months);

  let remainingMs = Math.max(0, expiresMs - anchor.getTime());
  const days = Math.floor(remainingMs / MS_PER_DAY);
  remainingMs -= days * MS_PER_DAY;
  const hours = Math.floor(remainingMs / MS_PER_HOUR);

  return {
    months,
    days,
    hours,
    expired: false,
    totalDaysCeil: Math.max(1, Math.ceil((expiresMs - nowTime) / MS_PER_DAY)),
  };
}

function formatTierTimeRemainingLabel(remaining) {
  if (!remaining) return "";
  if (remaining.expired) return "만료됨";
  return `${remaining.months}개월 ${remaining.days}일 ${remaining.hours}시간`;
}

function formatSubscriptionStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "정기결제 활성";
  if (normalized === "inactive") return "정기결제 해지됨";
  return normalized || "미등록";
}

function PaymentPage({
  onClose,
  currentTier = "free",
  currentTierExpiresAt = null,
  currentTierRemainingDays = null,
  theme = "dark",
  user,
  onTierUpdated,
  paymentReturnSignal = 0,
}) {
  const [selectedPlan, setSelectedPlan] = useState(tierMeta[currentTier] || "Free");
  const [billingMonths, setBillingMonths] = useState(1);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [proTrialStatus, setProTrialStatus] = useState({
    eligible: false,
    claimedAt: null,
    currentTier: currentTier || "free",
  });
  const [isLoadingProTrial, setIsLoadingProTrial] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState(null);
  const showSubscriptionSettings = false;
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);
  const [isChargingSubscription, setIsChargingSubscription] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const handledKakaoReturnRef = useRef("");
  const cardWidgetSectionRef = useRef(null);
  const isLight = theme === "light";
  const surfaceClass = isLight
    ? "border-slate-200 bg-white/95 text-slate-900 ring-slate-200/80 shadow-black/10"
    : "border-white/10 bg-slate-950/95 text-white ring-white/10 shadow-black/40";
  const headerClass = isLight ? "border-slate-200/80 bg-white/80" : "border-white/5 bg-white/5";
  const pillClass = isLight ? "bg-slate-100 text-slate-700" : "bg-white/10 text-slate-100";
  const accentText = isLight ? "text-emerald-600" : "text-emerald-300";
  const planSectionClass = isLight
    ? "bg-gradient-to-br from-white via-slate-50 to-white"
    : "bg-gradient-to-br from-slate-950/60 via-slate-900/50 to-slate-950/60";
  const currentPlan = tierMeta[currentTier] || "Free";
  const currentPlanLabel = planLabelKo[currentPlan] || currentPlan;
  const currentTierExpiryLabel = formatTierExpiryLabel(currentTierExpiresAt);
  const serverRemainingDays =
    Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
      ? Number(currentTierRemainingDays)
      : null;
  const isPaidTier = currentTier === "pro" || currentTier === "premium";
  const tierTimeRemaining = useMemo(
    () => getTierTimeRemaining(currentTierExpiresAt, countdownNowMs),
    [currentTierExpiresAt, countdownNowMs]
  );
  const currentTierRemainingDaysSafe =
    Number.isFinite(Number(tierTimeRemaining?.totalDaysCeil)) && Number(tierTimeRemaining?.totalDaysCeil) > 0
      ? Number(tierTimeRemaining.totalDaysCeil)
      : serverRemainingDays;
  const tierTimeRemainingLabel = formatTierTimeRemainingLabel(tierTimeRemaining);
  const selectedKakaoPlan = kakaoPayPlans[selectedPlan];
  const selectedPlanLabel = planLabelKo[selectedPlan] || selectedPlan;
  const normalizedBillingMonths =
    Number.isFinite(Number(billingMonths)) && Number(billingMonths) > 0
      ? Math.floor(Number(billingMonths))
      : 1;
  const isRecurringSelection = normalizedBillingMonths >= 2;
  const selectedChargeMonths = isRecurringSelection ? 1 : normalizedBillingMonths;
  const selectedKakaoAmount = selectedKakaoPlan ? selectedKakaoPlan.baseAmount * selectedChargeMonths : 0;
  const selectedKakaoItemName = selectedKakaoPlan ? selectedKakaoPlan.itemName : "";
  const paymentDisclosureSections = selectedPlan === "Free"
    ? []
    : [
        {
          title: "서비스 제공 및 결제 시기",
          items: [
            isRecurringSelection
              ? "첫 결제 승인 후 즉시 이용이 시작되며, 이후 이용기간은 정기결제 상태에 따라 갱신됩니다."
              : `결제 승인 후 즉시 이용이 시작되며, 결제 완료 시점부터 ${selectedChargeMonths}개월 동안 이용할 수 있습니다.`,
            isRecurringSelection
              ? `첫 결제금액은 ${selectedKakaoAmount.toLocaleString()}KRW이며, 이후 이용요금은 회사가 정한 결제주기에 따라 자동 청구됩니다.`
              : `결제 승인 즉시 ${selectedKakaoAmount.toLocaleString()}KRW가 1회 청구됩니다.`,
            "결제 완료 후 현재 페이지에서 요금제 상태와 만료일이 자동으로 갱신됩니다.",
          ],
        },
        {
          title: "정기결제 안내",
          items: isRecurringSelection
            ? [
                "정기결제는 해지하지 않으면 다음 결제일부터 자동으로 갱신됩니다.",
                "다음 결제일 이전까지 해지하면 다음 회차부터 자동 청구가 중단되며, 이미 결제된 이용기간은 만료일까지 이용할 수 있습니다.",
                "결제수단 오류, 한도 초과, 잔액 부족 등으로 결제가 실패하면 재시도되거나 유료서비스 이용이 제한될 수 있습니다.",
                "이용요금, 결제주기 또는 제공내용이 변경되는 경우 사전에 고지됩니다.",
              ]
            : [
                "정기결제는 결제 개월에서 '정기결제'를 선택한 경우에만 적용됩니다.",
                "1개월 선택은 자동갱신 없는 일반 결제입니다.",
              ],
        },
        {
          title: "취소 및 환불",
          items: [
            "정기결제 해지는 결제 이후에도 현재 이용 중인 기간 만료일까지는 서비스가 유지되고, 다음 회차부터 자동 청구가 중단됩니다.",
            "서비스 이용내역이 없고 제공이 개시되지 않은 경우, 회사 귀책사유로 이용하지 못한 경우, 표시·광고와 현저히 다른 경우 등에는 약관 및 관계 법령에 따라 환불이 가능합니다.",
            ...PAYMENT_REFUND_ITEMS,
          ],
        },
      ];
  const activeKakaoSubscription = subscriptionState?.status === "active" ? subscriptionState : null;
  const isSameActiveKakaoSubscription =
    Boolean(activeKakaoSubscription) &&
    activeKakaoSubscription?.tier === selectedKakaoPlan?.tier &&
    Number(activeKakaoSubscription?.billingMonths) === selectedChargeMonths &&
    Number(activeKakaoSubscription?.amount) === selectedKakaoAmount;
  const canPayWithKakao =
    Boolean(selectedKakaoPlan) && !paying && !isLoadingSubscription && !isSameActiveKakaoSubscription;
  const canStartSubscriptionWithKakao = canPayWithKakao && normalizedBillingMonths >= 2;
  const canStartOneTimeKakao = Boolean(selectedKakaoPlan) && !paying && !isLoadingSubscription;
  const subscriptionStatusLabel = formatSubscriptionStatusLabel(subscriptionState?.status);
  const subscriptionTierLabel = planLabelKo[tierMeta[subscriptionState?.tier] || ""] || subscriptionState?.tier || "-";
  const subscriptionApprovedLabel = formatTierExpiryLabel(subscriptionState?.approvedAt);
  const subscriptionLastChargeLabel = formatTierExpiryLabel(subscriptionState?.lastChargeAt);
  const subscriptionNextChargeLabel = formatTierExpiryLabel(subscriptionState?.nextChargeAt);
  const subscriptionCancelledLabel = formatTierExpiryLabel(subscriptionState?.cancelledAt);
  const {
    selectedCardPlan,
    selectedCardAmount,
    canPayWithCard,
    cardPaying,
    showCardWidget,
    setShowCardWidget,
    cardWidgetReady,
    openCardWidget,
    requestCardPayment,
  } = useCardPayment({
    user,
    selectedPlan,
    billingMonths: normalizedBillingMonths,
    paymentReturnSignal,
    onTierUpdated,
    setPaymentError,
    setPaymentNotice,
  });
  const {
    subscriptionState: niceSubscriptionData,
    activeSubscription: activeNiceSubscription,
    isSameActiveSubscription: isSameActiveNiceSubscription,
    canStartSubscription: canStartNiceSubscription,
    isLoadingSubscription: isLoadingNiceSubscription,
    isStartingSubscription: isStartingNiceSubscription,
    isChargingSubscription: isChargingNiceSubscription,
    isCancellingSubscription: isCancellingNiceSubscription,
    loadSubscriptionStatus: loadNiceSubscriptionStatus,
    startSubscription: startNiceSubscription,
    chargeSubscription: chargeNiceSubscription,
    inactiveSubscription: inactiveNiceSubscription,
  } = useNiceSubscription({
    user,
    selectedPlan,
    billingMonths: normalizedBillingMonths,
    paymentReturnSignal,
    enabled:
      isRecurringSelection ||
      isPaidTier ||
      (currentTier === "free" && selectedPlan === "Pro" && proTrialStatus?.eligible === true),
    proTrialEligible: currentTier === "free" && selectedPlan === "Pro" && proTrialStatus?.eligible === true,
    onTierUpdated,
    setPaymentError,
    setPaymentNotice,
  });
  const niceSubscriptionStatusLabel = formatSubscriptionStatusLabel(niceSubscriptionData?.status);
  const niceSubscriptionTierLabel =
    planLabelKo[tierMeta[niceSubscriptionData?.tier] || ""] || niceSubscriptionData?.tier || "-";
  const niceSubscriptionApprovedLabel = formatTierExpiryLabel(niceSubscriptionData?.approvedAt);
  const niceSubscriptionLastChargeLabel = formatTierExpiryLabel(niceSubscriptionData?.lastChargeAt);
  const niceSubscriptionNextChargeLabel = formatTierExpiryLabel(niceSubscriptionData?.nextChargeAt);
  const niceSubscriptionCancelledLabel = formatTierExpiryLabel(niceSubscriptionData?.cancelledAt);
  const canProceedWithKakao = isRecurringSelection ? canStartSubscriptionWithKakao : canStartOneTimeKakao;
  const canProceedWithCard = isRecurringSelection ? canStartNiceSubscription : canPayWithCard;
  const shouldShowSubscriptionSettings =
    Boolean(subscriptionState) ||
    Boolean(niceSubscriptionData) ||
    isLoadingSubscription ||
    isLoadingNiceSubscription;
  const canShowProTrial = currentTier === "free" && selectedPlan === "Pro";
  const isProTrialEligible = canShowProTrial && Boolean(proTrialStatus?.eligible);
  const canStartKakaoProTrial =
    isProTrialEligible &&
    Boolean(selectedKakaoPlan) &&
    !paying &&
    !isLoadingSubscription &&
    !isSameActiveKakaoSubscription;
  const isUsingProTrialFlow = isProTrialEligible;

  const loadKakaoSubscriptionStatus = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!user?.id) {
        setSubscriptionState(null);
        return null;
      }

      if (showLoading) setIsLoadingSubscription(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setSubscriptionState(null);
          return null;
        }

        const result = await fetchKakaoPaySubscriptionStatus({ accessToken });
        const subscription = result?.subscription || null;
        setSubscriptionState(subscription);
        return subscription;
      } catch (error) {
        console.warn("Failed to load KakaoPay subscription status:", error);
        return null;
      } finally {
        if (showLoading) setIsLoadingSubscription(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (!isPaidTier || !currentTierExpiresAt) return;
    const tick = () => setCountdownNowMs(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isPaidTier, currentTierExpiresAt]);

  useEffect(() => {
    if (!showCardWidget) return;

    window.requestAnimationFrame(() => {
      cardWidgetSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [showCardWidget]);

  useEffect(() => {
    loadKakaoSubscriptionStatus({ showLoading: true });
  }, [loadKakaoSubscriptionStatus]);

  useEffect(() => {
    let active = true;

    if (!user?.id) {
      setProTrialStatus({
        eligible: false,
        claimedAt: null,
        currentTier: "free",
      });
      setIsLoadingProTrial(false);
      return undefined;
    }

    setIsLoadingProTrial(true);
    getAccessToken()
      .then((accessToken) => {
        if (!accessToken) {
          throw new Error("무료 체험 확인에는 로그인 세션이 필요합니다.");
        }
        return fetchProTrialStatus({ accessToken });
      })
      .then((result) => {
        if (!active) return;
        setProTrialStatus({
          eligible: result?.eligible === true,
          claimedAt: result?.claimedAt || null,
          currentTier: String(result?.currentTier || currentTier || "free").trim().toLowerCase() || "free",
        });
      })
      .catch((error) => {
        if (!active) return;
        console.warn("Failed to load Pro trial status:", error);
        setProTrialStatus({
          eligible: false,
          claimedAt: null,
          currentTier: currentTier || "free",
        });
      })
      .finally(() => {
        if (active) setIsLoadingProTrial(false);
      });

    return () => {
      active = false;
    };
  }, [currentTier, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pgToken = params.get("pg_token");
    const kakaoState = params.get("kakaoPay");
    const handledKey = getKakaoReturnKey(params);

    if (!pgToken && !kakaoState) return;
    if (handledKey && handledKakaoReturnRef.current === handledKey) return;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    if (kakaoState === "cancel") {
      handledKakaoReturnRef.current = handledKey;
      setPaymentNotice("");
      setPaymentError("카카오페이 결제가 취소되었습니다.");
      localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (kakaoState === "fail") {
      handledKakaoReturnRef.current = handledKey;
      setPaymentNotice("");
      setPaymentError("카카오페이 결제 확인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (!pgToken) return;

    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(KAKAOPAY_STORAGE_KEY) || "{}");
    } catch {
      stored = {};
    }
    const storedTier = String(stored.tier || stored.planTier || "").trim().toLowerCase();
    const storedMonths = Number(stored.billingMonths ?? stored.months ?? 1);
    const storedHasAmount = Object.prototype.hasOwnProperty.call(stored, "amount");
    const storedProTrial = stored?.proTrial === true;

    if (!stored?.tid || !stored?.orderId) {
      handledKakaoReturnRef.current = handledKey;
      setPaymentError("결제 세션 정보를 찾을 수 없습니다. 다시 결제를 진행해주세요.");
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (!user?.id) {
      setPaymentError("결제 확인에는 로그인이 필요합니다.");
      return;
    }

    handledKakaoReturnRef.current = handledKey;
    setPaying(true);
    setPaymentError("");
    setPaymentNotice("");

    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("결제 확인에는 로그인 세션이 필요합니다.");
        }

        const approvalResult = await approveKakaoPay(
          {
            tid: stored.tid,
            orderId: stored.orderId,
            pgToken,
            tier: storedTier || selectedKakaoPlan?.tier || "",
            billingMonths:
              Number.isFinite(storedMonths) && storedMonths > 0
                ? Math.floor(storedMonths)
                : selectedChargeMonths,
            amount: storedHasAmount ? Number(stored.amount) : selectedKakaoAmount,
            itemName: String(stored.itemName || selectedKakaoItemName || "").trim(),
            registerSubscription:
              stored?.registerSubscription === true ||
              String(stored?.paymentMode || "").trim().toLowerCase() === "subscription",
            proTrial: storedProTrial,
            paymentMode:
              String(stored?.paymentMode || "").trim().toLowerCase() === "subscription"
                ? "subscription"
                : "one-time",
          },
          { accessToken }
        );

        if (!approvalResult?.tierUpdated) {
          throw new Error(approvalResult?.message || "결제는 완료되었지만 요금제 반영에 실패했습니다.");
        }

        if (approvalResult?.subscription) {
          setSubscriptionState(approvalResult.subscription);
        }
        const refreshedSubscription = await loadKakaoSubscriptionStatus();
        onTierUpdated?.();
        setPaymentNotice("결제가 완료되었습니다. 요금제가 갱신되었습니다.");
        const isSubscriptionApproval = approvalResult?.paymentMode === "subscription";
        const noticeParts = [
          storedProTrial || approvalResult?.proTrial
            ? "카카오페이 결제수단 등록과 Pro 1개월 무료체험이 시작되었습니다. 다음 달부터 자동결제됩니다."
            : isSubscriptionApproval
            ? refreshedSubscription?.status === "active"
              ? "카카오페이 정기결제 등록과 첫 결제가 완료되었습니다."
              : "결제는 완료됐지만 정기결제 상태 확인이 필요합니다."
            : "결제가 완료되었습니다. 요금제가 갱신되었습니다.",
        ];
        if (approvalResult?.subscriptionSaved) {
          noticeParts.push("정기결제 SID가 저장되었습니다.");
        }
        if (approvalResult?.subscriptionWarning) {
          noticeParts.push(`주의: ${approvalResult.subscriptionWarning}`);
        }
        setPaymentNotice(noticeParts.join(" "));
      } catch (err) {
        setPaymentError(`카카오페이 결제 확인 실패: ${err.message}`);
      } finally {
        localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
        clearPaymentReturnPending();
        setPaying(false);
        clearUrl();
      }
    })();
  }, [
    user?.id,
    onTierUpdated,
    loadKakaoSubscriptionStatus,
    selectedChargeMonths,
    selectedKakaoAmount,
    selectedKakaoItemName,
    selectedKakaoPlan?.tier,
    paymentReturnSignal,
  ]);

  const handleKakaoPay = async () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("카카오페이 결제에는 로그인이 필요합니다.");
      return;
    }

    if (!selectedKakaoPlan) {
      setPaymentNotice("");
      setPaymentError("카카오페이는 Pro/Premium 플랜에서만 지원합니다.");
      return;
    }

    if (normalizedBillingMonths < 2) {
      setPaymentError("");
      setPaymentNotice("정기결제는 2개월 이상부터 등록할 수 있습니다.");
      return;
    }

    if (isSameActiveKakaoSubscription) {
      setPaymentError("");
      setPaymentNotice("같은 조건의 카카오페이 정기결제가 이미 등록되어 있습니다.");
      /* eslint-disable no-unreachable */
      return;
      setPaymentNotice("이미 사용 중인 요금제입니다.");
      return;
      /* eslint-enable no-unreachable */
    }
    if (!Number.isFinite(selectedKakaoAmount) || selectedKakaoAmount <= 0) {
      setPaymentNotice("");
      setPaymentError("결제 금액이 올바르지 않습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setPaying(true);

    const orderId = `kpay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const approvalUrl = buildKakaoReturnUrl("approve");
    const cancelUrl = buildKakaoReturnUrl("cancel");
    const failUrl = buildKakaoReturnUrl("fail");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("결제 준비에는 로그인 세션이 필요합니다.");
      }

      const data = await requestKakaoPayReady(
        {
          orderId,
          userId: user.id,
          amount: selectedKakaoAmount,
          itemName: selectedKakaoItemName,
          plan: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: selectedChargeMonths,
          registerSubscription: true,
          paymentMode: "subscription",
          approvalUrl,
          cancelUrl,
          failUrl,
        },
        { accessToken }
      );

      const redirectUrl =
        data?.next_redirect_pc_url || data?.next_redirect_mobile_url || data?.next_redirect_app_url;

      if (!data?.tid || !(resolveKakaoRedirectUrl(data) || redirectUrl)) {
        throw new Error("카카오페이 결제 준비에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }

      localStorage.setItem(
        KAKAOPAY_STORAGE_KEY,
        JSON.stringify({
          tid: data.tid,
          orderId,
          planName: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: selectedChargeMonths,
          amount: selectedKakaoAmount,
          itemName: selectedKakaoItemName,
          registerSubscription: true,
          paymentMode: "subscription",
        })
      );
      markPaymentReturnPending({
        provider: "kakaopay",
        paymentMode: "subscription",
      });

      window.location.href = resolveKakaoRedirectUrl(data) || redirectUrl;
    } catch (err) {
      setPaymentError(err?.message || "카카오페이 결제 준비에 실패했습니다.");
      setPaying(false);
    }
  };

  const handleKakaoProTrial = async () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("카카오페이 무료체험 시작에는 로그인이 필요합니다.");
      return;
    }

    if (!isProTrialEligible) {
      setPaymentNotice("");
      setPaymentError("Pro 무료체험 가능 여부를 확인한 뒤 다시 시도해주세요.");
      return;
    }

    if (!selectedKakaoPlan) {
      setPaymentNotice("");
      setPaymentError("카카오페이는 Pro 플랜에서만 무료체험을 시작할 수 있습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setPaying(true);

    const orderId = `kpay_trial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const approvalUrl = buildKakaoReturnUrl("approve");
    const cancelUrl = buildKakaoReturnUrl("cancel");
    const failUrl = buildKakaoReturnUrl("fail");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("무료체험 준비에는 로그인 세션이 필요합니다.");
      }

      const data = await requestKakaoPayReady(
        {
          orderId,
          userId: user.id,
          amount: 0,
          itemName: "제우시안 프로 1개월 무료체험",
          plan: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: 1,
          registerSubscription: true,
          proTrial: true,
          paymentMode: "subscription",
          approvalUrl,
          cancelUrl,
          failUrl,
        },
        { accessToken }
      );

      const redirectUrl =
        data?.next_redirect_pc_url || data?.next_redirect_mobile_url || data?.next_redirect_app_url;

      if (!data?.tid || !(resolveKakaoRedirectUrl(data) || redirectUrl)) {
        throw new Error("카카오페이 무료체험 준비에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }

      localStorage.setItem(
        KAKAOPAY_STORAGE_KEY,
        JSON.stringify({
          tid: data.tid,
          orderId,
          planName: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: 1,
          amount: 0,
          itemName: "제우시안 프로 1개월 무료체험",
          registerSubscription: true,
          proTrial: true,
          paymentMode: "subscription",
        })
      );
      markPaymentReturnPending({
        provider: "kakaopay",
        paymentMode: "subscription-trial",
      });

      window.location.href = resolveKakaoRedirectUrl(data) || redirectUrl;
    } catch (error) {
      setPaymentError(error?.message || "카카오페이 무료체험 준비에 실패했습니다.");
      setPaying(false);
    }
  };

  const handleKakaoOneTimePay = async () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("카카오페이 결제에는 로그인 세션이 필요합니다.");
      return;
    }

    if (!selectedKakaoPlan) {
      setPaymentNotice("");
      setPaymentError("카카오페이는 Pro/Premium 플랜에서만 사용할 수 있습니다.");
      return;
    }

    if (!Number.isFinite(selectedKakaoAmount) || selectedKakaoAmount <= 0) {
      setPaymentNotice("");
      setPaymentError("결제 금액이 올바르지 않습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setPaying(true);

    const orderId = `kpay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const approvalUrl = buildKakaoReturnUrl("approve");
    const cancelUrl = buildKakaoReturnUrl("cancel");
    const failUrl = buildKakaoReturnUrl("fail");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("결제 준비에는 로그인 세션이 필요합니다.");
      }

      const data = await requestKakaoPayReady(
        {
          orderId,
          userId: user.id,
          amount: selectedKakaoAmount,
          itemName: selectedKakaoItemName,
          plan: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: normalizedBillingMonths,
          registerSubscription: false,
          paymentMode: "one-time",
          approvalUrl,
          cancelUrl,
          failUrl,
        },
        { accessToken }
      );

      const redirectUrl =
        data?.next_redirect_pc_url || data?.next_redirect_mobile_url || data?.next_redirect_app_url;

      if (!data?.tid || !(resolveKakaoRedirectUrl(data) || redirectUrl)) {
        throw new Error("카카오페이 결제 준비에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }

      localStorage.setItem(
        KAKAOPAY_STORAGE_KEY,
        JSON.stringify({
          tid: data.tid,
          orderId,
          planName: selectedPlan,
          tier: selectedKakaoPlan.tier,
          billingMonths: normalizedBillingMonths,
          amount: selectedKakaoAmount,
          itemName: selectedKakaoItemName,
          registerSubscription: false,
          paymentMode: "one-time",
        })
      );
      markPaymentReturnPending({
        provider: "kakaopay",
        paymentMode: "one-time",
      });

      window.location.href = resolveKakaoRedirectUrl(data) || redirectUrl;
    } catch (err) {
      setPaymentError(err?.message || "카카오페이 결제 준비에 실패했습니다.");
      setPaying(false);
    }
  };

  const handleInactiveKakaoSubscription = async () => {
    if (!user?.id || !activeKakaoSubscription || isCancellingSubscription) return;

    setPaymentError("");
    setPaymentNotice("");
    setIsCancellingSubscription(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("정기결제 해지에는 로그인 세션이 필요합니다.");
      }

      const result = await inactiveKakaoPaySubscription({}, { accessToken });
      if (result?.subscription) {
        setSubscriptionState(result.subscription);
      }
      await loadKakaoSubscriptionStatus();
      setPaymentNotice("카카오페이 정기결제를 해지했습니다. 현재 이용 중인 기간은 만료일까지 유지됩니다.");
    } catch (error) {
      setPaymentError(error?.message || "카카오페이 정기결제 해지에 실패했습니다.");
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  const handleChargeKakaoSubscription = async () => {
    if (!user?.id || !activeKakaoSubscription || isChargingSubscription) return;

    setPaymentError("");
    setPaymentNotice("");
    setIsChargingSubscription(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("재청구에는 로그인 세션이 필요합니다.");
      }

      const result = await chargeKakaoPaySubscription({}, { accessToken });
      if (!result?.charged) {
        throw new Error(result?.message || "카카오페이 재청구에 실패했습니다.");
      }

      if (result?.subscription) {
        setSubscriptionState(result.subscription);
      }
      await loadKakaoSubscriptionStatus();
      if (result?.tierUpdated) {
        onTierUpdated?.();
      }

      const noticeParts = ["카카오페이 테스트 재청구가 완료되었습니다."];
      if (result?.message) {
        noticeParts.push(`주의: ${result.message}`);
      }
      setPaymentNotice(noticeParts.join(" "));
    } catch (error) {
      setPaymentError(error?.message || "카카오페이 재청구에 실패했습니다.");
    } finally {
      setIsChargingSubscription(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
      <div
        className={`max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-3xl border shadow-2xl ring-1 ${surfaceClass}`}
      >
        <div className={`flex items-center justify-between border-b px-5 py-4 ${headerClass}`}>
          <div>
            <p className={`text-xs tracking-[0.2em] ${accentText}`}>요금제</p>
            <h2 className="text-xl font-bold">요금제 결제</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
            data-ghost-size="sm"
            style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
          >
            닫기
          </button>
        </div>

        <div className={`grid gap-4 px-6 py-5 md:grid-cols-2 xl:grid-cols-3 ${planSectionClass}`}>
          {PLAN_OPTIONS.map((plan) => (
            <div
              key={plan.name}
              onClick={() => setSelectedPlan(plan.name)}
              className={`flex h-full cursor-pointer flex-col rounded-2xl border px-4 py-5 shadow-lg shadow-black/30 ring-1 ${
                selectedPlan === plan.name
                  ? isLight
                    ? "border-emerald-400/70 ring-emerald-300/50 bg-emerald-50"
                    : "border-emerald-400/60 ring-emerald-300/50 bg-emerald-500/5"
                  : isLight
                    ? "border-slate-200 ring-slate-200/60 bg-white"
                    : "border-white/10 ring-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{plan.label}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
                  {plan.desc}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold">{plan.price}</p>
              <ul className={`mt-3 flex-1 space-y-2 text-sm ${isLight ? "text-slate-700" : "text-slate-200"}`}>
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: "rgba(52,211,153,0.9)" }}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="ghost-button mt-4 text-sm text-emerald-100"
                style={{ "--ghost-color": plan.accent }}
                disabled={currentPlan === plan.name}
              >
                {currentPlan === plan.name ? "현재 요금제" : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div
          className={`flex flex-col gap-2 border-t px-6 py-4 text-sm md:flex-row md:items-center md:justify-between ${
            isLight ? "border-slate-200/80 bg-slate-50 text-slate-700" : "border-white/5 bg-white/5 text-slate-200"
          }`}
        >
          <div>
            <p className="font-semibold">결제 안내</p>
            <p className={isLight ? "text-slate-600" : "text-slate-300"}>
              결제 서버 검증 후 요금제가 자동 반영됩니다. 결제 완료 후 현재 페이지에서 바로 갱신됩니다.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs md:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className={isLight ? "text-slate-600" : "text-slate-300"}>결제 개월</span>
              <select
                value={isUsingProTrialFlow ? 1 : normalizedBillingMonths}
                onChange={(event) => setBillingMonths(Number(event.target.value))}
                disabled={selectedPlan === "Free" || isUsingProTrialFlow}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700"
                    : "border-white/20 bg-slate-900 text-slate-100"
                }`}
              >
                {BILLING_MONTH_OPTIONS.map((months) => (
                  <option key={months} value={months}>
                    {months === 1 ? "1개월" : "정기결제"}
                  </option>
                ))}
              </select>
            </div>
            {selectedPlan !== "Free" && (
              <>
                {isUsingProTrialFlow ? (
                  <>
                    <span className={isLight ? "text-slate-700" : "text-slate-100"}>
                      오늘 결제 0 KRW
                    </span>
                    <span className={isLight ? "text-slate-500" : "text-slate-300"}>
                      결제수단 등록 후 1개월 뒤부터 매월 4,900 KRW가 자동 결제됩니다.
                    </span>
                  </>
                ) : (
                  <>
                    <span className={isLight ? "text-slate-700" : "text-slate-100"}>
                      {isRecurringSelection ? "첫 결제금액" : "총 결제금액"} {selectedKakaoAmount.toLocaleString()} KRW
                    </span>
                    {isRecurringSelection && (
                      <span className={isLight ? "text-slate-500" : "text-slate-300"}>
                        이후 매월 {selectedKakaoAmount.toLocaleString()} KRW가 자동 결제됩니다.
                      </span>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {canShowProTrial && (
              <p className={`max-w-xs text-xs ${isLight ? "text-slate-500" : "text-slate-300"}`}>
                {isLoadingProTrial
                  ? "무료체험 가능 여부를 확인 중입니다."
                  : isProTrialEligible
                    ? "아래 결제수단을 등록하면 Pro 1개월 무료체험이 바로 시작되고, 다음 달부터 자동결제됩니다."
                    : proTrialStatus?.claimedAt
                      ? "이미 Pro 무료체험을 사용했습니다."
                      : "현재 조건에서는 Pro 무료체험을 시작할 수 없습니다."}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*:nth-child(2)]:hidden [&>*:nth-child(4)]:hidden [&>*:nth-child(5)]:hidden">
            <button
              type="button"
              onClick={isUsingProTrialFlow ? handleKakaoProTrial : isRecurringSelection ? handleKakaoPay : handleKakaoOneTimePay}
              disabled={isUsingProTrialFlow ? !canStartKakaoProTrial : !canProceedWithKakao}
              className={`ghost-button text-sm ${isLight ? "text-amber-700" : "text-amber-100"}`}
              style={{ "--ghost-color": "234, 179, 8" }}
            >
              {paying
                ? isUsingProTrialFlow
                  ? "무료체험 처리 중..."
                  : "카카오페이 처리 중..."
                : isUsingProTrialFlow
                  ? "카카오페이 무료체험"
                  : "카카오페이"}
            </button>
            <button hidden
              type="button"
              onClick={handleKakaoPay}
              disabled={!canStartSubscriptionWithKakao}
              className={`ghost-button text-sm ${isLight ? "text-sky-700" : "text-sky-100"}`}
              style={{ "--ghost-color": "56, 189, 248" }}
            >
              {paying ? "정기결제 처리 중.." : "정기결제"}
            </button>
            <button
              type="button"
              onClick={isUsingProTrialFlow ? () => startNiceSubscription({ proTrial: true }) : isRecurringSelection ? () => startNiceSubscription() : openCardWidget}
              disabled={isUsingProTrialFlow ? !canStartNiceSubscription : !canProceedWithCard}
              className={`ghost-button text-sm ${isLight ? "text-emerald-700" : "text-emerald-100"}`}
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              {isStartingNiceSubscription || cardPaying
                ? isUsingProTrialFlow
                  ? "무료체험 처리 중..."
                  : "신용카드 처리 중..."
                : isUsingProTrialFlow
                  ? "신용카드 무료체험"
                  : "신용카드"}
            </button>
            <button hidden
              type="button"
              onClick={() => startNiceSubscription()}
              disabled={!canStartNiceSubscription}
              className={`ghost-button text-sm ${isLight ? "text-cyan-700" : "text-cyan-100"}`}
              style={{ "--ghost-color": "6, 182, 212" }}
            >
              {isStartingNiceSubscription ? "카드 정기 처리 중.." : "카드 정기"}
            </button>
            <button hidden
              type="button"
              onClick={() => {}}
              className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              {showSubscriptionSettings ? "설정 닫기" : "정기결제 설정"}
            </button>
          </div>
        </div>

        {shouldShowSubscriptionSettings && (
        <section
          className={`mx-6 mt-4 rounded-2xl border px-4 py-4 text-sm ${
            isLight
              ? "border-slate-200 bg-white text-slate-700"
              : "border-white/10 bg-white/5 text-slate-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">카카오페이 정기결제 상태</p>
              <p className={isLight ? "text-slate-600" : "text-slate-300"}>
                등록된 SID 상태를 확인하고 테스트 재청구 또는 해지를 처리할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadKakaoSubscriptionStatus({ showLoading: true })}
              disabled={isLoadingSubscription}
              className={`ghost-button text-xs ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              {isLoadingSubscription ? "불러오는 중.." : "새로고침"}
            </button>
          </div>

          {isLoadingSubscription ? (
            <p className={isLight ? "mt-4 text-xs text-slate-500" : "mt-4 text-xs text-slate-300"}>
              정기결제 상태를 불러오는 중입니다.
            </p>
          ) : subscriptionState ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div
                  className={`rounded-2xl border p-4 ${
                    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-slate-950/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        subscriptionState?.status === "active"
                          ? isLight
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-emerald-500/15 text-emerald-200"
                          : isLight
                            ? "bg-slate-200 text-slate-700"
                            : "bg-white/10 text-slate-200"
                      }`}
                    >
                      {subscriptionStatusLabel}
                    </span>
                    {subscriptionState?.isTestCid && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isLight ? "bg-amber-100 text-amber-700" : "bg-amber-500/15 text-amber-200"
                        }`}
                      >
                        테스트 CID
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>요금제</dt>
                      <dd className="font-medium">{subscriptionTierLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>청구 개월</dt>
                      <dd className="font-medium">{subscriptionState?.billingMonths || 1}개월</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>등록 금액</dt>
                      <dd className="font-medium">
                        {Number(subscriptionState?.amount || 0).toLocaleString()} KRW
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>SID</dt>
                      <dd className="font-medium">{subscriptionState?.sidMasked || "-"}</dd>
                    </div>
                  </dl>
                </div>

                <div
                  className={`rounded-2xl border p-4 ${
                    isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-slate-950/40"
                  }`}
                >
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>등록 시각</dt>
                      <dd className="font-medium">{subscriptionApprovedLabel || "-"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>마지막 청구</dt>
                      <dd className="font-medium">{subscriptionLastChargeLabel || "-"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>다음 청구</dt>
                      <dd className="font-medium">{subscriptionNextChargeLabel || "-"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={isLight ? "text-slate-500" : "text-slate-400"}>해지 시각</dt>
                      <dd className="font-medium">{subscriptionCancelledLabel || "-"}</dd>
                    </div>
                  </dl>
                  {subscriptionState?.lastError && (
                    <p
                      className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                        isLight ? "bg-red-50 text-red-700" : "bg-red-900/20 text-red-200"
                      }`}
                    >
                      최근 오류: {subscriptionState.lastError}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {activeKakaoSubscription?.isTestCid && (
                  <button
                    type="button"
                    onClick={handleChargeKakaoSubscription}
                    disabled={isChargingSubscription || isCancellingSubscription}
                    className={`ghost-button text-sm ${isLight ? "text-amber-700" : "text-amber-100"}`}
                    style={{ "--ghost-color": "234, 179, 8" }}
                  >
                    {isChargingSubscription ? "테스트 재청구 중.." : "테스트 재청구"}
                  </button>
                )}
                {activeKakaoSubscription && (
                  <button
                    type="button"
                    onClick={handleInactiveKakaoSubscription}
                    disabled={isCancellingSubscription || isChargingSubscription}
                    className={`ghost-button text-sm ${isLight ? "text-rose-700" : "text-rose-100"}`}
                    style={{ "--ghost-color": "244, 63, 94" }}
                  >
                    {isCancellingSubscription ? "정기결제 해지 중.." : "정기결제 해지"}
                  </button>
                )}
              </div>

              {activeKakaoSubscription?.isTestCid ? (
                <p className={isLight ? "mt-3 text-xs text-slate-500" : "mt-3 text-xs text-slate-300"}>
                  테스트 CID에서만 즉시 재청구 버튼을 노출합니다. 운영 CID는 서버 스케줄러에서 자동 청구해야 합니다.
                </p>
              ) : activeKakaoSubscription ? (
                <p className={isLight ? "mt-3 text-xs text-slate-500" : "mt-3 text-xs text-slate-300"}>
                  운영용 SID는 서버 배치에서 자동 청구하세요. 이 화면에서는 상태 확인과 해지만 제공합니다.
                </p>
              ) : null}
            </>
          ) : (
            <p className={isLight ? "mt-4 text-xs text-slate-500" : "mt-4 text-xs text-slate-300"}>
              등록된 카카오페이 정기결제가 없습니다.
            </p>
          )}

          <div className={`mt-6 border-t pt-6 ${isLight ? "border-slate-200" : "border-white/10"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">나이스페이 신용카드 정기결제 상태</p>
                <p className={isLight ? "text-slate-600" : "text-slate-300"}>
                  등록된 BID 상태를 확인하고 테스트 재청구 또는 해지를 처리할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadNiceSubscriptionStatus({ showLoading: true })}
                disabled={isLoadingNiceSubscription}
                className={`ghost-button text-xs ${isLight ? "text-slate-600" : "text-slate-200"}`}
                style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
              >
                {isLoadingNiceSubscription ? "불러오는 중.." : "새로고침"}
              </button>
            </div>

            {isLoadingNiceSubscription ? (
              <p className={isLight ? "mt-4 text-xs text-slate-500" : "mt-4 text-xs text-slate-300"}>
                신용카드 정기결제 상태를 불러오는 중입니다.
              </p>
            ) : niceSubscriptionData ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div
                    className={`rounded-2xl border p-4 ${
                      isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-slate-950/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          niceSubscriptionData?.status === "active"
                            ? isLight
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-emerald-500/15 text-emerald-200"
                            : isLight
                              ? "bg-slate-200 text-slate-700"
                              : "bg-white/10 text-slate-200"
                        }`}
                      >
                        {niceSubscriptionStatusLabel}
                      </span>
                      {niceSubscriptionData?.isTestMid && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isLight ? "bg-amber-100 text-amber-700" : "bg-amber-500/15 text-amber-200"
                          }`}
                        >
                          테스트 MID
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>요금제</dt>
                        <dd className="font-medium">{niceSubscriptionTierLabel}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>청구 개월</dt>
                        <dd className="font-medium">{niceSubscriptionData?.billingMonths || 1}개월</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>등록 금액</dt>
                        <dd className="font-medium">
                          {Number(niceSubscriptionData?.amount || 0).toLocaleString()} KRW
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>BID</dt>
                        <dd className="font-medium">{niceSubscriptionData?.bidMasked || "-"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div
                    className={`rounded-2xl border p-4 ${
                      isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-slate-950/40"
                    }`}
                  >
                    <dl className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>등록 시각</dt>
                        <dd className="font-medium">{niceSubscriptionApprovedLabel || "-"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>마지막 청구</dt>
                        <dd className="font-medium">{niceSubscriptionLastChargeLabel || "-"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>다음 청구</dt>
                        <dd className="font-medium">{niceSubscriptionNextChargeLabel || "-"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className={isLight ? "text-slate-500" : "text-slate-400"}>해지 시각</dt>
                        <dd className="font-medium">{niceSubscriptionCancelledLabel || "-"}</dd>
                      </div>
                    </dl>
                    {niceSubscriptionData?.lastError && (
                      <p
                        className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                          isLight ? "bg-red-50 text-red-700" : "bg-red-900/20 text-red-200"
                        }`}
                      >
                        최근 오류: {niceSubscriptionData.lastError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {activeNiceSubscription?.isTestMid && (
                    <button
                      type="button"
                      onClick={chargeNiceSubscription}
                      disabled={isChargingNiceSubscription || isCancellingNiceSubscription}
                      className={`ghost-button text-sm ${isLight ? "text-cyan-700" : "text-cyan-100"}`}
                      style={{ "--ghost-color": "6, 182, 212" }}
                    >
                      {isChargingNiceSubscription ? "테스트 재청구 중.." : "테스트 재청구"}
                    </button>
                  )}
                  {activeNiceSubscription && (
                    <button
                      type="button"
                      onClick={inactiveNiceSubscription}
                      disabled={isCancellingNiceSubscription || isChargingNiceSubscription}
                      className={`ghost-button text-sm ${isLight ? "text-rose-700" : "text-rose-100"}`}
                      style={{ "--ghost-color": "244, 63, 94" }}
                    >
                      {isCancellingNiceSubscription ? "정기결제 해지 중.." : "정기결제 해지"}
                    </button>
                  )}
                </div>

                {activeNiceSubscription?.isTestMid ? (
                  <p className={isLight ? "mt-3 text-xs text-slate-500" : "mt-3 text-xs text-slate-300"}>
                    테스트 MID에서만 즉시 재청구 버튼을 노출합니다. 운영 MID는 서버 스케줄러에서 자동 청구해야 합니다.
                  </p>
                ) : activeNiceSubscription ? (
                  <p className={isLight ? "mt-3 text-xs text-slate-500" : "mt-3 text-xs text-slate-300"}>
                    운영용 BID는 서버 배치에서 자동 청구하세요. 이 화면에서는 상태 확인과 해지만 제공합니다.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={isLight ? "mt-4 text-xs text-slate-500" : "mt-4 text-xs text-slate-300"}>
                등록된 나이스페이 신용카드 정기결제가 없습니다.
              </p>
            )}
          </div>

          {isSameActiveKakaoSubscription && (
            <p className={isLight ? "mt-3 text-xs text-emerald-600" : "mt-3 text-xs text-emerald-300"}>
              선택한 조건과 동일한 카카오페이 정기결제가 이미 활성화되어 있습니다.
            </p>
          )}
          {isSameActiveNiceSubscription && (
            <p className={isLight ? "mt-3 text-xs text-cyan-600" : "mt-3 text-xs text-cyan-300"}>
              ?좏깮??議곌굔怨??숈씪???섏씠?ㅽ럹??移대뱶 ?뺢린寃곗젣媛 ?대? ?쒖꽦?붾릺???덉뒿?덈떎.
            </p>
          )}
        </section>
        )}

        <div
          ref={cardWidgetSectionRef}
          className={`${showCardWidget ? "block" : "hidden"} border-t px-6 py-4 text-sm ${
            isLight ? "border-slate-200/80 bg-slate-50 text-slate-700" : "border-white/5 bg-white/5 text-slate-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">신용카드 결제</p>
              <p className={isLight ? "text-slate-600" : "text-slate-300"}>
                선택 플랜: {selectedPlanLabel}
                {selectedCardPlan ? ` / ${selectedCardAmount.toLocaleString()} KRW` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCardWidget(false)}
              className={`ghost-button text-xs ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              닫기
            </button>
          </div>
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-sm font-semibold">신용카드 결제 진행</p>
            <p className={isLight ? "mt-2 text-xs text-slate-500" : "mt-2 text-xs text-slate-300"}>
              결제 창이 준비되면 아래 버튼으로 결제를 확정하세요.
            </p>
            {!cardWidgetReady && (
              <p className={isLight ? "mt-3 text-xs text-slate-400" : "mt-3 text-xs text-slate-400"}>
                결제 모듈을 로딩 중입니다.
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={requestCardPayment}
              disabled={!cardWidgetReady || cardPaying}
              className={`ghost-button text-sm ${isLight ? "text-emerald-700" : "text-emerald-100"}`}
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              {cardPaying ? "처리 중..." : "신용카드 결제 확정"}
            </button>
          </div>
        </div>

        {selectedPlan !== "Free" && (
          <section
            className={`mx-6 mb-4 rounded-2xl border px-4 py-4 text-xs leading-6 ${
              isLight
                ? "border-slate-200 bg-white text-slate-700"
                : "border-white/10 bg-white/5 text-slate-200"
            }`}
          >
            <p className={`font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{PAYMENT_DISCLOSURE_TITLE}</p>
            <p className={isLight ? "mt-2 text-slate-600" : "mt-2 text-slate-300"}>{PAYMENT_DISCLOSURE_NOTICE}</p>
            <div className={`mt-4 overflow-hidden rounded-xl border ${isLight ? "border-slate-200" : "border-white/10"}`}>
              {paymentDisclosureSections.map((section, index) => (
                <div
                  key={section.title}
                  className={`px-4 py-4 ${index > 0 ? (isLight ? "border-t border-slate-200" : "border-t border-white/10") : ""}`}
                >
                  <p className={`font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{section.title}</p>
                  <ul className="mt-2 space-y-1.5">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        <span className="flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className={`px-4 py-4 ${isLight ? "border-t border-slate-200 bg-slate-50/80" : "border-t border-white/10 bg-slate-950/30"}`}>
                <p className={`font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>문의 및 약관</p>
                <ul className="mt-2 space-y-1.5">
                  <li>문의 및 이의신청: {COMPANY_INFO.phone}</li>
                  <li>사업자등록번호: {COMPANY_INFO.businessRegistrationNumber}</li>
                  <li>사업장 주소: {COMPANY_INFO.address}</li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-3">
                  {LEGAL_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`underline underline-offset-2 ${isLight ? "text-slate-700" : "text-slate-100"}`}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {isPaidTier && (
          <p
            className={`mx-6 mb-4 rounded-lg px-3 py-2 text-sm ring-1 ${
              isLight
                ? "bg-sky-50 text-sky-700 ring-sky-200"
                : "bg-sky-950/30 text-sky-100 ring-sky-500/40"
            }`}
          >
            {currentTierExpiryLabel
              ? `현재 ${currentPlanLabel} 만료일 ${currentTierExpiryLabel}${
                  currentTierRemainingDaysSafe != null ? ` (D-${currentTierRemainingDaysSafe})` : ""
                }${tierTimeRemainingLabel ? ` | ${tierTimeRemainingLabel} 남음` : ""}`
              : `현재 ${currentPlanLabel} 만료일이 아직 설정되지 않았습니다. 결제 완료 후 자동 반영됩니다.`}
          </p>
        )}
        {paymentError && (
          <p className="mx-6 mb-4 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/40">
            {paymentError}
          </p>
        )}
        {paymentNotice && (
          <p className="mx-6 mb-4 rounded-lg bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 ring-1 ring-emerald-400/30">
            {paymentNotice}
          </p>
        )}
      </div>
    </div>
  );
}

export default PaymentPage;

