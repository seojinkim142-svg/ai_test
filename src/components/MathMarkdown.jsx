import { useMemo } from "react";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const LATEX_ENV_BLOCK_RE = /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g;
const BARE_LATEX_INLINE_RE =
  /(^|[\s(])((?:\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim|alpha|beta|gamma|delta|theta|lambda|mu|nu|pi|sigma|omega)[^,\n)]{0,260}))/g;
const BRACKETED_DISPLAY_MATH_RE = /\\\[\s*([\s\S]*?)\s*\\\]/g;
const BRACKETED_INLINE_MATH_RE = /\\\(\s*([\s\S]*?)\s*\\\)/g;
const PLAIN_SQRT_RE = /(?<!\\)\bsqrt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

export const MARKDOWN_MATH_REMARK_PLUGINS = [remarkGfm, remarkMath];
export const MARKDOWN_MATH_REHYPE_PLUGINS = [rehypeKatex];

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

function normalizePlainSqrt(text) {
  return String(text || "").replace(PLAIN_SQRT_RE, (full, expr) => `$\\sqrt{${expr}}$`);
}

export function normalizeMathMarkdown(rawText) {
  const bracketNormalized = normalizeBracketMathDelimiters(String(rawText || "").replace(/\r\n/g, "\n"));
  // 모델이 "$$$$식$$"처럼 여는 구분자를 $$를 두 번 겹쳐 쓰는 경우가 잦다. 그러면
  // 앞의 "$$$$"가 자기들끼리 빈 짝으로 먼저 매칭되고, 뒤의 실제 식은 닫는 $$를
  // 잃어버려 렌더링되지 않는다. 3개 이상 연속된 $는 항상 오타이므로 $$ 두 개로
  // 정리해 애초에 잘못 짝지어질 여지를 없앤다.
  const source = bracketNormalized.replace(/\${3,}/g, "$$$$").trim();
  if (!source) return "";

  const placeholders = [];
  const toPlaceholder = (value) => {
    const token = `@@MATH_${placeholders.length}@@`;
    placeholders.push(value);
    return token;
  };

  // 모델이 \begin{aligned}...\end{aligned} 같은 블록 안에서 줄마다 각각 $$로
  // 감싸는 경우가 있다(예: "\begin{aligned}$$ ... $$&=... $$ ... $$\end{aligned}").
  // 이런 상태에서 아래의 일반 $$...$$ 추출 정규식을 그대로 돌리면 서로 다른 줄의
  // $$끼리 잘못 짝지어져 렌더링이 통째로 깨진다. 그 전에 환경 블록 전체(및 바로
  // 붙어있는 $ 기호)를 찾아 내부의 $ 기호를 모두 지우고 하나의 $$...$$ 블록으로
  // 합쳐서 플레이스홀더로 박아둔다.
  let prepared = source.replace(
    /\$*\s*(\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\2\})\s*\$*/g,
    (full, envBlock) => {
      if (!envBlock.includes("$")) return full;
      // 안전장치: \begin/\end 짝이 실제로는 안 맞는데(사이에 다른 \end가 없거나
      // 모델이 \begin을 잘못 반복한 경우) 정규식이 훨씬 뒤의 \end까지 통째로
      // 삼켜버릴 수 있다. 그러면 그 사이에 있던 마크다운 제목/굵게/인용문까지
      // 전부 수식 취급돼 화면이 완전히 깨진다. 정말 하나의 수식 블록이라고 보기
      // 힘든 특징(너무 길거나, 빈 줄로 문단이 나뉘거나, 마크다운 구문이 섞임)이
      // 보이면 손대지 않고 그대로 둔다.
      const looksLikeRunawayMatch =
        envBlock.length > 700 ||
        /\n[ \t]*\n/.test(envBlock) ||
        /^#{1,6}\s/m.test(envBlock) ||
        /\*\*[^*]/.test(envBlock) ||
        /^>\s/m.test(envBlock);
      if (looksLikeRunawayMatch) return full;
      const cleaned = envBlock.replace(/\${1,2}/g, " ").replace(/\s{2,}/g, " ").trim();
      const normalizedEnv = normalizeLatexSnippet(cleaned);
      if (!normalizedEnv) return full;
      return toPlaceholder(`$$${normalizedEnv}$$`);
    }
  );

  prepared = prepared.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (match) => toPlaceholder(match));
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

      const working = autoFixBrokenDisplayMathLine(normalizePlainSqrt(String(line || "")).replace(/\\\$/g, "$"));
      return working.replace(BARE_LATEX_INLINE_RE, (full, prefix, expr) => {
        const candidate = normalizeLatexSnippet(expr);
        if (!candidate) return full;
        return `${prefix}$${candidate}$`;
      });
    })
    .join("\n");

  // 플레이스홀더 값 안에 또 다른 플레이스홀더가 들어있을 수 있어(예: \begin{aligned}
  // 블록이 이미 치환된 여러 개의 $$...$$ 조각을 통째로 감쌀 때) 한 번만 치환하면
  // 안쪽 토큰이 "@@MATH_N@@" 문자 그대로 남는다. 더 이상 바뀌지 않을 때까지 반복한다.
  let result = normalized;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = result.replace(/@@MATH_(\d+)@@/g, (full, idx) => placeholders[Number(idx)] ?? full);
    if (next === result) break;
    result = next;
  }
  return result;
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
