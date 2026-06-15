import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_MATH_REHYPE_PLUGINS,
  MARKDOWN_MATH_REMARK_PLUGINS,
  normalizeMathMarkdown,
} from "./MathMarkdown";
import EvidencePageLinks from "./EvidencePageLinks";

const AUTO_MATH_TOKEN_RE = /(?:\\[a-zA-Z]+|[\^_\u221A\u221E\u2264\u2265\u2260\u2248\u2211\u222B\u220F]|->|\u2192|<=|>=|!=|~=)/;
const DEFAULT_SECTION_PAGE_CHARS = 2600;
const MIN_TAIL_PAGE_CHARS = 520;
const SOFT_MERGE_LIMIT_RATIO = 1.45;
const BARE_LATEX_COMMAND_RE =
  /\\(?:begin|end|frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|quad|qquad|lim)\b/;
const BARE_LATEX_COMMAND_GLOBAL_RE =
  /\\(?:begin|end|frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|quad|qquad|lim)\b/g;
const BARE_LATEX_ENV_RE = /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g;
const MATCHED_LATEX_ENV_BLOCK_RE = /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g;
const MATH_CONTEXT_CHAR_RE = /[A-Za-z0-9_\\^=+\-*/(){}[\].,| ]/;
const DISPLAY_ENV_RE = /\\begin\{(?:cases|aligned|align|matrix|pmatrix|bmatrix)\}/;
const AUTO_INLINE_MATH_PATTERNS = [
  /(^|[\s:(])((?:P|F|f)\([^)\n]{1,40}\)\s*=\s*[A-Za-z0-9_^\-+*/=(){}[\]|\\.,\s\u2264\u2265\u2260\u2248\u221E]{1,160})/g,
  /(^|[\s:(])(E\[[^\]\n]{1,50}\]\s*=\s*[A-Za-z0-9_^\-+*/=(){}[\]|\\.,\s\u2264\u2265\u2260\u2248\u221E]{1,160})/g,
  /(^|[\s:(])((?:Var|Cov)\([^)\n]{1,50}\)\s*=\s*[A-Za-z0-9_^\-+*/=(){}[\]|\\.,\s\u2264\u2265\u2260\u2248\u221E]{1,160})/g,
];

