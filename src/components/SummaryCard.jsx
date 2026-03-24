import { useCallback, useEffect, useMemo, useState } from "react";
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

function SummaryCard({
  summary,
  renderExportPages = false,
  onResolveEvidence,
  onJumpToEvidencePage,
}) {
  const normalizedSummary = useMemo(
    () => normalizeMathMarkdown(sanitizeSummaryForMath(summary)).trim(),
    [summary]
  );
  const hasSummary = normalizedSummary.length > 0;
  const [isExpanded, setIsExpanded] = useState(false);
  const summaryKey = useMemo(
    () => `${normalizedSummary.length}:${normalizedSummary.slice(0, 120)}`,
    [normalizedSummary]
  );

  const pages = useMemo(() => splitSummaryIntoPages(normalizedSummary), [normalizedSummary]);
  const [pageIndexBySummary, setPageIndexBySummary] = useState({});
  const markdownComponents = useMemo(
    () => ({
      h1: (props) => <h1 className="mt-4 text-xl font-bold text-white" {...props} />,
      h2: (props) => <h2 className="mt-3 text-lg font-semibold text-white" {...props} />,
      h3: (props) => <h3 className="mt-2 text-base font-semibold text-emerald-100" {...props} />,
      p: (props) => <p className="text-sm leading-relaxed text-slate-100 md:text-[15px]" {...props} />,
      strong: (props) => <strong className="font-semibold text-slate-50" {...props} />,
      ul: (props) => <ul className="list-disc space-y-1 pl-5 text-sm text-slate-100 md:text-[15px]" {...props} />,
      ol: (props) => <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-100 md:text-[15px]" {...props} />,
      li: (props) => <li className="leading-relaxed" {...props} />,
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
      th: (props) => (
        <th className="border-b border-white/10 px-3 py-2 font-semibold text-emerald-100" {...props} />
      ),
      td: (props) => <td className="border-b border-white/5 px-3 py-2 text-slate-100" {...props} />,
    }),
    []
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

  const pageIndex = pageIndexBySummary[summaryKey] ?? 0;
  const totalPages = Math.max(1, pages.length);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const currentPage = pages[safePageIndex] || normalizedSummary;
  const canGoPrev = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;
  const canResolveEvidence =
    typeof onResolveEvidence === "function" && typeof onJumpToEvidencePage === "function";
  const evidenceRequestKey = `${summaryKey}:${safePageIndex}`;

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
      if (
        target instanceof Element &&
        target.closest("a, button, input, textarea, select, label, summary")
      ) {
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

  const handleNavPointerDown = useCallback(() => {}, []);

  const handleNavClick = useCallback(() => {}, []);

  const handleCardKeyDown = useCallback(
    (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    },
    [goNext, goPrev]
  );

  useEffect(() => {
    if (!isExpanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleWindowKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsExpanded(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [goNext, goPrev, isExpanded]);

  if (!hasSummary) return null;

  const renderMarkdownPage = (pageContent, components, tone = "dark") => {
    const proseClass =
      tone === "light"
        ? "summary-prose prose max-w-none space-y-2 text-slate-900 prose-p:leading-relaxed prose-headings:text-slate-900 prose-strong:text-slate-900 prose-a:text-slate-900 caret-transparent"
        : "summary-prose prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50 caret-transparent";

    return (
      <div className={proseClass}>
        <ReactMarkdown
          remarkPlugins={MARKDOWN_MATH_REMARK_PLUGINS}
          rehypePlugins={MARKDOWN_MATH_REHYPE_PLUGINS}
          components={components}
        >
          {pageContent}
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
        <div className="hidden">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">요약</p>
              {totalPages > 1 && (
                <p className="mt-1 text-[11px] text-slate-400">모바일에서는 전체 요약을 한 번에 크게 보여줍니다.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="ghost-button shrink-0 text-[11px] text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              크게 보기
            </button>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5 shadow-inner shadow-black/30">
            {renderMarkdownPage(normalizedSummary, markdownComponents)}
          </div>
        </div>

        <div className="block">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">요약</p>
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
            onPointerDown={(event) => handleNavPointerDown(event, goPrev)}
            onClick={(event) => handleNavClick(event, goPrev)}
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
            >
              <div className="show-scrollbar h-full overflow-auto pr-1">
                {renderMarkdownPage(currentPage, markdownComponents)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onPointerDown={(event) => handleNavPointerDown(event, goNext)}
            onClick={(event) => handleNavClick(event, goNext)}
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">요약</p>
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

      {isExpanded && (
        <div
          className="fixed inset-0 z-[170] bg-slate-950/80 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-5"
          role="dialog"
          aria-modal="true"
          aria-label="요약 확대 보기"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Expanded Summary</p>
                <p className="mt-1 text-sm text-slate-200">웹과 태블릿에서 더 크게 읽을 수 있는 요약 뷰입니다.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  className="ghost-button text-xs text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
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
                  className="ghost-button text-xs text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  다음
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="ghost-button text-xs text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "226, 232, 240" }}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 p-3 sm:p-5 lg:p-6">
              <div className="show-scrollbar h-full overflow-auto rounded-[1.75rem] border border-white/10 bg-slate-900/50 p-4 sm:p-6 lg:p-8">
                {renderMarkdownPage(currentPage, markdownComponents)}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SummaryCard;
