import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chargeNicePaymentsSubscription,
  fetchNicePaymentsSubscriptionStatus,
  inactiveNicePaymentsSubscription,
  prepareNicePaymentsSubscription,
} from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";
import { clearPaymentReturnPending, markPaymentReturnPending } from "../utils/paymentReturn";

const NICE_BILLING_SCRIPT_ID = "nicepayments-billing-sdk";
const DEFAULT_NICE_BILLING_SCRIPT = "https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js";
const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const NICE_BILLING_RETURN_QUERY_KEYS = ["niceBilling", "trial", "orderId", "amount", "message"];

const cardSubscriptionPlans = {
  Pro: {
    baseAmount: 6900,
    tier: "pro",
    itemName: "Zeusian Pro Card Subscription",
  },
  Premium: {
    baseAmount: 18900,
    tier: "premium",
    itemName: "Zeusian Premium Card Subscription",
  },
};

let billingScriptPromise = null;

function getNiceBillingReturnKey(params) {
  const parts = NICE_BILLING_RETURN_QUERY_KEYS.map((key) => `${key}:${String(params.get(key) || "").trim()}`);
  const hasValue = parts.some((entry) => !entry.endsWith(":"));
  return hasValue ? parts.join("|") : "";
}

function loadNiceBillingScript(src) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is undefined"));
  }

  if (typeof window.goPay === "function") {
    return Promise.resolve(window.goPay);
  }

  if (billingScriptPromise) return billingScriptPromise;

  billingScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(NICE_BILLING_SCRIPT_ID);
    const script = existing || document.createElement("script");

    if (!existing) {
      script.id = NICE_BILLING_SCRIPT_ID;
      script.src = src || DEFAULT_NICE_BILLING_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      if (typeof window.goPay === "function") {
        resolve(window.goPay);
      } else {
        billingScriptPromise = null;
        reject(new Error("goPay is not available"));
      }
    };

    const handleError = () => {
      billingScriptPromise = null;
      reject(new Error("Failed to load NICEPAYMENTS billing SDK"));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });

  return billingScriptPromise;
}

function appendHiddenInput(form, name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = String(value ?? "");
  form.appendChild(input);
}

function maskMessage(message) {
  return String(message || "").trim();
}

