import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { confirmNicePayment, fetchNicePaymentsConfig } from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { resolvePublicAppOrigin } from "../utils/appOrigin";
import { clearPaymentReturnPending, markPaymentReturnPending } from "../utils/paymentReturn";

const CARD_PAYMENT_STORAGE_KEY = "nicepayments_session";
const cardPayPlans = {
  Pro: {
    baseAmount: 6900,
    tier: "pro",
    orderName: "Zeusian Pro (Monthly)",
  },
  Family: {
    baseAmount: 18900,
    tier: "premium",
    orderName: "Zeusian Family (Monthly)",
  },
};

const NICEPAYMENTS_SCRIPT_ID = "nicepayments-js-sdk";
const DEFAULT_NICEPAYMENTS_SCRIPT = "https://pay.nicepay.co.kr/v1/js/";
const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const CARD_RETURN_QUERY_KEYS = ["nicePay", "np_token", "orderId", "amount", "message"];
const trimSchemeSeparators = (value) => String(value || "").trim().replace(/:\/*$/, "");
const NATIVE_PAYMENT_SCHEME = trimSchemeSeparators(
  import.meta.env.VITE_NATIVE_APP_SCHEME || "com.tjwls.examstudyai"
);
const NATIVE_PAYMENT_CALLBACK_URL = NATIVE_PAYMENT_SCHEME ? `${NATIVE_PAYMENT_SCHEME}://auth/callback` : "";
let niceScriptPromise = null;

function normalizeNiceFailureMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return "";

  if (normalized.includes("계좌잔액 부족")) {
    return "체크카드 계좌 잔액이 부족합니다. 잔액을 확인하거나 다른 카드로 다시 시도해주세요.";
  }

  if (normalized.includes("한도 초과")) {
    return "카드 한도를 초과했습니다. 결제 가능 금액을 확인한 뒤 다시 시도해주세요.";
  }

  return normalized;
}

function appendNativeReturnMode(rawUrl, appOrigin) {
  try {
    const target = new URL(String(rawUrl || "").trim(), appOrigin);
    if (IS_NATIVE_PLATFORM) {
      target.searchParams.set("mode", "native");
    }
    return target.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

function getCardReturnKey(params) {
  const parts = CARD_RETURN_QUERY_KEYS.map((key) => `${key}:${String(params.get(key) || "").trim()}`);
  const hasValue = parts.some((entry) => !entry.endsWith(":"));
  return hasValue ? parts.join("|") : "";
}

function buildNativeCardAbortUrl(message = "cancelled") {
  if (!NATIVE_PAYMENT_CALLBACK_URL) return "";

  try {
    const target = new URL(NATIVE_PAYMENT_CALLBACK_URL);
    target.searchParams.set("nicePay", "cancel");
    target.searchParams.set("message", String(message || "").trim() || "cancelled");
    return target.toString();
  } catch {
    return NATIVE_PAYMENT_CALLBACK_URL;
  }
}

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
  billingMonths = 1,
  paymentReturnSignal = 0,
  onTierUpdated,
  onPaymentAborted,
  setPaymentError,
  setPaymentNotice,
}) {
  const [cardPaying, setCardPaying] = useState(false);
  const [showCardWidget, setShowCardWidget] = useState(false);
  const [cardWidgetReady, setCardWidgetReady] = useState(false);
  const [runtimeCardConfig, setRuntimeCardConfig] = useState({
    clientId: "",
    returnUrl: "",
    scriptUrl: "",
  });
  const handledCardReturnRef = useRef("");
  const runtimeConfigRequestedRef = useRef(false);
  const envCardClientId = String(import.meta.env.VITE_NICEPAYMENTS_CLIENT_ID || "").trim();
  const envScriptUrl = String(import.meta.env.VITE_NICEPAYMENTS_JS_URL || "").trim() || DEFAULT_NICEPAYMENTS_SCRIPT;
  const envReturnUrl = String(import.meta.env.VITE_NICEPAYMENTS_RETURN_URL || "").trim();
  const cardClientId = runtimeCardConfig.clientId || envCardClientId;
  const scriptUrl = runtimeCardConfig.scriptUrl || envScriptUrl;

  const selectedCardPlan = cardPayPlans[selectedPlan];
  const normalizedBillingMonths =
    Number.isFinite(Number(billingMonths)) && Number(billingMonths) > 0
      ? Math.floor(Number(billingMonths))
      : 1;
  const selectedCardAmount = selectedCardPlan ? selectedCardPlan.baseAmount * normalizedBillingMonths : 0;
  const canPayWithCard = Boolean(selectedCardPlan) && !cardPaying;

  useEffect(() => {
    if (normalizedBillingMonths >= 2 || !selectedCardPlan) {
      setShowCardWidget(false);
    }
  }, [normalizedBillingMonths, selectedCardPlan]);

  useEffect(() => {
    const hasDirectRuntimeConfig = Boolean(envCardClientId && envReturnUrl);
    if (hasDirectRuntimeConfig) return;
    if (runtimeConfigRequestedRef.current) return;

    runtimeConfigRequestedRef.current = true;

    fetchNicePaymentsConfig()
      .then((config) => {
        setRuntimeCardConfig({
          clientId: String(config?.clientId || "").trim(),
          returnUrl: String(config?.returnUrl || "").trim(),
          scriptUrl: String(config?.jsUrl || "").trim(),
        });
      })
      .catch((error) => {
        runtimeConfigRequestedRef.current = false;
        console.warn("Failed to load NICEPAYMENTS runtime config:", error);
      });
  }, [envCardClientId, envReturnUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const cardState = params.get("nicePay");
    const token = params.get("np_token");
    const orderId = params.get("orderId");
    const amountParam = params.get("amount");
    const failMessage = params.get("message");
    const handledKey = getCardReturnKey(params);

    if (!cardState && !token) return;
    if (handledKey && handledCardReturnRef.current === handledKey) return;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    if (cardState === "fail" || cardState === "cancel") {
      handledCardReturnRef.current = handledKey;
      setPaymentNotice("");
      setShowCardWidget(false);
      setCardPaying(false);
      const normalizedFailMessage = normalizeNiceFailureMessage(failMessage);
      setPaymentError(
        normalizedFailMessage
          ? `나이스페이 결제 ${cardState === "cancel" ? "취소" : "실패"}: ${normalizedFailMessage}`
          : cardState === "cancel"
            ? "나이스페이 결제가 취소되었습니다."
            : "나이스페이 결제가 실패했습니다."
      );
      localStorage.removeItem(CARD_PAYMENT_STORAGE_KEY);
      clearPaymentReturnPending();
      clearUrl();
      if (IS_NATIVE_PLATFORM && cardState === "cancel") {
        onPaymentAborted?.();
      }
      return;
    }

    if (cardState !== "success") {
      handledCardReturnRef.current = handledKey;
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (!token || !orderId || !amountParam) {
      handledCardReturnRef.current = handledKey;
      setPaymentError("결제 정보를 찾을 수 없습니다. 다시 시도해주세요.");
      clearPaymentReturnPending();
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
    const storedTier = String(stored.tier || stored.planTier || "").trim().toLowerCase();
    const storedMonths = Number(stored.billingMonths ?? stored.months ?? 1);

    if (!Number.isFinite(amount) || amount <= 0) {
      handledCardReturnRef.current = handledKey;
      setPaymentError("결제 금액 정보가 올바르지 않습니다. 다시 시도해주세요.");
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (storedAmount && storedAmount !== amount) {
      handledCardReturnRef.current = handledKey;
      setPaymentError("결제 금액이 일치하지 않습니다. 다시 시도해주세요.");
      clearPaymentReturnPending();
      clearUrl();
      return;
    }

    if (!user?.id) {
      return;
    }

    handledCardReturnRef.current = handledKey;

    if (!user?.id) {
      setPaymentError("결제 확인에는 로그인이 필요합니다.");
      return;
    }

    setCardPaying(true);
    setPaymentError("");
    setPaymentNotice("");

    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("결제 확인에는 로그인 세션이 필요합니다.");
        }

        const confirmation = await confirmNicePayment(
          {
            token,
            tier: storedTier || selectedCardPlan?.tier || "",
            billingMonths:
              Number.isFinite(storedMonths) && storedMonths > 0
                ? Math.floor(storedMonths)
                : normalizedBillingMonths,
            amount: storedAmount || amount,
          },
          { accessToken }
        );
        const confirmedOrderId = confirmation?.orderId || orderId;
        const confirmedAmount = Number(confirmation?.amount ?? amount);

        if (stored?.orderId && confirmedOrderId && stored.orderId !== confirmedOrderId) {
          throw new Error("결제 주문 번호가 일치하지 않습니다.");
        }

        if (storedAmount && confirmedAmount && storedAmount !== confirmedAmount) {
          throw new Error("결제 금액이 일치하지 않습니다.");
        }

        if (!confirmation?.tierUpdated) {
          throw new Error(confirmation?.message || "결제는 완료되었지만 요금제 반영에 실패했습니다.");
        }

        onTierUpdated?.();
        setPaymentNotice("결제가 완료되었습니다.");
      } catch (err) {
        setPaymentError(`결제 확인 실패: ${normalizeNiceFailureMessage(err.message) || err.message}`);
      } finally {
        localStorage.removeItem(CARD_PAYMENT_STORAGE_KEY);
        clearPaymentReturnPending();
        setCardPaying(false);
        clearUrl();
      }
    })();
  }, [
    normalizedBillingMonths,
    onPaymentAborted,
    onTierUpdated,
    paymentReturnSignal,
    selectedCardPlan?.tier,
    setPaymentError,
    setPaymentNotice,
    user?.id,
  ]);

  useEffect(() => {
    if (!showCardWidget) return;
    if (!selectedCardPlan) return;
    if (!cardClientId) {
      setPaymentError("NICEPAYMENTS Client ID가 설정되지 않았습니다.");
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
          setPaymentError(`나이스페이 SDK 로드 실패: ${err.message}`);
        }
      });

    return () => {
      active = false;
    };
  }, [cardClientId, scriptUrl, selectedCardPlan, setPaymentError, showCardWidget]);

  const openCardWidget = () => {
    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("신용카드 결제에는 로그인이 필요합니다.");
      return;
    }

    if (!selectedCardPlan) {
      setPaymentNotice("");
      setPaymentError("신용카드 결제는 Pro/패밀리 플랜에서만 지원합니다.");
      return;
    }

    if (selectedPlan === "Free" && normalizedBillingMonths < 1) {
      setPaymentError("");
      setPaymentNotice("이미 사용 중인 요금제입니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setShowCardWidget(true);
  };

  const requestCardPayment = () => {
    if (!selectedCardPlan) {
      setPaymentError("결제할 플랜을 선택해주세요.");
      return;
    }

    if (!cardClientId) {
      setPaymentError("NICEPAYMENTS Client ID가 설정되지 않았습니다.");
      return;
    }

    if (!cardWidgetReady || typeof window === "undefined" || !window.AUTHNICE) {
      setPaymentError("나이스페이 결제 모듈을 준비 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (!user?.id) {
      setPaymentError("신용카드 결제에는 로그인이 필요합니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setCardPaying(true);

    const orderId = `nice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const amount = selectedCardAmount;
    const goodsName =
      normalizedBillingMonths > 1
        ? `${selectedCardPlan.orderName} x ${normalizedBillingMonths} months`
        : selectedCardPlan.orderName;
    const appOrigin = resolvePublicAppOrigin() || window.location.origin;
    const fallbackReturnUrl = appendNativeReturnMode(`${appOrigin}/api/nicepayments/return`, appOrigin);
    const configuredReturnUrl = envReturnUrl || runtimeCardConfig.returnUrl;
    let returnUrl = fallbackReturnUrl;
    const nativeAbortUrl = IS_NATIVE_PLATFORM ? buildNativeCardAbortUrl() : "";

    if (configuredReturnUrl) {
      try {
        const parsedReturnUrl = new URL(configuredReturnUrl, appOrigin);
        const isLocalhostReturn = ["localhost", "127.0.0.1"].includes(parsedReturnUrl.hostname);
        if (!import.meta.env.PROD || !isLocalhostReturn) {
          returnUrl = appendNativeReturnMode(parsedReturnUrl.toString(), appOrigin);
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
        planName: selectedPlan,
        tier: selectedCardPlan.tier,
        billingMonths: normalizedBillingMonths,
      })
    );
    markPaymentReturnPending({
      provider: "nicepayments",
      paymentMode: "one-time",
    });

    try {
      window.AUTHNICE.requestPay({
        clientId: cardClientId,
        method: "card",
        orderId,
        amount,
        goodsName,
        returnUrl,
        ...(nativeAbortUrl
          ? {
              WapUrl: NATIVE_PAYMENT_CALLBACK_URL,
              IspCancelUrl: nativeAbortUrl,
            }
          : {}),
        buyerName: user?.user_metadata?.name || user?.email?.split("@")[0] || "user",
        buyerEmail: user?.email || "",
        fnError: (err) => {
          const message = normalizeNiceFailureMessage(err?.errorMsg || err?.message) || "결제 요청이 취소되었습니다.";
          setPaymentError(`나이스페이 결제 요청 실패: ${message}`);
          clearPaymentReturnPending();
          setShowCardWidget(false);
          setCardPaying(false);
        },
      });
    } catch (err) {
      setPaymentError(err?.message || "나이스페이 결제 요청을 진행할 수 없습니다.");
      clearPaymentReturnPending();
      setShowCardWidget(false);
      setCardPaying(false);
    }
  };

  return {
    selectedCardPlan,
    selectedCardAmount,
    canPayWithCard,
    cardPaying,
    showCardWidget,
    setShowCardWidget,
    cardWidgetReady,
    openCardWidget,
    requestCardPayment,
  };
}
