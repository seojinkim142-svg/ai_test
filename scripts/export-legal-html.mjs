import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TERMS_CONTENT } from "../src/legal/termsContent.js";
import { PRIVACY_CONTENT } from "../src/legal/privacyContent.js";
import { renderLegalDocumentFragment, renderLegalDocumentHtml } from "../src/legal/renderLegalHtml.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "public", "legal-html");

const documents = [
  { name: "terms", content: TERMS_CONTENT },
  { name: "privacy", content: PRIVACY_CONTENT },
];

await mkdir(outputDir, { recursive: true });

for (const document of documents) {
  const fullHtmlPath = path.join(outputDir, `${document.name}.html`);
  const fragmentPath = path.join(outputDir, `${document.name}.fragment.html`);
  const directRouteDir = path.join(repoRoot, "public", document.name);

  await writeFile(fullHtmlPath, renderLegalDocumentHtml(document.content), "utf8");
  await writeFile(fragmentPath, renderLegalDocumentFragment(document.content).trim(), "utf8");
  await mkdir(directRouteDir, { recursive: true });
  await writeFile(path.join(directRouteDir, "index.html"), renderLegalDocumentHtml(document.content), "utf8");
}

console.log(`LEGAL_HTML_EXPORTED:${outputDir}`);
