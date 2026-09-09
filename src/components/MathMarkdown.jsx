import { useMemo } from "react";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown } from "../utils/mathNormalize";

export const MARKDOWN_MATH_REMARK_PLUGINS = [remarkGfm, remarkMath];
export const MARKDOWN_MATH_REHYPE_PLUGINS = [rehypeKatex];

export { normalizeMathMarkdown };

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