export function useNiceSubscription({
  user,
  selectedPlan,
  billingMonths = 1,
  paymentReturnSignal = 0,
  enabled = true,
  proTrialEligible = false,
  onTierUpdated,
  setPaymentError,
  setPaymentNotice,
}) {
  const [subscriptionState, setSubscriptionState] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isStartingSubscription, setIsStartingSubscription] = useState(false);
  const [isChargingSubscription, setIsChargingSubscription] = useState(false);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);
  const handledReturnRef = useRef("");

  const selectedPlanConfig = cardSubscriptionPlans[selectedPlan];
  const normalizedBillingMonths =
    Number.isFinite(Number(billingMonths)) && Number(billingMonths) > 0
      ? Math.floor(Number(billingMonths))
      : 1;
  const subscriptionBillingMonths = 1;
  const selectedAmount = selectedPlanConfig ? selectedPlanConfig.baseAmount * subscriptionBillingMonths : 0;
  const selectedItemName = selectedPlanConfig ? selectedPlanConfig.itemName : "";

  const activeSubscription = subscriptionState?.status === "active" ? subscriptionState : null;
  const canStartProTrial = proTrialEligible && selectedPlanConfig?.tier === "pro";
  const isSameActiveSubscription =
    Boolean(activeSubscription) &&
    activeSubscription?.tier === selectedPlanConfig?.tier &&
    Number(activeSubscription?.billingMonths) === subscriptionBillingMonths &&
    Number(activeSubscription?.amount) === selectedAmount;
  const canStartSubscription =
    Boolean(selectedPlanConfig) &&
    (canStartProTrial || normalizedBillingMonths >= 2) &&
    !isStartingSubscription &&
    !isLoadingSubscription;

  const loadSubscriptionStatus = useCallback(
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

        const result = await fetchNicePaymentsSubscriptionStatus({ accessToken });
        const subscription = result?.subscription || null;
        setSubscriptionState(subscription);
        return subscription;
      } catch (error) {
        console.warn("Failed to load NICEPAYMENTS subscription status:", error);
        return null;
      } finally {
        if (showLoading) setIsLoadingSubscription(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (!enabled) {
      setSubscriptionState(null);
      setIsLoadingSubscription(false);
      return;
    }
    loadSubscriptionStatus({ showLoading: true });
  }, [enabled, loadSubscriptionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const billingState = params.get("niceBilling");
    const message = params.get("message");
    const trialMode = params.get("trial") === "1";
    const handledKey = getNiceBillingReturnKey(params);

    if (!billingState) return;
    if (handledKey && handledReturnRef.current === handledKey) return;
    if (billingState === "success" && !user?.id) return;
    handledReturnRef.current = handledKey;

    const clearUrl = () => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    (async () => {
      try {
        if (billingState === "success") {
          await loadSubscriptionStatus();
          onTierUpdated?.();
          const noticeParts = [
            trialMode
              ? "나이스페이 결제수단 등록과 Pro 1개월 무료체험이 시작되었습니다. 다음 달부터 자동결제됩니다."
              : "나이스페이 카드 정기결제 등록과 첫 결제가 완료되었습니다.",
          ];
          if (maskMessage(message)) {
            noticeParts.push(`주의: ${maskMessage(message)}`);
          }
          setPaymentError("");
          setPaymentNotice(noticeParts.join(" "));
        } else {
          setPaymentNotice("");
          setPaymentError(
            maskMessage(message) || "나이스페이 카드 정기결제 등록에 실패했습니다."
          );
        }
      } finally {
        clearPaymentReturnPending();
        clearUrl();
      }
    })();
  }, [loadSubscriptionStatus, onTierUpdated, paymentReturnSignal, setPaymentError, setPaymentNotice, user?.id]);

  const startSubscription = async ({ proTrial = false } = {}) => {
    const useProTrial = proTrial === true && canStartProTrial;

    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("카드 정기결제에는 로그인 세션이 필요합니다.");
      return;
    }

    if (!selectedPlanConfig) {
      setPaymentNotice("");
      setPaymentError("카드 정기결제는 Pro/Premium 플랜에서만 사용할 수 있습니다.");
      return;
    }

    if (!useProTrial && normalizedBillingMonths < 2) {
      setPaymentError("");
      setPaymentNotice("카드 정기결제는 2개월 이상부터 등록할 수 있습니다.");
      return;
    }

    if (isSameActiveSubscription) {
      setPaymentError("");
      setPaymentNotice("같은 조건의 카드 정기결제가 이미 등록되어 있습니다.");
      return;
    }

    if (!Number.isFinite(selectedAmount) || selectedAmount <= 0) {
      setPaymentNotice("");
      setPaymentError("결제 금액이 올바르지 않습니다.");
      return;
    }

    setPaymentError("");
    setPaymentNotice("");
    setIsStartingSubscription(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("카드 정기결제 준비에는 로그인 세션이 필요합니다.");
      }

      const prepared = await prepareNicePaymentsSubscription(
        {
          amount: selectedAmount,
          tier: selectedPlanConfig.tier,
          billingMonths: subscriptionBillingMonths,
          itemName: selectedItemName,
          proTrial: useProTrial,
          nativeReturn: IS_NATIVE_PLATFORM,
          buyerName: user?.user_metadata?.name || user?.email?.split("@")[0] || "user",
          buyerEmail: user?.email || "",
        },
        { accessToken }
      );

      await loadNiceBillingScript(prepared?.scriptUrl || DEFAULT_NICE_BILLING_SCRIPT);

      if (typeof window === "undefined" || typeof window.goPay !== "function") {
        throw new Error("NICEPAYMENTS billing module is not available.");
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = String(prepared?.action || "").trim();
      form.acceptCharset = "utf-8";
      form.style.display = "none";

      Object.entries(prepared?.fields || {}).forEach(([key, value]) => {
        appendHiddenInput(form, key, value);
      });

      const previousSubmit = window.nicepaySubmit;
      window.nicepaySubmit = () => {
        form.submit();
      };

      document.body.appendChild(form);
      markPaymentReturnPending({
        provider: "nicepayments-billing",
        paymentMode: useProTrial ? "subscription-trial" : "subscription",
      });

      try {
        window.goPay(form);
      } finally {
        window.setTimeout(() => {
          if (form.parentNode) form.parentNode.removeChild(form);
          if (previousSubmit) {
            window.nicepaySubmit = previousSubmit;
          } else {
            delete window.nicepaySubmit;
          }
        }, 2000);
      }
    } catch (error) {
      clearPaymentReturnPending();
      setPaymentError(error?.message || (useProTrial ? "무료체험 준비에 실패했습니다." : "카드 정기결제 준비에 실패했습니다."));
    } finally {
      setIsStartingSubscription(false);
    }
  };

  const chargeSubscription = async () => {
    if (!user?.id || !activeSubscription || isChargingSubscription) return;

    setPaymentError("");
    setPaymentNotice("");
    setIsChargingSubscription(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("재청구에는 로그인 세션이 필요합니다.");
      }

      const result = await chargeNicePaymentsSubscription({}, { accessToken });
      if (!result?.charged) {
        throw new Error(result?.message || "카드 정기결제 재청구에 실패했습니다.");
      }

      if (result?.subscription) {
        setSubscriptionState(result.subscription);
      }
      await loadSubscriptionStatus();
      if (result?.tierUpdated) {
        onTierUpdated?.();
      }

      const noticeParts = ["나이스페이 카드 정기결제 재청구가 완료되었습니다."];
      if (maskMessage(result?.message)) {
        noticeParts.push(`주의: ${maskMessage(result.message)}`);
      }
      setPaymentNotice(noticeParts.join(" "));
    } catch (error) {
      setPaymentError(error?.message || "카드 정기결제 재청구에 실패했습니다.");
    } finally {
      setIsChargingSubscription(false);
    }
  };

  const inactiveSubscription = async () => {
    if (!user?.id || !activeSubscription || isCancellingSubscription) return;

    setPaymentError("");
    setPaymentNotice("");
    setIsCancellingSubscription(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("정기결제 해지에는 로그인 세션이 필요합니다.");
      }

      const result = await inactiveNicePaymentsSubscription({}, { accessToken });
      if (result?.subscription) {
        setSubscriptionState(result.subscription);
      }
      await loadSubscriptionStatus();
      setPaymentNotice("나이스페이 카드 정기결제를 해지했습니다. 현재 이용 중인 기간은 만료일까지 유지됩니다.");
    } catch (error) {
      setPaymentError(error?.message || "카드 정기결제 해지에 실패했습니다.");
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  return {
    subscriptionState,
    activeSubscription,
    isSameActiveSubscription,
    canStartSubscription,
    isLoadingSubscription,
    isStartingSubscription,
    isChargingSubscription,
    isCancellingSubscription,
    loadSubscriptionStatus,
    startSubscription,
    chargeSubscription,
    inactiveSubscription,
  };
}
