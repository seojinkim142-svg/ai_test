import { useEffect, useRef, useState } from "react";
import { loadPaymentWidget } from "@tosspayments/payment-widget-sdk";
import { confirmTossPayment } from "../services/tosspayments";
import { setUserTier } from "../services/supabase";

const CARD_PAYMENT_STORAGE_KEY = "tosspayments_session";
const cardPayPlans = {
  Pro: {
    amount: 19900,
    tier: "pro",
    orderName: "Zeusian Pro (Monthly)",
  },
};

export function useCardPayment({
  user,
  selectedPlan,
  currentPlan,
  onTierUpdated,
  setPaymentError,
  setPaymentNotice,
}) {
  const [cardPaying, setCardPaying] = useState(false);
  const [showCardWidget, setShowCardWidget] = useState(false);
  const [cardWidgetReady, setCardWidgetReady] = useState(false);
  const handledCardReturnRef = useRef(false);
  const widgetRef = useRef(null);
  const paymentMethodsRef = useRef(null);
  const agreementRef = useRef(null);
  const cardClientKey = import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY;

  const selectedCardPlan = cardPayPlans[selectedPlan];
  const canPayWithCard = Boolean(selectedCardPlan) && currentPlan !== selectedPlan && !cardPaying;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handledCardReturnRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const cardState = params.get("tossPay");
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amountParam = params.get("amount");
    const failMessage = params.get("message");

    if (!cardState && !paymentKey) return;
    handledCardReturnRef.current = true;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    if (cardState === "fail") {
      setPaymentNotice("");
      setPaymentError(
        failMessage ? `토스페이먼츠 결제 실패: ${failMessage}` : "토스페이먼츠 결제에 실패했습니다."
      );
      localStorage.removeItem(CARD_PAYMENT_STORAGE_KEY);
      clearUrl();
      return;
    }

    if (!paymentKey || !orderId || !amountParam) {
      setPaymentError("결제 정보를 찾을 수 없습니다. 다시 시도해주세요.");
      clearUrl();
      return;
    }

    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(CARD_PAYMENT_STORAGE_KEY) || "{}");
    } catch {
      stored = {};
    }

    const amount = Number(amountParam);
    const storedAmount = Number(stored.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("결제 금액이 올바르지 않습니다. 다시 시도해주세요.");
      clearUrl();
      return;
    }

    if (storedAmount && storedAmount !== amount) {
      setPaymentError("결제 금액이 일치하지 않습니다. 다시 시도해주세요.");
      clearUrl();
      return;
    }

    if (!user?.id) {
      setPaymentError("결제 승인에 로그인 정보가 필요합니다.");
      return;
    }

    setCardPaying(true);
    setPaymentError("");
    setPaymentNotice("");

    (async () => {
      try {
        await confirmTossPayment({ paymentKey, orderId, amount });

        let tierError = null;
        if (stored.tier) {
          try {
            await setUserTier({ userId: user.id, tier: stored.tier });
          } catch (err) {
            tierError = err;
          }
        }

        if (tierError) {
          setPaymentError(`결제 승인 완료, 권한 반영 실패: ${tierError?.message || "권한 반영 실패"}`);
        } else {
          onTierUpdated?.(stored.tier);
          setPaymentNotice("결제가 완료되었습니다.");
        }
      } catch (err) {
        setPaymentError(`결제 승인 실패: ${err.message}`);
      } finally {
        localStorage.removeItem(CARD_PAYMENT_STORAGE_KEY);
        setCardPaying(false);
        clearUrl();
      }
    })();
  }, [onTierUpdated, setPaymentError, setPaymentNotice, user?.id]);

  useEffect(() => {
    if (!showCardWidget) return;
    if (!selectedCardPlan) return;
    if (!cardClientKey) {
      setPaymentError("토스페이먼츠 Client Key가 설정되지 않았습니다.");
      return;
    }

    let active = true;
    setCardWidgetReady(false);

    (async () => {
      try {
        const customerKey = user?.id || "ANONYMOUS";
        const widget = widgetRef.current || (await loadPaymentWidget(cardClientKey, customerKey));

        widgetRef.current = widget;

        if (!paymentMethodsRef.current) {
          paymentMethodsRef.current = widget.renderPaymentMethods(
            "#toss-payment-method",
            selectedCardPlan.amount,
            { variantKey: "DEFAULT" }
          );
          agreementRef.current = widget.renderAgreement("#toss-agreement", { variantKey: "AGREEMENT" });
        } else {
          paymentMethodsRef.current.updateAmount(selectedCardPlan.amount);
        }

        if (active) {
          setCardWidgetReady(true);
        }
      } catch (err) {
        if (active) {
          setPaymentError(`토스페이먼츠 위젯 로드 실패: ${err.message}`);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [cardClientKey, selectedCardPlan, setPaymentError, showCardWidget, user?.id]);

  const openCardWidget = () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("결제는 로그인 후 진행할 수 있습니다.");
      return;
    }

    if (!selectedCardPlan) {
      setPaymentNotice("");
      setPaymentError("토스페이먼츠는 Pro 플랜에서만 지원합니다.");
      return;
    }

    if (currentPlan === selectedPlan) {
      setPaymentError("");
      setPaymentNotice("이미 사용 중인 플랜입니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setShowCardWidget(true);
  };

  const requestCardPayment = async () => {
    if (!widgetRef.current || !selectedCardPlan) {
      setPaymentError("토스페이먼츠 위젯이 준비되지 않았습니다.");
      return;
    }

    if (!user?.id) {
      setPaymentError("결제는 로그인 후 진행할 수 있습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setCardPaying(true);

    const orderId = `toss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const successUrl = `${window.location.origin}/?tossPay=success`;
    const failUrl = `${window.location.origin}/?tossPay=fail`;
    const amount = selectedCardPlan.amount;

    localStorage.setItem(
      CARD_PAYMENT_STORAGE_KEY,
      JSON.stringify({
        orderId,
        amount,
        tier: selectedCardPlan.tier,
        planName: selectedPlan,
      })
    );

    try {
      await widgetRef.current.requestPayment({
        orderId,
        orderName: selectedCardPlan.orderName,
        successUrl,
        failUrl,
        customerEmail: user?.email,
        customerName: user?.user_metadata?.name || user?.email?.split("@")[0] || "사용자",
      });
    } catch (err) {
      setPaymentError(err?.message || "토스페이먼츠 결제 요청에 실패했습니다.");
      setCardPaying(false);
    }
  };

  return {
    selectedCardPlan,
    canPayWithCard,
    cardPaying,
    showCardWidget,
    setShowCardWidget,
    cardWidgetReady,
    openCardWidget,
    requestCardPayment,
  };
}
