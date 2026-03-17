const KAKAOPAY_BASE_URL = (import.meta.env.VITE_KAKAOPAY_API_BASE || "/api/kakaopay").replace(/\/$/, "");

async function requestJson(url, payload, options = {}) {
  const accessToken = String(options?.accessToken || "").trim();
  const method = String(options?.method || "POST").trim().toUpperCase() || "POST";
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    });
  } catch (err) {
    throw new Error(`KakaoPay request failed: ${err.message || err}`);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.msg || text || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export function requestKakaoPayReady(payload, options = {}) {
  return requestJson(`${KAKAOPAY_BASE_URL}/ready`, payload, options);
}

export function approveKakaoPay(payload, options = {}) {
  return requestJson(`${KAKAOPAY_BASE_URL}/approve`, payload, options);
}

export function fetchKakaoPaySubscriptionStatus(options = {}) {
  return requestJson(`${KAKAOPAY_BASE_URL}/subscription/status`, {}, options);
}

export function chargeKakaoPaySubscription(payload = {}, options = {}) {
  return requestJson(`${KAKAOPAY_BASE_URL}/subscription/charge`, payload, options);
}

export function inactiveKakaoPaySubscription(payload = {}, options = {}) {
  return requestJson(`${KAKAOPAY_BASE_URL}/subscription/inactive`, payload, options);
}
