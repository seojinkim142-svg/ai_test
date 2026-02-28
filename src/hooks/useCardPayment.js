import { useEffect, useRef, useState } from "react";
import { confirmNicePayment } from "../services/nicepayments";
import { setUserTier } from "../services/supabase";

const CARD_PAYMENT_STORAGE_KEY = "nicepayments_session";
const cardPayPlans = {
  Pro: {
    amount: 4900,
    tier: "pro",
    orderName: "Zeusian Pro (Monthly)",
  },
  Premium: {
    amount: 16000,
    tier: "premium",
    orderName: "Zeusian Premium (Monthly)",
  },
};

const NICEPAYMENTS_SCRIPT_ID = "nicepayments-js-sdk";
const DEFAULT_NICEPAYMENTS_SCRIPT = "https://pay.nicepay.co.kr/v1/js/";
let niceScriptPromise = null;

function loadNicePaymentsScript(src) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is undefined"));
  }

  if (window.AUTHNICE) {
    return Promise.resolve(window.AUTHNICE);
  }

  if (niceScriptPromise) return niceScriptPromise;

  niceScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(NICEPAYMENTS_SCRIPT_ID);
    const script = existing || document.createElement("script");

    if (!existing) {
      script.id = NICEPAYMENTS_SCRIPT_ID;
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      if (window.AUTHNICE) {
        resolve(window.AUTHNICE);
      } else {
        niceScriptPromise = null;
        reject(new Error("AUTHNICE is not available"));
      }
    };

    const handleError = () => {
      niceScriptPromise = null;
      reject(new Error("Failed to load Nice Payments SDK"));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });

  return niceScriptPromise;
}

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
  const cardClientId = import.meta.env.VITE_NICEPAYMENTS_CLIENT_ID;
  const scriptUrl = import.meta.env.VITE_NICEPAYMENTS_JS_URL || DEFAULT_NICEPAYMENTS_SCRIPT;

  const selectedCardPlan = cardPayPlans[selectedPlan];
  const canPayWithCard = Boolean(selectedCardPlan) && currentPlan !== selectedPlan && !cardPaying;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (handledCardReturnRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const cardState = params.get("nicePay");
    const token = params.get("np_token");
    const orderId = params.get("orderId");
    const amountParam = params.get("amount");
    const failMessage = params.get("message");

    if (!cardState && !token) return;
    handledCardReturnRef.current = true;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    if (cardState === "fail") {
      setPaymentNotice("");
      setPaymentError(
        failMessage
          ? `나이스페이먼츠 결제 실패: ${failMessage}`
          : "나이스페이먼츠 결제가 실패했습니다."
      );
      localStorage.removeItem(CARD_PAYMENT_STORAGE_KEY);
      clearUrl();
      return;
    }

    if (cardState !== "success") {
      clearUrl();
      return;
    }

    if (!token || !orderId || !amountParam) {
      setPaymentError("결제 정보를 찾을 수 없습니다. 다시 시도해 주세요.");
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
      setPaymentError("결제 금액이 올바른 형태가 아닙니다. 다시 시도해 주세요.");
      clearUrl();
      return;
    }

    if (storedAmount && storedAmount !== amount) {
      setPaymentError("결제 금액이 일치하지 않습니다. 다시 시도해 주세요.");
      clearUrl();
      return;
    }

    if (!user?.id) {
      setPaymentError("결제 확인에는 로그인 정보가 필요합니다.");
      return;
    }

    setCardPaying(true);
    setPaymentError("");
    setPaymentNotice("");

    (async () => {
      try {
        const confirmation = await confirmNicePayment({ token });
        const confirmedOrderId = confirmation?.orderId || orderId;
        const confirmedAmount = Number(confirmation?.amount ?? amount);

        if (stored?.orderId && confirmedOrderId && stored.orderId !== confirmedOrderId) {
          throw new Error("결제 주문 번호가 일치하지 않습니다.");
        }

        if (storedAmount && confirmedAmount && storedAmount !== confirmedAmount) {
          throw new Error("결제 금액이 일치하지 않습니다.");
        }

        let tierError = null;
        if (stored.tier) {
          try {
            await setUserTier({ userId: user.id, tier: stored.tier });
          } catch (err) {
            tierError = err;
          }
        }

        if (tierError) {
          setPaymentError(
            `결제 확인 완료, 권한 반영 실패: ${tierError?.message || "권한 반영 실패"}`
          );
        } else {
          onTierUpdated?.(stored.tier);
          setPaymentNotice("결제가 완료되었습니다.");
        }
      } catch (err) {
        setPaymentError(`결제 확인 실패: ${err.message}`);
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
    if (!cardClientId) {
      setPaymentError("NICEPAYMENTS Client ID가 설정되어 있지 않습니다.");
      return;
    }

    let active = true;
    setCardWidgetReady(false);

    loadNicePaymentsScript(scriptUrl)
      .then(() => {
        if (active) setCardWidgetReady(true);
      })
      .catch((err) => {
        if (active) {
          setPaymentError(`나이스페이먼츠 결제 모듈 로드 실패: ${err.message}`);
        }
      });

    return () => {
      active = false;
    };
  }, [cardClientId, scriptUrl, selectedCardPlan, setPaymentError, showCardWidget]);

  const openCardWidget = () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("결제는 로그인 후 진행할 수 있습니다.");
      return;
    }

    if (!selectedCardPlan) {
      setPaymentNotice("");
      setPaymentError("카드 결제는 Pro/Premium 플랜에서만 지원됩니다.");
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

  const requestCardPayment = () => {
    if (!selectedCardPlan) {
      setPaymentError("결제 플랜을 선택해 주세요.");
      return;
    }

    if (!cardClientId) {
      setPaymentError("NICEPAYMENTS Client ID가 설정되어 있지 않습니다.");
      return;
    }

    if (!cardWidgetReady || typeof window === "undefined" || !window.AUTHNICE) {
      setPaymentError("나이스페이먼츠 결제 준비 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (!user?.id) {
      setPaymentError("결제는 로그인 후 진행할 수 있습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setCardPaying(true);

    const orderId = `nice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amount = selectedCardPlan.amount;
    const fallbackReturnUrl = `${window.location.origin}/api/nicepayments/return`;
    const configuredReturnUrl = import.meta.env.VITE_NICEPAYMENTS_RETURN_URL;
    let returnUrl = fallbackReturnUrl;

    if (configuredReturnUrl) {
      try {
        const parsedReturnUrl = new URL(configuredReturnUrl, window.location.origin);
        const isLocalhostReturn = ["localhost", "127.0.0.1"].includes(parsedReturnUrl.hostname);
        if (!import.meta.env.PROD || !isLocalhostReturn) {
          returnUrl = parsedReturnUrl.toString();
        }
      } catch {
        returnUrl = fallbackReturnUrl;
      }
    }

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
      window.AUTHNICE.requestPay({
        clientId: cardClientId,
        method: "card",
        orderId,
        amount,
        goodsName: selectedCardPlan.orderName,
        returnUrl,
        buyerName: user?.user_metadata?.name || user?.email?.split("@")[0] || "user",
        buyerEmail: user?.email || "",
        fnError: (err) => {
          const message = err?.errorMsg || err?.message || "결제 요청이 취소되었습니다.";
          setPaymentError(`나이스페이먼츠 결제 요청 실패: ${message}`);
          setCardPaying(false);
        },
      });
    } catch (err) {
      setPaymentError(err?.message || "나이스페이먼츠 결제 요청을 진행할 수 없습니다.");
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

