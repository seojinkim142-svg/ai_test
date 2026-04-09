import chargeHandler from "../../../lib/payments/nicepayments/subscription/charge.js";
import inactiveHandler from "../../../lib/payments/nicepayments/subscription/inactive.js";
import prepareHandler from "../../../lib/payments/nicepayments/subscription/prepare.js";
import statusHandler from "../../../lib/payments/nicepayments/subscription/status.js";

const ROUTE_HANDLERS = {
  charge: chargeHandler,
  inactive: inactiveHandler,
  prepare: prepareHandler,
  status: statusHandler,
};

const text = (value) => String(value ?? "").trim().toLowerCase();

const resolveAction = (req) => {
  const queryAction = req?.query?.action;
  if (Array.isArray(queryAction) && queryAction.length) return text(queryAction[0]);
  if (queryAction != null) return text(queryAction);

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);
    return text(parts[parts.length - 1]);
  } catch {
    return "";
  }
};

const sendNotFound = (res) => {
  res.writeHead(404, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ message: "Not found." }));
};

export default async function handler(req, res) {
  const routeHandler = ROUTE_HANDLERS[resolveAction(req)];
  if (!routeHandler) {
    sendNotFound(res);
    return;
  }

  await routeHandler(req, res);
}
