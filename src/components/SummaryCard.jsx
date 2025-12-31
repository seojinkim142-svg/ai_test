import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function SummaryCard({ summary }) {
  if (!summary) return null;

  return (
    <div className="summary-card mt-4 rounded-2xl bg-gradient-to-br from-slate-900/60 via-slate-900/50 to-slate-900/40 p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">요약</p>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/20">
          Markdown + KaTeX
        </span>
      </div>
      <div className="summary-prose prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-slate-50 prose-strong:text-slate-50 prose-a:text-slate-50">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            h1: (props) => <h1 className="mt-4 text-xl font-bold text-white" {...props} />,
            h2: (props) => <h2 className="mt-3 text-lg font-semibold text-white" {...props} />,
            h3: (props) => <h3 className="mt-2 text-base font-semibold text-emerald-100" {...props} />,
            p: (props) => <p className="text-sm leading-relaxed text-slate-100" {...props} />,
            strong: (props) => <strong className="font-semibold text-slate-50" {...props} />,
            ul: (props) => <ul className="list-disc pl-5 space-y-1 text-sm text-slate-100" {...props} />,
            ol: (props) => <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-100" {...props} />,
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
          }}
        >
          {summary}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default SummaryCard;
