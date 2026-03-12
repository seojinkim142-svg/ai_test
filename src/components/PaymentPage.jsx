import { useEffect, useRef, useState } from "react";
import { approveKakaoPay, requestKakaoPayReady } from "../services/kakaopay";
import { getAccessToken } from "../services/supabase";
import { useCardPayment } from "../hooks/useCardPayment";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const tierMeta = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

const KAKAOPAY_STORAGE_KEY = "kakaopay_session";
const kakaoPayPlans = {
  Pro: {
    amount: 4900,
    tier: "pro",
    itemName: "Zeusian Pro (Monthly)",
  },
  Premium: {
    amount: 16000,
    tier: "premium",
    itemName: "Zeusian Premium (Monthly)",
  },
};

function formatTierExpiryLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const handledKakaoReturnRef = useRef(false);
  const isLight = theme === "light";
  const surfaceClass = isLight
    ? "border-slate-200 bg-white/95 text-slate-900 ring-slate-200/80 shadow-black/10"
    : "border-white/10 bg-slate-950/95 text-white ring-white/10 shadow-black/40";
  const headerClass = isLight ? "border-slate-200/80 bg-white/80" : "border-white/5 bg-white/5";
  const pillClass = isLight ? "bg-slate-100 text-slate-700" : "bg-white/10 text-slate-100";
  const accentText = isLight ? "text-emerald-600" : "text-emerald-300";
  const currentPlan = tierMeta[currentTier] || "Free";
  const currentTierExpiryLabel = formatTierExpiryLabel(currentTierExpiresAt);
  const currentTierRemainingDaysSafe =
    Number.isFinite(Number(currentTierRemainingDays)) && Number(currentTierRemainingDays) > 0
      ? Number(currentTierRemainingDays)
      : null;
  const isPaidTier = currentTier === "pro" || currentTier === "premium";
  const selectedKakaoPlan = kakaoPayPlans[selectedPlan];
  const canPayWithKakao = Boolean(selectedKakaoPlan) && currentPlan !== selectedPlan && !paying;
  const {
    selectedCardPlan,
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
    currentPlan,
    onTierUpdated,
    setPaymentError,
    setPaymentNotice,
  });

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
      setPaymentError("카카오페이 결제 승인에 실패했습니다. 잠시 후 다시 시도해주세요.");
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

    if (!stored?.tid || !stored?.orderId) {
      setPaymentError("결제 세션 정보를 찾을 수 없습니다. 다시 결제를 진행해주세요.");
      clearUrl();
      return;
    }

    if (!user?.id) {
      setPaymentError("결제 승인에는 로그인이 필요합니다.");
      return;
    }

    setPaying(true);
    setPaymentError("");
    setPaymentNotice("");

    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("결제 승인에는 로그인 세션이 필요합니다.");
        }

        const approvalResult = await approveKakaoPay(
          {
            tid: stored.tid,
            orderId: stored.orderId,
            pgToken,
          },
          { accessToken }
        );

        if (!approvalResult?.tierUpdated) {
          throw new Error(approvalResult?.message || "결제는 완료되었지만 요금제 반영에 실패했습니다.");
        }

        onTierUpdated?.();
        setPaymentNotice("결제가 완료되었습니다. 요금제를 갱신했습니다.");
      } catch (err) {
        setPaymentError(`카카오페이 결제 승인 실패: ${err.message}`);
      } finally {
        localStorage.removeItem(KAKAOPAY_STORAGE_KEY);
        setPaying(false);
        clearUrl();
      }
    })();
  }, [user?.id, onTierUpdated]);

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
          amount: selectedKakaoPlan.amount,
          itemName: selectedKakaoPlan.itemName,
          plan: selectedPlan,
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
        className={`w-full max-w-4xl overflow-hidden rounded-3xl border shadow-2xl ring-1 ${surfaceClass}`}
      >
        <div className={`flex items-center justify-between border-b px-5 py-4 ${headerClass}`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.2em] ${accentText}`}>billing</p>
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
          className={`grid gap-4 px-6 py-5 md:grid-cols-3 ${
            isLight
              ? "bg-gradient-to-br from-white via-slate-50 to-white"
              : "bg-gradient-to-br from-slate-950/60 via-slate-900/50 to-slate-950/60"
          }`}
        >
          {[
            {
              name: "Free",
              price: "무료",
              desc: "기본",
              features: ["PDF 최대 4개", "요약/퀴즈/OX 기본 기능", "기본 저장소"],
              cta: "현재 요금제",
              accent: "148, 163, 184",
            },
            {
              name: "Pro",
              price: "월 4,900원",
              desc: "개인 학습 강화",
              features: ["PDF 업로드 무제한", "요약/퀴즈/OX/플래시카드", "우선 처리"],
              cta: "Pro로 업그레이드",
              accent: "16, 185, 129",
            },
            {
              name: "Premium",
              price: "월 16,000원",
              desc: "최대 4명 공유",
              features: ["최대 4명 동시 공유", "공유 스페이스로 함께 학습", "협업으로 학습 효율 향상"],
              cta: "Premium으로 업그레이드",
              accent: "56, 189, 248",
            },
          ].map((plan) => (
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
                <h3 className="text-lg font-semibold">{plan.name}</h3>
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
              결제는 서버 검증 후 요금제가 자동 반영됩니다. 결제 완료 후 현재 페이지에서 바로 갱신됩니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleKakaoPay}
              disabled={!canPayWithKakao}
              className={`ghost-button text-sm ${isLight ? "text-amber-700" : "text-amber-100"}`}
              style={{ "--ghost-color": "234, 179, 8" }}
            >
              {paying ? "카카오페이 처리 중" : "카카오페이 결제"}
            </button>
            <button
              type="button"
              onClick={openCardWidget}
              disabled={!canPayWithCard}
              className={`ghost-button text-sm ${isLight ? "text-emerald-700" : "text-emerald-100"}`}
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              {cardPaying ? "카드 결제 준비 중" : "카드 결제"}
            </button>
            <button
              type="button"
              className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              안전 결제 연동
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
                선택 플랜: {selectedPlan}
                {selectedCardPlan ? ` / ${selectedCardPlan.amount.toLocaleString()}원` : ""}
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

        {isPaidTier && (
          <p
            className={`mx-6 mb-4 rounded-lg px-3 py-2 text-sm ring-1 ${
              isLight
                ? "bg-sky-50 text-sky-700 ring-sky-200"
                : "bg-sky-950/30 text-sky-100 ring-sky-500/40"
            }`}
          >
            {currentTierExpiryLabel
              ? `현재 ${currentPlan} 만료일: ${currentTierExpiryLabel}${
                  currentTierRemainingDaysSafe != null ? ` (D-${currentTierRemainingDaysSafe})` : ""
                }`
              : `현재 ${currentPlan} 만료일이 아직 설정되지 않았습니다. 결제 완료 후 자동 반영됩니다.`}
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
