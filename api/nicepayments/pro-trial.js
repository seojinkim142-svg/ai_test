import {
  buildCorsHeaders,
  getRuntimeConfig,
  parseRequestBody,
  sendJson,
} from "../../lib/payments/nicepayments.js";
import { authenticateSupabaseUserFromRequest } from "../../lib/billing/tier-sync.js";
import { getProTrialStatus } from "../../lib/billing/pro-trial.js";

const text = (value) => String(value ?? "").trim();
const buildPublicTrialMessage = (statusCode) => {
  const status = Number(statusCode);
  if (status === 401) return "로그인이 필요합니다.";
  if (status === 403) return "요청을 처리할 수 없습니다.";
  return "무료체험 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
};

export default async function handler(req, res) {
  const { allowOrigin } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid." }, allowOrigin);
    return;
  }

  const action = text(body?.action || "status").toLowerCase();
  if (action !== "status" && action !== "claim") {
    sendJson(res, 400, { message: "Unsupported action." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult.ok) {
    sendJson(res, authResult.status, { message: buildPublicTrialMessage(authResult.status) }, allowOrigin);
    return;
  }

  try {
    const trialStatus = await getProTrialStatus({ authResult });
    const claimedAt = text(trialStatus.claimedAt);
    const effectiveTier = text(trialStatus.effectiveTier || "free").toLowerCase() || "free";
    const eligible = trialStatus.eligible === true;

    if (action === "status") {
      sendJson(
        res,
        200,
        {
          ok: true,
          eligible,
          claimedAt: claimedAt || null,
          currentTier: effectiveTier,
          tierExpiresAt: trialStatus?.tierStatus?.tierExpiresAt || null,
        },
        allowOrigin
      );
      return;
    }

    sendJson(
      res,
      410,
      {
        ok: false,
        eligible,
        claimedAt: claimedAt || null,
        currentTier: effectiveTier,
        message: "Direct pro trial claim is disabled. Register a billing method to start the free trial.",
      },
      allowOrigin
    );
  } catch (error) {
    console.error("NicePayments pro trial request failed", error);
    sendJson(res, 500, { message: buildPublicTrialMessage(500) }, allowOrigin);
  }
}
