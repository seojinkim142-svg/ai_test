import { useCallback, useEffect, useState } from "react";
import {
  chargeNicePaymentsSubscription,
  fetchNicePaymentsSubscriptionStatus,
  inactiveNicePaymentsSubscription,
  prepareNicePaymentsSubscription,
} from "../services/nicepayments";
import { getAccessToken } from "../services/supabase";

const EMPTY_CARD_FORM = {
  cardNumber: "",
  expiryMonth: "",
  expiryYear: "",
  birth: "",
  cardPassword: "",
};

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

const digitsOnly = (value) => String(value ?? "").replace(/\D+/g, "");
const maskMessage = (message) => String(message || "").trim();

const normalizeCardInput = (field, value) => {
  const digits = digitsOnly(value);
  if (field === "cardNumber") return digits.slice(0, 19);
  if (field === "expiryMonth") return digits.slice(0, 2);
  if (field === "expiryYear") return digits.slice(0, 2);
  if (field === "birth") return digits.slice(0, 10);
  if (field === "cardPassword") return digits.slice(0, 2);
  return value;
};

const validateCardForm = ({ cardNumber, expiryMonth, expiryYear, birth, cardPassword }) => {
  if (cardNumber.length < 14 || cardNumber.length > 19) {
    return "카드번호를 다시 확인해주세요.";
  }

  if (!/^\d{2}$/.test(expiryMonth)) {
    return "카드 유효기간 월을 두 자리로 입력해주세요.";
  }
  const month = Number(expiryMonth);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return "카드 유효기간 월이 올바르지 않습니다.";
  }

  if (!/^\d{2}$/.test(expiryYear)) {
    return "카드 유효기간 연도를 두 자리로 입력해주세요.";
  }

  if (!(birth.length === 6 || birth.length === 10)) {
    return "생년월일 6자리 또는 사업자번호 10자리를 입력해주세요.";
  }

  if (!/^\d{2}$/.test(cardPassword)) {
    return "카드 비밀번호 앞 두 자리를 입력해주세요.";
  }

  return "";
};

export function useNiceSubscription({
  user,
  selectedPlan,
  billingMonths = 1,
  paymentReturnSignal: _paymentReturnSignal = 0,
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
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [subscriptionFormMode, setSubscriptionFormMode] = useState("subscription");
  const [subscriptionCardForm, setSubscriptionCardForm] = useState(EMPTY_CARD_FORM);

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
  const isSubscriptionTrialForm = subscriptionFormMode === "trial";

  const resetSubscriptionCardForm = useCallback(() => {
    setSubscriptionCardForm(EMPTY_CARD_FORM);
  }, []);

  const closeSubscriptionForm = useCallback((options = {}) => {
    if (isStartingSubscription && options.force !== true) return;
    setShowSubscriptionForm(false);
    setSubscriptionFormMode("subscription");
    resetSubscriptionCardForm();
  }, [isStartingSubscription, resetSubscriptionCardForm]);

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
      closeSubscriptionForm({ force: true });
      return;
    }
    loadSubscriptionStatus({ showLoading: true });
  }, [closeSubscriptionForm, enabled, loadSubscriptionStatus]);

  useEffect(() => {
    if (!showSubscriptionForm) return;
    if (!selectedPlanConfig) {
      closeSubscriptionForm({ force: true });
    }
  }, [closeSubscriptionForm, selectedPlanConfig, showSubscriptionForm]);

  const updateSubscriptionCardField = (field, value) => {
    setSubscriptionCardForm((prev) => ({
      ...prev,
      [field]: normalizeCardInput(field, value),
    }));
  };

  const startSubscription = ({ proTrial = false } = {}) => {
    const useProTrial = proTrial === true && canStartProTrial;

    if (!user?.id) {
      setPaymentNotice("");
      setPaymentError("카드 정기결제는 로그인 후에 이용할 수 있습니다.");
      return;
    }

    if (!selectedPlanConfig) {
      setPaymentNotice("");
      setPaymentError("카드 정기결제는 Pro 또는 Premium에서만 사용할 수 있습니다.");
      return;
    }

    if (!useProTrial && normalizedBillingMonths < 2) {
      setPaymentError("");
      setPaymentNotice("카드 정기결제는 현재 결제 설정에서 바로 시작할 수 없습니다.");
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
    setSubscriptionFormMode(useProTrial ? "trial" : "subscription");
    setShowSubscriptionForm(true);
  };

  const submitSubscription = async () => {
    const formError = validateCardForm(subscriptionCardForm);
    if (formError) {
      setPaymentNotice("");
      setPaymentError(formError);
      return;
    }

    if (!user?.id || !selectedPlanConfig) {
      setPaymentNotice("");
      setPaymentError("구독 등록을 다시 시작해주세요.");
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

      const result = await prepareNicePaymentsSubscription(
        {
          amount: selectedAmount,
          tier: selectedPlanConfig.tier,
          billingMonths: subscriptionBillingMonths,
          itemName: selectedItemName,
          proTrial: isSubscriptionTrialForm,
          buyerName: user?.user_metadata?.name || user?.email?.split("@")[0] || "user",
          buyerEmail: user?.email || "",
          cardNumber: subscriptionCardForm.cardNumber,
          expiryMonth: subscriptionCardForm.expiryMonth,
          expiryYear: subscriptionCardForm.expiryYear,
          birth: subscriptionCardForm.birth,
          cardPassword: subscriptionCardForm.cardPassword,
        },
        { accessToken }
      );

      if (result?.subscription) {
        setSubscriptionState(result.subscription);
      } else {
        await loadSubscriptionStatus();
      }

      if (result?.tierUpdated) {
        onTierUpdated?.();
      }

      const noticeParts = [
        isSubscriptionTrialForm
          ? "카드가 등록되었고 Pro 1개월 무료 체험이 시작되었습니다."
          : "신용카드 정기결제가 등록되고 첫 결제가 완료되었습니다.",
      ];
      if (maskMessage(result?.message)) {
        noticeParts.push(`주의: ${maskMessage(result.message)}`);
      }
      setPaymentNotice(noticeParts.join(" "));
      closeSubscriptionForm();
    } catch (error) {
      setPaymentError(
        error?.message ||
          (isSubscriptionTrialForm
            ? "카드 무료 체험 등록에 실패했습니다."
            : "카드 정기결제 등록에 실패했습니다.")
      );
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

      const noticeParts = ["신용카드 정기결제 재청구가 완료되었습니다."];
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
      setPaymentNotice("신용카드 정기결제가 해지되었습니다. 현재 이용 중인 기간 만료 전까지는 계속 사용할 수 있습니다.");
      closeSubscriptionForm();
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
    showSubscriptionForm,
    isSubscriptionTrialForm,
    subscriptionCardForm,
    updateSubscriptionCardField,
    closeSubscriptionForm,
    submitSubscription,
    loadSubscriptionStatus,
    startSubscription,
    chargeSubscription,
    inactiveSubscription,
  };
}
