import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "./companyInfo.js";

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const SITE_ORIGIN = "https://zeusian.ai.kr";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function buildAbsoluteUrl(pathname = "/") {
  const normalizedPath = String(pathname || "/").startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, SITE_ORIGIN).toString();
}

function buildLegalPageUrl(content) {
  const slug = String(content?.slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return buildAbsoluteUrl(slug ? `/${slug}` : "/");
}

function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderList(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  const className = ordered ? "legal-list legal-list-ordered" : "legal-list";
  const renderedItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<${tag} class="${className}">${renderedItems}</${tag}>`;
}

function renderBlock(block) {
  if (block.type === "ol") {
    return renderList(block.items, true);
  }

  if (block.type === "ul") {
    return renderList(block.items, false);
  }

  return `<p class="legal-paragraph">${escapeHtml(block.text)}</p>`;
}

export function renderLegalDocumentFragment(content) {
  const companyCards = COMPANY_INFO_ITEMS.map(
    (item) =>
      `<div class="legal-company-item"><p class="legal-card-label">${escapeHtml(item.label)}</p><p class="legal-card-value">${escapeHtml(
        item.value
      )}</p></div>`
  ).join("");

  const tocLinks = content.sections
    .map((section) => `<a class="legal-toc-link" href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`)
    .join("");

  const sectionCards = content.sections
    .map(
      (section) => `
        <section id="${escapeHtml(section.id)}" class="legal-section">
          <h2 class="legal-section-title">${escapeHtml(section.title)}</h2>
          <div class="legal-section-body">
            ${section.blocks.map(renderBlock).join("")}
          </div>
        </section>
      `
    )
    .join("");

  const legalLinks = LEGAL_LINKS.map(
    (link) => `<a class="legal-nav-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
  ).join("");

  return `
    <div class="legal-document">
      <header class="legal-header">
        <div>
          <p class="legal-eyebrow">${escapeHtml(content.eyebrow)}</p>
          <h1 class="legal-title">${escapeHtml(content.title)}</h1>
          <p class="legal-description">${escapeHtml(content.description)}</p>
        </div>
        <div class="legal-badge">시행일 ${escapeHtml(content.effectiveDate)}</div>
      </header>

      <nav class="legal-nav">${legalLinks}</nav>

      <section class="legal-company-grid">
        ${companyCards}
      </section>

      <section class="legal-toc-wrap">
        <p class="legal-toc-title">문서 내 바로가기</p>
        <div class="legal-toc">${tocLinks}</div>
      </section>

      <section class="legal-scroll-shell">
        <div class="legal-sections">
          ${sectionCards}
        </div>
      </section>
    </div>
  `;
}

export function renderLegalDocumentHtml(content) {
  const canonicalUrl = buildLegalPageUrl(content);
  const title = `${content.title} | Zeusian`;
  const description = String(content.description || "");
  const ogImageUrl = buildAbsoluteUrl("/zeusian_logo.png");
  const jsonLd = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: canonicalUrl,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: "Zeusian",
      url: buildAbsoluteUrl("/"),
    },
  });

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="Zeusian" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      :root {
        color-scheme: light;
        --bg: #fbfbf9;
        --panel: #ffffff;
        --panel-soft: #fbfbf9;
        --border: #e5e5e0;
        --border-strong: #006fee;
        --text: #0a0a0a;
        --text-soft: #666666;
        --text-muted: #999999;
        --accent: #006fee;
        --accent-strong: #006fee;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      a { color: inherit; text-decoration: none; }

      .legal-page {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .legal-document {
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        background: var(--panel);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .legal-header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-end;
        padding: 32px;
        border-bottom: 1px solid var(--border);
      }

      .legal-eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .legal-title {
        margin: 16px 0 0;
        font-size: clamp(32px, 4vw, 52px);
        line-height: 1.04;
      }

      .legal-description {
        margin: 16px 0 0;
        max-width: 760px;
        color: var(--text-soft);
        font-size: 15px;
        line-height: 1.9;
      }

      .legal-badge {
        flex-shrink: 0;
        padding: 12px 16px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--panel-soft);
        color: var(--text-soft);
        font-size: 14px;
        font-weight: 600;
      }

      .legal-nav {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        padding: 24px 32px 0;
      }

      .legal-nav-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--panel);
        color: var(--text-soft);
        font-size: 14px;
        font-weight: 700;
        transition: border-color 160ms ease, color 160ms ease;
      }

      .legal-nav-link:hover {
        border-color: var(--border-strong);
        color: var(--accent);
      }

      .legal-company-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border-bottom: 1px solid var(--border);
      }

      .legal-company-item {
        padding: 18px 24px 16px;
        border-right: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        background: var(--panel-soft);
      }

      .legal-card-label {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .legal-card-value {
        margin: 10px 0 0;
        color: var(--text);
        font-size: 15px;
        line-height: 1.7;
      }

      .legal-toc-wrap {
        padding: 16px 32px;
        border-bottom: 1px solid var(--border);
      }

      .legal-toc-title {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .legal-toc {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .legal-toc-link {
        display: inline-flex;
        min-height: 38px;
        align-items: center;
        padding: 0 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--panel-soft);
        color: var(--text-soft);
        font-size: 12px;
        font-weight: 500;
      }

      .legal-toc-link:hover {
        border-color: var(--border-strong);
        color: var(--accent);
      }

      .legal-scroll-shell {
        max-height: 72vh;
        overflow-y: auto;
        background: var(--panel);
      }

      .legal-sections {
        padding: 16px 32px;
      }

      .legal-section {
        padding: 28px 0;
      }

      .legal-section + .legal-section {
        border-top: 1px solid var(--border);
      }

      .legal-section-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.45;
      }

      .legal-section-body {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .legal-paragraph,
      .legal-list {
        margin: 0;
        color: var(--text-soft);
        font-size: 15px;
        line-height: 1.9;
      }

      .legal-list {
        padding-left: 22px;
      }

      .legal-list li + li {
        margin-top: 8px;
      }

      .legal-list-ordered {
        list-style: decimal;
      }

      @media (max-width: 900px) {
        .legal-header,
        .legal-company-grid,
        .legal-sections,
        .legal-nav {
          padding-left: 20px;
          padding-right: 20px;
        }

        .legal-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .legal-company-grid {
          grid-template-columns: 1fr;
        }

        .legal-company-item {
          border-right: 0;
        }
      }

      @media (max-width: 640px) {
        .legal-page {
          width: min(100% - 20px, 1120px);
          padding-top: 20px;
          padding-bottom: 28px;
        }

        .legal-header,
        .legal-sections,
        .legal-nav,
        .legal-company-grid,
        .legal-toc-wrap {
          padding-left: 16px;
          padding-right: 16px;
        }

        .legal-header {
          padding-top: 24px;
          padding-bottom: 24px;
        }

        .legal-section {
          padding-top: 22px;
          padding-bottom: 22px;
        }
      }
    </style>
  </head>
  <body>
    <main class="legal-page">
      ${renderLegalDocumentFragment(content)}
    </main>
  </body>
</html>
`;
}
