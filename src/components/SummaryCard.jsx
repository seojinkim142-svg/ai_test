import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function sanitizeSummary(text) {
  if (!text) return null;
  return text
    .replace(/\\\$/g, "$")
    .replace(
      /\[\s*([^[\]]*(?:\\frac|\\cdot|\\lambda|\\mu|\\sigma|\\pi|\\sum|\\int|\\alpha|\\beta|\\gamma|\\theta|\\phi|\\psi)[^[\]]*)\s*\]/g,
      (_, expr) => `$$${expr.trim()}$$`
    );
}

function SummaryCard({ summary }) {
  if (!summary) return null;

  const sanitized = sanitizeSummary(summary);

  return (
    <div className="mt-4 rounded-2xl bg-gradient-to-br from-slate-900/60 via-slate-900/50 to-slate-900/40 p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">요약</p>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
          Markdown styled
        </span>
      </div>
      <div className="prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-white mt-4" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-white mt-3" {...props} />,
            h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-emerald-100 mt-2" {...props} />,
            p: ({ node, ...props }) => <p className="text-sm leading-relaxed text-slate-100" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-semibold text-slate-50" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1 text-sm text-slate-100" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-100" {...props} />,
            li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
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
            table: ({ node, ...props }) => (
              <div className="overflow-auto">
                <table className="min-w-full text-sm text-left text-slate-100" {...props} />
              </div>
            ),
            th: ({ node, ...props }) => (
              <th className="border-b border-white/10 px-3 py-2 font-semibold text-emerald-100" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="border-b border-white/5 px-3 py-2 text-slate-100" {...props} />
            ),
          }}
        >
          {sanitized}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default SummaryCard;
