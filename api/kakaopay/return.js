import { getRuntimeConfig } from "../../lib/payments/kakaopay.js";
import { redirectToPaymentClient } from "../../lib/payments/client-redirect.js";

const text = (value) => String(value ?? "").trim();

const getRequestUrl = (req) => {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
  } catch {
    return new URL("http://localhost/");
  }
};

const redirectWithState = (req, res, clientOrigin, params = {}) => {
  redirectToPaymentClient({
    req,
    res,
    clientOrigin,
    params,
  });
};

export default async function handler(req, res) {
  const { clientOrigin, allowOrigin } = getRuntimeConfig(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": allowOrigin || "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ message: "Method not allowed." }));
    return;
  }

  const requestUrl = getRequestUrl(req);
  const state = text(requestUrl.searchParams.get("state")).toLowerCase();
  const pgToken = text(requestUrl.searchParams.get("pg_token"));

  if (state === "approve") {
    redirectWithState(req, res, clientOrigin, {
      kakaoPay: "approve",
      pg_token: pgToken,
    });
    return;
  }

  if (state === "cancel") {
    redirectWithState(req, res, clientOrigin, {
      kakaoPay: "cancel",
    });
    return;
  }

  redirectWithState(req, res, clientOrigin, {
    kakaoPay: "fail",
  });
}
