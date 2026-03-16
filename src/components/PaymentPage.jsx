import { useEffect, useMemo, useRef, useState } from "react";
import { approveKakaoPay, requestKakaoPayReady } from "../services/kakaopay";
import { getAccessToken } from "../services/supabase";
import { useCardPayment } from "../hooks/useCardPayment";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

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
const BILLING_MONTH_OPTIONS = [1, 3, 6, 12];

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

function PaymentPage({
  onClose,
  currentTier = "free",
  currentTierExpiresAt = null,
  currentTierRemainingDays = null,
  theme = "dark",
  user,
  onTierUpdated,
}) {
  const [selectedPlan, setSelectedPlan] = useState(tierMeta[currentTier] || "Free");
  const [billingMonths, setBillingMonths] = useState(1);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const handledKakaoReturnRef = useRef(false);
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
  const selectedKakaoAmount = selectedKakaoPlan ? selectedKakaoPlan.baseAmount * normalizedBillingMonths : 0;
  const selectedKakaoItemName = selectedKakaoPlan
    ? normalizedBillingMonths > 1
      ? `${selectedKakaoPlan.itemName} x ${normalizedBillingMonths}개월`
      : selectedKakaoPlan.itemName
    : "";
  const canPayWithKakao = Boolean(selectedKakaoPlan) && currentPlan !== selectedPlan && !paying;
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
    currentPlan,
    onTierUpdated,
    setPaymentError,
    setPaymentNotice,
  });

  useEffect(() => {
    if (!isPaidTier || !currentTierExpiresAt) return;
    const tick = () => setCountdownNowMs(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isPaidTier, currentTierExpiresAt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handledKakaoReturnRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const pgToken = params.get("pg_token");
    const kakaoState = params.get("kakaoPay");

    if (!pgToken && !kakaoState) return;
    handledKakaoReturnRef.current = true;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    if (kakaoState === "cancel") {
      setPaymentNotice("");
      setPaymentError("카카오페이 결제가 취소되었습니다.");
      localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
      clearUrl();
      return;
    }

    if (kakaoState === "fail") {
      setPaymentNotice("");
      setPaymentError("카카오페이 결제 확인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
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

    if (!stored?.tid || !stored?.orderId) {
      setPaymentError("결제 세션 정보를 찾을 수 없습니다. 다시 결제를 진행해주세요.");
      clearUrl();
      return;
    }

    if (!user?.id) {
      setPaymentError("결제 확인에는 로그인이 필요합니다.");
      return;
    }

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
                : normalizedBillingMonths,
            amount: Number(stored.amount) > 0 ? Number(stored.amount) : selectedKakaoAmount,
          },
          { accessToken }
        );

        if (!approvalResult?.tierUpdated) {
          throw new Error(approvalResult?.message || "결제는 완료되었지만 요금제 반영에 실패했습니다.");
        }

        onTierUpdated?.();
        setPaymentNotice("결제가 완료되었습니다. 요금제가 갱신되었습니다.");
      } catch (err) {
        setPaymentError(`카카오페이 결제 확인 실패: ${err.message}`);
      } finally {
        localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
        setPaying(false);
        clearUrl();
      }
    })();
  }, [user?.id, onTierUpdated, normalizedBillingMonths, selectedKakaoAmount, selectedKakaoPlan?.tier]);

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

    if (currentPlan === selectedPlan) {
      setPaymentError("");
      setPaymentNotice("이미 사용 중인 요금제입니다.");
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
    const appOrigin = resolvePublicAppOrigin() || window.location.origin;
    const approvalUrl = `${appOrigin}/?kakaoPay=approve`;
    const cancelUrl = `${appOrigin}/?kakaoPay=cancel`;
    const failUrl = `${appOrigin}/?kakaoPay=fail`;

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
          approvalUrl,
          cancelUrl,
          failUrl,
        },
        { accessToken }
      );

      const redirectUrl =
        data?.next_redirect_pc_url || data?.next_redirect_mobile_url || data?.next_redirect_app_url;

      if (!data?.tid || !redirectUrl) {
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
        })
      );

      window.location.href = redirectUrl;
    } catch (err) {
      setPaymentError(err?.message || "카카오페이 결제 준비에 실패했습니다.");
      setPaying(false);
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

        <div
          className={`grid gap-4 px-6 py-5 md:grid-cols-3 ${planSectionClass}`}
        >
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
                value={normalizedBillingMonths}
                onChange={(event) => setBillingMonths(Number(event.target.value))}
                disabled={selectedPlan === "Free"}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700"
                    : "border-white/20 bg-slate-900 text-slate-100"
                }`}
              >
                {BILLING_MONTH_OPTIONS.map((months) => (
                  <option key={months} value={months}>
                    {months}개월
                  </option>
                ))}
              </select>
            </div>
            {selectedPlan !== "Free" && (
              <span className={isLight ? "text-slate-700" : "text-slate-100"}>
                총 결제금액 {selectedKakaoAmount.toLocaleString()} KRW
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleKakaoPay}
              disabled={!canPayWithKakao}
              className={`ghost-button text-sm ${isLight ? "text-amber-700" : "text-amber-100"}`}
              style={{ "--ghost-color": "234, 179, 8" }}
            >
              {paying ? "카카오페이 처리 중..." : "카카오페이"}
            </button>
            <button
              type="button"
              onClick={openCardWidget}
              disabled={!canPayWithCard}
              className={`ghost-button text-sm ${isLight ? "text-emerald-700" : "text-emerald-100"}`}
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              {cardPaying ? "카드 처리 중..." : "카드 결제"}
            </button>
            <button
              type="button"
              className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              이전 결제 내역
            </button>
          </div>
        </div>

        <div
          className={`${showCardWidget ? "block" : "hidden"} border-t px-6 py-4 text-sm ${
            isLight ? "border-slate-200/80 bg-slate-50 text-slate-700" : "border-white/5 bg-white/5 text-slate-200"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">카드 결제</p>
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
            <p className="text-sm font-semibold">카드 결제 진행</p>
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
              {cardPaying ? "처리 중..." : "카드 결제 확정"}
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
            <p className={`font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{REFUND_POLICY_TITLE}</p>
            <ul className="mt-2 space-y-1.5">
              {REFUND_POLICY_PRIMARY_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
            <p className={isLight ? "mt-3 text-slate-600" : "mt-3 text-slate-300"}>{REFUND_POLICY_NOTICE}</p>
            <ul className="mt-2 space-y-1.5">
              {REFUND_POLICY_SECONDARY_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  <span className="flex-1">{item}</span>
                </li>
              ))}
            </ul>
            <p className={isLight ? "mt-3 text-slate-600" : "mt-3 text-slate-300"}>{REFUND_POLICY_FOOTNOTE}</p>
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

