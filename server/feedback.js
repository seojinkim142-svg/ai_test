/* global process */
import http from "http";
import dotenv from "dotenv";
import notifyHandler from "../api/feedback/notify.js";

dotenv.config();

const PORT = Number(process.env.FEEDBACK_PORT || 8792);

const ROUTES = new Map([["/api/feedback/notify", notifyHandler]]);

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
    sendJson(res, 500, { message: `Feedback dev server failed: ${error.message}` });
  }
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[feedback] server listening on http://localhost:${PORT}`);
});
