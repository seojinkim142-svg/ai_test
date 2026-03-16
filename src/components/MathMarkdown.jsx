import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax/svg";

const LATEX_ENV_BLOCK_RE = /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g;
const BARE_LATEX_INLINE_RE =
  /(^|[\s(])((?:\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim|alpha|beta|gamma|delta|theta|lambda|mu|nu|pi|sigma|omega)[^,\n)]{0,260}))/g;
const BRACKETED_DISPLAY_MATH_RE = /\\\[\s*([\s\S]*?)\s*\\\]/g;
const BRACKETED_INLINE_MATH_RE = /\\\(\s*([\s\S]*?)\s*\\\)/g;

export const MARKDOWN_MATH_REMARK_PLUGINS = [remarkGfm, remarkMath];
export const MARKDOWN_MATH_REHYPE_PLUGINS = [rehypeMathjax];

function normalizeLatexSnippet(expr) {
  return String(expr || "")
    .replace(/\\big\\\(/g, "\\big(")
    .replace(/\\big\\\)/g, "\\big)")
    .replace(/\\Big\\\(/g, "\\Big(")
    .replace(/\\Big\\\)/g, "\\Big)")
    .replace(/\\left\\\(/g, "\\left(")
    .replace(/\\right\\\)/g, "\\right)")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function autoFixBrokenDisplayMathLine(line) {
  let working = String(line || "");
  if (!working) return working;

  // Recover common LLM output: "... \\dfrac{...}, & ... , \\end{cases}$$"
  if (working.includes("\\end{cases}") && !working.includes("\\begin{cases}")) {
    const endIndex = working.indexOf("\\end{cases}");
    const beforeEnd = working.slice(0, endIndex);
    const colonIndex = beforeEnd.lastIndexOf(":");
    const latexIndex = beforeEnd.search(/\\[A-Za-z]+|[A-Za-z]\s*=/);
    const insertAt = colonIndex >= 0 ? colonIndex + 1 : latexIndex >= 0 ? latexIndex : 0;
    if (insertAt >= 0 && insertAt <= beforeEnd.length) {
      working = `${working.slice(0, insertAt)} \\begin{cases} ${working.slice(insertAt)}`;
    }
  }

  // Recover orphan trailing $$ by wrapping the nearby formula region.
  const displayTokens = working.match(/\$\$/g) || [];
  if (displayTokens.length % 2 === 1) {
    const closeIndex = working.lastIndexOf("$$");
    if (closeIndex > 0) {
      const beforeClose = working.slice(0, closeIndex);
      const colonIndex = beforeClose.lastIndexOf(":");
      const latexIndex = beforeClose.search(/\\[A-Za-z]+|[A-Za-z]\s*=/);
      const start = colonIndex >= 0 ? colonIndex + 1 : latexIndex >= 0 ? latexIndex : 0;
      const body = beforeClose.slice(start).trim();
      if (body) {
        working = `${working.slice(0, start)} $$${body}$$${working.slice(closeIndex + 2)}`;
      }
    }
  }

  return working.replace(/\s{2,}/g, " ").trimEnd();
}

function normalizeBracketMathDelimiters(text) {
  return String(text || "")
    .replace(BRACKETED_DISPLAY_MATH_RE, (full, expr) => {
      const normalized = normalizeLatexSnippet(expr);
      if (!normalized) return full;
      return `$$${normalized}$$`;
    })
    .replace(BRACKETED_INLINE_MATH_RE, (full, expr) => {
      const normalized = normalizeLatexSnippet(expr);
      if (!normalized) return full;
      return `$${normalized}$`;
    });
}

export function normalizeMathMarkdown(rawText) {
  const source = normalizeBracketMathDelimiters(String(rawText || "").replace(/\r\n/g, "\n")).trim();
  if (!source) return "";

  const placeholders = [];
  const toPlaceholder = (value) => {
    const token = `@@MATH_${placeholders.length}@@`;
    placeholders.push(value);
    return token;
  };

  let prepared = source.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (match) => toPlaceholder(match));
  prepared = prepared.replace(LATEX_ENV_BLOCK_RE, (match) => {
    const normalized = normalizeLatexSnippet(match);
    if (!normalized) return match;
    return toPlaceholder(`$$${normalized}$$`);
  });

  const lines = prepared.split("\n");
  let inCodeFence = false;
  const normalized = lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence || line.includes("`")) return line;

      const working = autoFixBrokenDisplayMathLine(String(line || "").replace(/\\\$/g, "$"));
      return working.replace(BARE_LATEX_INLINE_RE, (full, prefix, expr) => {
        const candidate = normalizeLatexSnippet(expr);
        if (!candidate) return full;
        return `${prefix}$${candidate}$`;
      });
    })
    .join("\n");

  return normalized.replace(/@@MATH_(\d+)@@/g, (full, idx) => placeholders[Number(idx)] || full);
}

function MathMarkdown({ content, className = "", components }) {
  const normalized = useMemo(() => normalizeMathMarkdown(content), [content]);
  const defaultComponents = useMemo(
    () => ({
      p: ({ children }) => <p className="my-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
      li: ({ children }) => <li className="my-0.5">{children}</li>,
    }),
    []
  );
  if (!normalized) return null;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_MATH_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_MATH_REHYPE_PLUGINS}
        components={components || defaultComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

export default MathMarkdown;
