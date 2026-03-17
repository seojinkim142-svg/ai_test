import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "./companyInfo";

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
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
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(content.title)} | Zeusian</title>
    <meta name="description" content="${escapeHtml(content.description)}" />
    <style>
      :root {
        color-scheme: dark;
        --bg: #020617;
        --panel: rgba(2, 6, 23, 0.82);
        --panel-soft: rgba(255, 255, 255, 0.04);
        --border: rgba(52, 211, 153, 0.16);
        --border-strong: rgba(52, 211, 153, 0.3);
        --text: #f8fafc;
        --text-soft: #cbd5e1;
        --text-muted: #94a3b8;
        --accent: #6ee7b7;
        --accent-strong: #34d399;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif;
        background:
          radial-gradient(circle at top, rgba(16, 185, 129, 0.22), transparent 30%),
          linear-gradient(180deg, #04110f 0%, #020617 100%);
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
        overflow: hidden;
        background: var(--panel);
        box-shadow: 0 30px 120px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(16px);
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
        color: rgba(110, 231, 183, 0.78);
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
        background: rgba(0, 0, 0, 0.24);
        color: rgba(236, 253, 245, 0.9);
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
        color: rgba(236, 253, 245, 0.92);
        font-size: 14px;
        font-weight: 700;
        transition: border-color 160ms ease, background-color 160ms ease;
      }

      .legal-nav-link:hover {
        border-color: var(--border-strong);
        background: rgba(52, 211, 153, 0.08);
      }

      .legal-company-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border-bottom: 1px solid var(--border);
      }

      .legal-company-item {
        padding: 18px 24px 16px;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.12);
      }

      .legal-card-label {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(110, 231, 183, 0.72);
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
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
        color: var(--text-soft);
        font-size: 12px;
        font-weight: 500;
      }

      .legal-toc-link:hover {
        border-color: var(--border-strong);
        color: rgba(236, 253, 245, 0.95);
      }

      .legal-scroll-shell {
        max-height: 72vh;
        overflow-y: auto;
        background: #020814;
      }

      .legal-sections {
        padding: 16px 32px;
      }

      .legal-section {
        padding: 28px 0;
      }

      .legal-section + .legal-section {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
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
