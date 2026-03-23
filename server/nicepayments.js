/* global process */
import http from "http";
import dotenv from "dotenv";
import configHandler from "../api/nicepayments/config.js";
import confirmHandler from "../api/nicepayments/confirm.js";
import proTrialHandler from "../api/nicepayments/pro-trial.js";
import returnHandler from "../api/nicepayments/return.js";
import subscriptionHandler from "../api/nicepayments/subscription/[action].js";

dotenv.config();

const PORT = Number(process.env.NICEPAYMENTS_PORT || 8791);

const ROUTES = new Map([
  ["/api/nicepayments/config", configHandler],
  ["/api/nicepayments/confirm", confirmHandler],
  ["/api/nicepayments/pro-trial", proTrialHandler],
  ["/api/nicepayments/return", returnHandler],
  ["/api/nicepayments/subscription/prepare", subscriptionHandler],
  ["/api/nicepayments/subscription/return", subscriptionHandler],
  ["/api/nicepayments/subscription/status", subscriptionHandler],
  ["/api/nicepayments/subscription/charge", subscriptionHandler],
  ["/api/nicepayments/subscription/inactive", subscriptionHandler],
]);

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};

const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const routeHandler = ROUTES.get(url.pathname);

    if (!routeHandler) {
      sendJson(res, 404, { message: "Not found" });
      return;
    }

    await routeHandler(req, res);
  } catch (error) {
    sendJson(res, 500, { message: `NICEPAYMENTS dev server failed: ${error.message}` });
  }
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[nicepayments] server listening on http://localhost:${PORT}`);
});
