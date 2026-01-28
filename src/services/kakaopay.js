const KAKAOPAY_BASE_URL = (import.meta.env.VITE_KAKAOPAY_API_BASE || "/api/kakaopay").replace(/\/$/, "");

async function postJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

export function requestKakaoPayReady(payload) {
  return postJson(`${KAKAOPAY_BASE_URL}/ready`, payload);
}

export function approveKakaoPay(payload) {
  return postJson(`${KAKAOPAY_BASE_URL}/approve`, payload);
}
