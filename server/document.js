/* global process */
import http from "http";
import dotenv from "dotenv";
import convertHandler from "../api/document/convert.js";

dotenv.config();

const PORT = Number(process.env.DOCUMENT_PORT || 8793);

const ROUTES = new Map([["/api/document/convert", convertHandler]]);

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
    sendJson(res, 500, { message: `Document dev server failed: ${error.message}` });
  }
};

http.createServer(handler).listen(PORT, () => {
  console.log(`[document] server listening on http://localhost:${PORT}`);
});