function normalizeMathExpression(expr) {
  return String(expr || "")
    .trim()
    .replace(/\u221A\s*([A-Za-z0-9]+)/g, "\\sqrt{$1}")
    .replace(/\\leq?/g, " \\le ")
    .replace(/\\geq?/g, " \\ge ")
    .replace(/\\neq?/g, " \\ne ")
    .replace(/\\to/g, " \\to ")
    .replace(/<=|\u2264/g, " \\le ")
    .replace(/>=|\u2265/g, " \\ge ")
    .replace(/!=|\u2260/g, " \\ne ")
    .replace(/~=|\u2248/g, " \\approx ")
    .replace(/->|\u2192/g, " \\to ")
    .replace(/\u221E/g, " \\infty ")
    .replace(/\u00D7/g, " \\times ")
    .replace(/\u00B7/g, " \\cdot ")
    .replace(/\u2211/g, " \\sum ")
    .replace(/\u222B/g, " \\int ")
    .replace(/\u220F/g, " \\prod ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function repairBrokenDollarSequences(line) {
  return String(line || "")
    .replace(/\\\$\$/g, "$$")
    .replace(/\\\$/g, "$")
    .replace(/([A-Za-z0-9)\]])\s*\$\$\s*([A-Za-z0-9([])/g, "$1 $2")
    .replace(/([A-Za-z0-9)\]])\s*\$(?=[A-Za-z0-9([])/g, "$1 ")
    .replace(/\$\$/g, " ")
    .replace(/\$/g, "");
}

function convertFormulaLikeSegments(line, toPlaceholder) {
  let working = line;
  for (const pattern of AUTO_INLINE_MATH_PATTERNS) {
    working = working.replace(pattern, (full, prefix, expr) => {
      const normalized = normalizeMathExpression(expr);
      if (!normalized) return full;
      return `${prefix}${toPlaceholder(`$${normalized}$`)}`;
    });
  }
  return working;
}

function pushMathRange(ranges, start, end) {
  if (end <= start) return;
  const last = ranges[ranges.length - 1];
  if (!last || start > last.end) {
    ranges.push({ start, end });
    return;
  }
  last.end = Math.max(last.end, end);
}

function normalizeLatexSnippet(expr) {
  return String(expr || "")
    .replace(/\\big\\\(/g, "\\big(")
    .replace(/\\big\\\)/g, "\\big)")
    .replace(/\\Big\\\(/g, "\\Big(")
    .replace(/\\Big\\\)/g, "\\Big)")
    .replace(/\\left\\\(/g, "\\left(")
    .replace(/\\right\\\)/g, "\\right)")
    .replace(/\\(?:tfrac|dfrac)\s*([0-9])\s*([0-9])/g, (full, a, b) =>
      full.startsWith("\\tfrac") ? `\\tfrac{${a}}{${b}}` : `\\dfrac{${a}}{${b}}`
    )
    .replace(/,\s*\[([0-9]+(?:\.[0-9]+)?(?:pt|em|ex))\]\s*/g, " \\\\[$1] ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function autoWrapBareLatexSegments(line, toPlaceholder) {
  const source = String(line || "");
  if (!BARE_LATEX_COMMAND_RE.test(source)) return source;

  const ranges = [];

  for (const match of source.matchAll(BARE_LATEX_ENV_RE)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + String(match[0] || "").length;
    pushMathRange(ranges, start, end);
  }

  for (const match of source.matchAll(BARE_LATEX_COMMAND_GLOBAL_RE)) {
    const commandStart = match.index ?? -1;
    if (commandStart < 0) continue;

    let start = commandStart;
    while (start > 0 && MATH_CONTEXT_CHAR_RE.test(source[start - 1])) {
      start -= 1;
    }

    let end = commandStart + String(match[0] || "").length;
    while (end < source.length && MATH_CONTEXT_CHAR_RE.test(source[end])) {
      end += 1;
    }

    while (start < end && /\s/.test(source[start])) start += 1;
    while (start < end && /[-*]/.test(source[start])) start += 1;
    while (start < end && /\s/.test(source[start])) start += 1;
    while (end > start && /\s/.test(source[end - 1])) end -= 1;

    const candidate = source.slice(start, end).trim();
    if (!candidate) continue;
    if (
      !/[=^_{}]/.test(candidate) &&
      !/\\(?:frac|dfrac|tfrac|sum|prod|int|begin|end|sqrt|lim)\b/.test(candidate)
    ) {
      continue;
    }

    pushMathRange(ranges, start, end);
  }

  if (!ranges.length) return source;

  let cursor = 0;
  let output = "";
  for (const range of ranges) {
    output += source.slice(cursor, range.start);
    const expr = normalizeLatexSnippet(source.slice(range.start, range.end));
    const wrapped = DISPLAY_ENV_RE.test(expr) ? `$$${expr}$$` : `$${expr}$`;
    output += toPlaceholder(wrapped);
    cursor = range.end;
  }
  output += source.slice(cursor);
  return output;
}

function sanitizeSummaryForMath(rawSummary) {
  const source = String(rawSummary || "").replace(/\r\n/g, "\n");
  if (!source) return "";

  const globalMathPlaceholders = [];
  const toGlobalMathPlaceholder = (value) => {
    const token = `%%GLOBALMATH${globalMathPlaceholders.length}%%`;
    globalMathPlaceholders.push(value);
    return token;
  };

  let prepared = source.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (match) =>
    toGlobalMathPlaceholder(match)
  );
  prepared = prepared.replace(MATCHED_LATEX_ENV_BLOCK_RE, (match) => {
    const normalized = normalizeLatexSnippet(match);
    if (!normalized) return match;
    return toGlobalMathPlaceholder(`$$${normalized}$$`);
  });

  const lines = prepared.split("\n");
  let inCodeFence = false;

  const normalized = lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence) return line;
      if (line.includes("`")) return line;

      let working = String(line || "").replace(/\\\$/g, "$");
      const placeholders = [];
      const toPlaceholder = (value) => {
        const token = `%%MATH${placeholders.length}%%`;
        placeholders.push(value);
        return token;
      };

      working = working.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (match) => toPlaceholder(match));
      working = repairBrokenDollarSequences(working);

      working = working.replace(/\[\s*([^[\]\n]+?)\s*\]/g, (full, expr) => {
        if (!AUTO_MATH_TOKEN_RE.test(expr)) return full;
        return toPlaceholder(`$$${normalizeMathExpression(expr)}$$`);
      });

      working = convertFormulaLikeSegments(working, toPlaceholder);
      working = autoWrapBareLatexSegments(working, toPlaceholder);

      return working
        .replace(/%%MATH(\d+)%%/g, (full, idx) => placeholders[Number(idx)] || full)
        .replace(/@@MATH_?(\d+)@@/g, (full, idx) => placeholders[Number(idx)] || full);
    })
    .join("\n");

  return normalized.replace(
    /%%GLOBALMATH(\d+)%%/g,
    (full, idx) => globalMathPlaceholders[Number(idx)] || full
  );
}

