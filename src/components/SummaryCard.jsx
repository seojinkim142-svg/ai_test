import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function splitLongSection(section, maxChars = 1800) {
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

  return pages.filter(Boolean);
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
  return /^##\s*(overview|overall overview|전체\s*개요)\s*$/i.test(heading);
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
  return baseSections.flatMap((section) => splitLongSection(section));
}

function SummaryCard({ summary, renderExportPages = false }) {
  const normalizedSummary = String(summary || "").trim();
  const hasSummary = normalizedSummary.length > 0;
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
      p: (props) => <p className="text-sm leading-relaxed text-slate-100" {...props} />,
      strong: (props) => <strong className="font-semibold text-slate-50" {...props} />,
      ul: (props) => <ul className="list-disc space-y-1 pl-5 text-sm text-slate-100" {...props} />,
      ol: (props) => <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-100" {...props} />,
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
          <table className="min-w-full text-left text-sm text-slate-100" {...props} />
        </div>
      ),
      th: (props) => (
        <th className="border-b border-white/10 px-3 py-2 font-semibold text-emerald-100" {...props} />
      ),
      td: (props) => <td className="border-b border-white/5 px-3 py-2 text-slate-100" {...props} />,
    }),
    []
  );

  const pageIndex = pageIndexBySummary[summaryKey] ?? 0;
  const totalPages = Math.max(1, pages.length);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const currentPage = pages[safePageIndex] || normalizedSummary;
  const canGoPrev = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;
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
  const handleNavPointerDown = useCallback((event, navigate) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    navigate();
  }, []);
  const handleNavClick = useCallback((event, navigate) => {
    event.stopPropagation();
    if (event.detail !== 0) return;
    navigate();
  }, []);
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

  if (!hasSummary) return null;

  return (
    <div
      className="summary-card mt-4 rounded-2xl bg-gradient-to-br from-slate-900/60 via-slate-900/50 to-slate-900/40 p-4 ring-1 ring-white/10"
      tabIndex={0}
      onKeyDown={handleCardKeyDown}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Summary</p>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
          A4 Bundle {safePageIndex + 1}/{totalPages}
        </span>
      </div>

      <div className="relative flex items-center justify-center px-8 md:px-10">
        <button
          type="button"
          onPointerDown={(event) => handleNavPointerDown(event, goPrev)}
          onClick={(event) => handleNavClick(event, goPrev)}
          disabled={!canGoPrev}
          aria-label="Previous summary page"
          className="ghost-button absolute left-0 top-1/2 z-20 h-11 w-11 -translate-y-1/2 p-0 text-sm text-slate-100 pointer-events-auto"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184", touchAction: "manipulation" }}
        >
          {"<"}
        </button>

        <div className="w-full max-w-[860px]">
          <div className="mx-auto aspect-[210/297] w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/30 md:p-6">
            <div className="show-scrollbar h-full overflow-auto pr-1">
              <div className="summary-prose prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={markdownComponents}
                >
                  {currentPage}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onPointerDown={(event) => handleNavPointerDown(event, goNext)}
          onClick={(event) => handleNavClick(event, goNext)}
          disabled={!canGoNext}
          aria-label="Next summary page"
          className="ghost-button absolute right-0 top-1/2 z-20 h-11 w-11 -translate-y-1/2 p-0 text-sm text-slate-100 pointer-events-auto"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184", touchAction: "manipulation" }}
        >
          {">"}
        </button>
      </div>

      {renderExportPages && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-20000px] top-0 flex flex-col gap-6">
          {pages.map((page, index) => (
            <section
              key={`summary-export-page-${index}`}
              className="summary-export-page w-[794px] min-h-[1123px] rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/85 to-slate-950/95 p-10 ring-1 ring-white/10"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Summary</p>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
                  A4 Bundle {index + 1}/{totalPages}
                </span>
              </div>
              <div className="summary-prose prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={markdownComponents}
                >
                  {page}
                </ReactMarkdown>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default SummaryCard;
