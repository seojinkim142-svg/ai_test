import { handleDocumentPreviewConversionRequest } from "../../lib/documents/server.js";

export default async function handler(req, res) {
  return handleDocumentPreviewConversionRequest(req, res);
}