function rebalanceTrailingPages(pages, { maxChars, minTailChars = MIN_TAIL_PAGE_CHARS }) {
  const chunks = Array.isArray(pages)
    ? pages
        .map((page) => String(page || "").trim())
        .filter(Boolean)
    : [];
  if (chunks.length < 2) return chunks;

  const mergeLimit = Math.round(maxChars * SOFT_MERGE_LIMIT_RATIO);

  while (chunks.length > 1) {
    const lastIndex = chunks.length - 1;
    const tail = chunks[lastIndex];
    if (tail.length >= minTailChars) break;

    const prevIndex = lastIndex - 1;
    const merged = `${chunks[prevIndex]}\n\n${tail}`.trim();
    if (merged.length > mergeLimit) break;

    chunks[prevIndex] = merged;
    chunks.pop();
  }

  return chunks;
}

function splitLongSection(section, maxChars = DEFAULT_SECTION_PAGE_CHARS) {
  const source = String(section || "").trim();
  if (!source) return [];
  if (source.length <= maxChars) return [source];

  const lines = source.split("\n");
  const pages = [];
  let chunk = [];
  let chunkLength = 0;

  for (const line of lines) {
    const nextLength = line.length + 1;
    if (chunkLength + nextLength > maxChars && chunk.length) {
      pages.push(chunk.join("\n").trim());
      chunk = [];
      chunkLength = 0;
    }
    chunk.push(line);
    chunkLength += nextLength;
  }

  if (chunk.length) {
    pages.push(chunk.join("\n").trim());
  }

  return rebalanceTrailingPages(pages, { maxChars });
}

