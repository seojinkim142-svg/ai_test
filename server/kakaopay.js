/* global process */
import http from "http";
import dotenv from "dotenv";
import approveHandler from "../api/kakaopay/approve.js";
import returnHandler from "../api/kakaopay/return.js";
import readyHandler from "../api/kakaopay/ready.js";
import subscriptionHandler from "../api/kakaopay/subscription/[action].js";

dotenv.config();

const PORT = Number(process.env.KAKAOPAY_PORT || 8787);

const ROUTES = new Map([
  ["/api/kakaopay/ready", readyHandler],
  ["/api/kakaopay/approve", approveHandler],
  ["/api/kakaopay/return", returnHandler],
  ["/api/kakaopay/subscription/status", subscriptionHandler],
  ["/api/kakaopay/subscription/charge", subscriptionHandler],
  ["/api/kakaopay/subscription/inactive", subscriptionHandler],
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
    sendJson(res, 500, { message: `KakaoPay dev server failed: ${error.message}` });
  }
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[kakaopay] server listening on http://localhost:${PORT}`);
});
