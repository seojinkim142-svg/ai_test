const NICE_PAYMENTS_BASE_URL = (
  import.meta.env.VITE_NICEPAYMENTS_API_BASE || "/api/nicepayments"
).replace(/\/$/, "");

async function postJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Nice Payments request failed: ${err.message || err}`);
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

export function confirmNicePayment(payload) {
  return postJson(`${NICE_PAYMENTS_BASE_URL}/confirm`, payload);
}