function packSectionChunksIntoPages(sectionChunks, maxChars = DEFAULT_SECTION_PAGE_CHARS) {
  const chunks = Array.isArray(sectionChunks)
    ? sectionChunks
        .map((chunk) => String(chunk || "").trim())
        .filter(Boolean)
    : [];
  if (!chunks.length) return [];

  const pages = [];
  let currentPage = "";

  for (const chunk of chunks) {
    if (!currentPage) {
      currentPage = chunk;
      continue;
    }

    const merged = `${currentPage}\n\n${chunk}`.trim();
    if (merged.length <= maxChars) {
      currentPage = merged;
      continue;
    }

    pages.push(currentPage);
    currentPage = chunk;
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  return rebalanceTrailingPages(pages, { maxChars });
}

function getFirstNonEmptyLine(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function isOverviewSection(section) {
  const heading = getFirstNonEmptyLine(section);
  return (
    /^##\s*(overview|overall overview)\s*$/i.test(heading) ||
    /^##\s*\uC804\uCCB4\s*\uAC1C\uC694\s*$/i.test(heading)
  );
}

function mergeOverviewWithNextSection(sections) {
  if (!Array.isArray(sections) || sections.length < 2) return sections;
  if (!isOverviewSection(sections[0])) return sections;
  return [`${sections[0].trim()}\n\n${sections[1].trim()}`.trim(), ...sections.slice(2)];
}

function splitSummaryIntoPages(summary) {
  const normalized = String(summary || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (line.startsWith("## ") && current.length) {
      sections.push(current.join("\n").trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    sections.push(current.join("\n").trim());
  }

  const baseSections = mergeOverviewWithNextSection(sections.length ? sections : [normalized]);
  const sectionChunks = baseSections.flatMap((section) => splitLongSection(section));
  return packSectionChunksIntoPages(sectionChunks);
}

function isInteractiveElement(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest("a, button, input, textarea, select, label, summary, [contenteditable='true']"))
  );
}

// ── Inline citation helpers ──────────────────────────────────────────────────

const INLINE_BADGE_RE = /\[(?:문서:)?p\.(\d+)\]|\[(T[123])\]/g;

function parseInlineBadges(text) {
  const segments = [];
  let lastIndex = 0;
  let match;
  INLINE_BADGE_RE.lastIndex = 0;
  while ((match = INLINE_BADGE_RE.exec(text)) !== null) {
    if (lastIndex < match.index) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      segments.push({ type: "page", pageNumber: parseInt(match[1], 10) });
    } else {
      segments.push({ type: "tier", tier: match[2] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

function PageAnchorBadge({ pageNumber, onJumpToPage }) {
  return (
    <span className="inline-block">
      {typeof onJumpToPage === "function" ? (
        <button
          type="button"
          className="anchor-badge"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onJumpToPage(pageNumber);
          }}
          aria-label={`PDF ${pageNumber}페이지로 이동`}
        >
          p.{pageNumber}
        </button>
      ) : (
        <span className="anchor-badge" aria-label={`PDF ${pageNumber}페이지`}>
          p.{pageNumber}
        </span>
      )}
    </span>
  );
}

function TierBadge({ tier }) {
  return (
    <span className={`tier-badge tier-badge--${String(tier || "").toLowerCase()}`} aria-label={`${tier} evidence tier`}>
      {tier}
    </span>
  );
}

function renderWithInlineBadges(children, onJumpToPage) {
  if (Array.isArray(children)) {
    return children.flatMap((child, i) => renderNodeWithInlineBadges(child, onJumpToPage, i));
  }
  return renderNodeWithInlineBadges(children, onJumpToPage, 0);
}

function renderNodeWithInlineBadges(node, onJumpToPage, keyBase) {
  if (typeof node === "string") {
    return renderStringWithInlineBadges(node, onJumpToPage, keyBase);
  }

  if (Array.isArray(node)) {
    return renderWithInlineBadges(node, onJumpToPage);
  }

  if (isValidElement(node) && node.props?.children) {
    return cloneElement(node, {
      children: renderWithInlineBadges(node.props.children, onJumpToPage),
    });
  }

  return node;
}

function renderStringWithInlineBadges(text, onJumpToPage, keyBase) {
  const segments = parseInlineBadges(text);
  if (segments.length === 1 && segments[0].type === "text") return [text];
  return segments.map((seg, i) => {
    if (seg.type === "page") {
      return (
        <PageAnchorBadge
          key={`${keyBase}-page-${i}`}
          pageNumber={seg.pageNumber}
          onJumpToPage={onJumpToPage}
        />
      );
    }
    if (seg.type === "tier") {
      return <TierBadge key={`${keyBase}-tier-${i}`} tier={seg.tier} />;
    }
    return <span key={`${keyBase}-text-${i}`}>{seg.content}</span>;
  });
}

function SummaryCard({
  summary,
  renderExportPages = false,
  onResolveEvidence,
  onJumpToEvidencePage,
  onAskTutor,
}) {
  const normalizedSummary = useMemo(
    () => normalizeMathMarkdown(sanitizeSummaryForMath(summary)).trim(),
    [summary]
  );
  const hasSummary = normalizedSummary.length > 0;
  const [isExpanded, setIsExpanded] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, text }
  const summaryKey = normalizedSummary;

  const pages = useMemo(() => splitSummaryIntoPages(normalizedSummary), [normalizedSummary]);
  const [pageIndexBySummary, setPageIndexBySummary] = useState({});
  const markdownComponents = useMemo(
    () => ({
      h1: ({ children, ...props }) => (
        <h1 className="mt-4 text-xl font-bold text-white" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </h1>
      ),
      h2: ({ children, ...props }) => (
        <h2 className="mt-3 text-lg font-semibold text-white" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </h2>
      ),
      h3: ({ children, ...props }) => (
        <h3 className="mt-2 text-base font-semibold text-emerald-100" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </h3>
      ),
      p: ({ children, ...props }) => (
        <p className="text-sm leading-relaxed text-slate-100 md:text-[15px]" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </p>
      ),
      strong: ({ children, ...props }) => (
        <strong className="font-semibold text-slate-50" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </strong>
      ),
      em: ({ children, ...props }) => (
        <em {...props}>{renderWithInlineBadges(children, onJumpToEvidencePage)}</em>
      ),
      ul: (props) => <ul className="list-disc space-y-1 pl-5 text-sm text-slate-100 md:text-[15px]" {...props} />,
      ol: (props) => <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-100 md:text-[15px]" {...props} />,
      li: ({ children, ...props }) => (
        <li className="leading-relaxed" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </li>
      ),
      code: ({ inline, className, children, ...props }) =>
        inline ? (
          <code className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[12px] text-emerald-100" {...props}>
            {children}
          </code>
        ) : (
          <pre className="overflow-auto rounded-xl bg-slate-900/80 p-3 text-[12px] text-slate-100" {...props}>
            <code className={className}>{children}</code>
          </pre>
        ),
      table: (props) => (
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-100 md:text-[15px]" {...props} />
        </div>
      ),
      th: ({ children, ...props }) => (
        <th className="border-b border-white/10 px-3 py-2 font-semibold text-emerald-100" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </th>
      ),
      td: ({ children, ...props }) => (
        <td className="border-b border-white/5 px-3 py-2 text-slate-100" {...props}>
          {renderWithInlineBadges(children, onJumpToEvidencePage)}
        </td>
      ),
    }),
    [onJumpToEvidencePage]
  );
  const exportMarkdownComponents = useMemo(
    () => ({
      h1: (props) => <h1 className="mt-4 text-[22px] font-bold text-slate-900" {...props} />,
      h2: (props) => <h2 className="mt-3 text-[19px] font-semibold text-slate-900" {...props} />,
      h3: (props) => <h3 className="mt-2 text-[16px] font-semibold text-slate-800" {...props} />,
      p: (props) => <p className="text-[13px] leading-[1.75] text-slate-800" {...props} />,
      strong: (props) => (
        <strong className="rounded bg-amber-100 px-[3px] py-[1px] font-semibold text-slate-950" {...props} />
      ),
      ul: (props) => (
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-[1.75] text-slate-800 marker:text-slate-500" {...props} />
      ),
      ol: (props) => (
        <ol className="list-decimal space-y-1 pl-6 text-[13px] leading-[1.75] text-slate-800 marker:font-semibold marker:text-slate-700" {...props} />
      ),
      li: (props) => <li className="leading-[1.7]" {...props} />,
      code: ({ inline, className, children, ...props }) =>
        inline ? (
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] text-slate-900" {...props}>
            {children}
          </code>
        ) : (
          <pre className="overflow-auto rounded-lg bg-slate-100 p-3 text-[12px] text-slate-900" {...props}>
            <code className={className}>{children}</code>
          </pre>
        ),
      table: (props) => (
        <div className="overflow-auto">
          <table className="min-w-full text-left text-[13px] text-slate-900" {...props} />
        </div>
      ),
      th: (props) => <th className="border border-slate-300 px-3 py-2 font-semibold text-slate-900" {...props} />,
      td: (props) => <td className="border border-slate-200 px-3 py-2 text-slate-800" {...props} />,
    }),
    []
  );

  const scrollContainerRef = useRef(null);
  const expandedScrollContainerRef = useRef(null);

  const pageIndex = pageIndexBySummary[summaryKey] ?? 0;
  const totalPages = Math.max(1, pages.length);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const currentPage = pages[safePageIndex] || normalizedSummary;
  const canGoPrev = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;
  const canResolveEvidence =
    typeof onResolveEvidence === "function" && typeof onJumpToEvidencePage === "function";
  const evidenceRequestKey = `${summaryKey}:${safePageIndex}`;

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    if (expandedScrollContainerRef.current) {
      expandedScrollContainerRef.current.scrollTop = 0;
    }
  }, [safePageIndex]);

  useEffect(() => {
    setPageIndexBySummary((prev) => {
      const current = prev[summaryKey] ?? 0;
      const clamped = Math.max(0, Math.min(totalPages - 1, current));
      if (current === clamped) return prev;

      return {
        ...prev,
        [summaryKey]: clamped,
      };
    });
  }, [summaryKey, totalPages]);

  const goPrev = useCallback(() => {
    setPageIndexBySummary((prev) => {
      const current = prev[summaryKey] ?? 0;
      return {
        ...prev,
        [summaryKey]: Math.max(0, current - 1),
      };
    });
  }, [summaryKey]);

  const goNext = useCallback(() => {
    setPageIndexBySummary((prev) => {
      const current = prev[summaryKey] ?? 0;
      return {
        ...prev,
        [summaryKey]: Math.min(totalPages - 1, current + 1),
      };
    });
  }, [summaryKey, totalPages]);

  const handleSummaryPageClick = useCallback(
    (event) => {
      const target = event.target;
      if (isInteractiveElement(target)) {
        return;
      }

      if (typeof window !== "undefined" && typeof window.getSelection === "function") {
        const selectedText = String(window.getSelection()?.toString() || "").trim();
        if (selectedText) return;
      }

      const currentTarget = event.currentTarget;
      if (!(currentTarget instanceof HTMLElement)) return;

      const rect = currentTarget.getBoundingClientRect();
      if (!rect.width) return;

      const offsetX = event.clientX - rect.left;
      const edgeRatio = 0.22;
      if (offsetX <= rect.width * edgeRatio) {
        if (!canGoPrev) return;
        event.preventDefault();
        goPrev();
        return;
      }
      if (offsetX >= rect.width * (1 - edgeRatio)) {
        if (!canGoNext) return;
        event.preventDefault();
        goNext();
      }
    },
    [canGoNext, canGoPrev, goNext, goPrev]
  );

  const handleContextMenu = useCallback(
    (e) => {
      if (typeof onAskTutor !== "function") return;
      e.preventDefault();
      e.stopPropagation();
      const text = (
        e.target?.ownerDocument ?? document
      ).getSelection?.()?.toString().trim() ?? "";
      if (!text) return;
      // Keep menu inside viewport
      const menuW = 190;
      const menuH = 44;
      const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
      const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
      setCtxMenu({ x, y, text });
    },
    [onAskTutor]
  );

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  const handleCardKeyDown = useCallback(
    (event) => {
      if (isInteractiveElement(event.target)) return;

      if (event.key === "ArrowLeft") {
        if (!canGoPrev) return;
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        if (!canGoNext) return;
        event.preventDefault();
        goNext();
      }
    },
    [canGoNext, canGoPrev, goNext, goPrev]
  );

  useEffect(() => {
    if (!isExpanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleWindowKeyDown = (event) => {
      if (isInteractiveElement(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setIsExpanded(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        if (!canGoPrev) return;
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        if (!canGoNext) return;
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [canGoNext, canGoPrev, goNext, goPrev, isExpanded]);

  if (!hasSummary) return null;

  const renderMarkdownPage = (pageContent, components, tone = "dark") => {
    const proseClass =
      tone === "light"
        ? "summary-prose prose max-w-none space-y-2 text-slate-900 prose-p:leading-relaxed prose-headings:text-slate-900 prose-strong:text-slate-900 prose-a:text-slate-900 caret-transparent"
        : "summary-prose prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50 caret-transparent";

    // remark parses bracket-only anchors as unresolved link references and splits
    // them into separate text nodes, so escape supported badge tokens first.
    const escapedContent = String(pageContent || "").replace(
      /\[(?:문서:)?p\.(\d+)\]|\[(T[123])\]/g,
      (match, page, tier) => (page ? `\\${match.slice(0, -1)}\\]` : `\\[${tier}\\]`)
    );

    return (
      <div className={proseClass}>
        <ReactMarkdown
          remarkPlugins={MARKDOWN_MATH_REMARK_PLUGINS}
          rehypePlugins={MARKDOWN_MATH_REHYPE_PLUGINS}
          components={components}
        >
          {escapedContent}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <>
      <div
        className="summary-card mt-4 rounded-2xl bg-gradient-to-br from-slate-900/60 via-slate-900/50 to-slate-900/40 p-4 ring-1 ring-white/10 caret-transparent md:p-5"
        tabIndex={0}
        onKeyDown={handleCardKeyDown}
      >
        <div className="block">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="ghost-button text-[11px] text-slate-200 sm:hidden"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              크게 보기
            </button>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
              요약 페이지 {safePageIndex + 1}/{totalPages}
            </span>
          </div>
        </div>

        {canResolveEvidence && (
          <EvidencePageLinks
            requestKey={evidenceRequestKey}
            onResolveEvidence={() => onResolveEvidence(currentPage)}
            onJumpToPage={onJumpToEvidencePage}
            className="mb-3"
          />
        )}

        <div className="relative w-full">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="이전 요약 페이지"
            className="hidden ghost-button absolute left-1 top-1/2 z-20 h-8 w-8 -translate-y-1/2 text-xs text-slate-100 pointer-events-auto sm:h-9 sm:w-9"
            style={{ "--ghost-color": "148, 163, 184", touchAction: "manipulation", padding: 0 }}
          >
            {"<"}
          </button>

          <div className="w-full max-w-none">
            <div
              className="mx-auto aspect-[210/297] w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/30 md:p-7"
              onClick={handleSummaryPageClick}
              onContextMenu={handleContextMenu}
            >
              <div ref={scrollContainerRef} className="show-scrollbar h-full overflow-auto pr-1">
                {renderMarkdownPage(currentPage, markdownComponents)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="다음 요약 페이지"
            className="hidden ghost-button absolute right-1 top-1/2 z-20 h-8 w-8 -translate-y-1/2 text-xs text-slate-100 pointer-events-auto sm:h-9 sm:w-9"
            style={{ "--ghost-color": "148, 163, 184", touchAction: "manipulation", padding: 0 }}
          >
            {">"}
          </button>
        </div>
        </div>

        {renderExportPages && (
          <div aria-hidden="true" className="pointer-events-none fixed left-[-20000px] top-0 flex flex-col gap-6">
            {pages.map((page, index) => (
              <section
                key={`summary-export-page-${index}`}
                className="summary-export-page w-[794px] min-h-[1123px] bg-white px-16 py-16"
                style={{ fontVariantNumeric: "lining-nums tabular-nums" }}
              >
                <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="text-[11px] font-medium text-slate-500">
                    페이지 {index + 1} / {totalPages}
                  </span>
                </div>
                {renderMarkdownPage(page, exportMarkdownComponents, "light")}
              </section>
            ))}
          </div>
        )}
      </div>

      {isExpanded && createPortal(
        <div
          className="fixed inset-0 z-[170] flex flex-col bg-slate-950/80 backdrop-blur-sm sm:px-5 sm:py-5"
          role="dialog"
          aria-modal="true"
          aria-label="요약 확대 보기"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1600px] flex-1 flex-col overflow-hidden rounded-none border-0 border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60 sm:rounded-[2rem] sm:border"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-white/10 px-4 py-2 sm:px-6">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                className="inline-flex items-center justify-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
              >
                이전
              </button>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
                {safePageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                className="inline-flex items-center justify-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="inline-flex items-center justify-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 p-0 sm:p-5 lg:p-6">
              <div
                ref={expandedScrollContainerRef}
                className="show-scrollbar h-full overflow-auto rounded-none border-0 border-white/10 bg-slate-900/50 p-4 sm:rounded-[1.75rem] sm:border sm:p-6 lg:p-8"
                onContextMenu={handleContextMenu}
              >
                {renderMarkdownPage(currentPage, markdownComponents)}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {ctxMenu && createPortal(
        <div
          className="fixed z-[9999] min-w-[180px] overflow-hidden rounded-xl bg-slate-800 py-1 shadow-2xl ring-1 ring-white/15"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-100 hover:bg-violet-600/70 active:bg-violet-700/80"
            onClick={() => {
              onAskTutor(ctxMenu.text);
              setCtxMenu(null);
            }}
          >
            <span className="text-violet-300">✦</span>
            AI 튜터에게 질문
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default SummaryCard;
