import { compile } from "mathjs";

const MAX_RANGE_SPAN = 1000;

function clampFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRange(min, max, fallbackMin, fallbackMax) {
  let lo = clampFinite(min, fallbackMin);
  let hi = clampFinite(max, fallbackMax);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi - lo < 1e-9) hi = lo + 1;
  if (hi - lo > MAX_RANGE_SPAN) hi = lo + MAX_RANGE_SPAN;
  return [lo, hi];
}

export function parseGraphSpecJson(rawJson) {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const type = data.type === "3d" ? "3d" : "2d";

  if (type === "2d") {
    const exprs = Array.isArray(data.exprs)
      ? data.exprs
      : typeof data.expr === "string"
        ? [data.expr]
        : [];
    const cleanExprs = exprs.map((e) => String(e || "").trim()).filter(Boolean).slice(0, 4);
    if (!cleanExprs.length) return null;
    const [xMin, xMax] = normalizeRange(data.xMin, data.xMax, -10, 10);
    return { type: "2d", exprs: cleanExprs, xMin, xMax };
  }

  const expr = String(data.expr || "").trim();
  if (!expr) return null;
  const [xMin, xMax] = normalizeRange(data.xMin, data.xMax, -5, 5);
  const [yMin, yMax] = normalizeRange(data.yMin, data.yMax, -5, 5);
  return { type: "3d", expr, xMin, xMax, yMin, yMax };
}

export function compileExpr(exprString) {
  const node = compile(String(exprString || ""));
  return (scope) => {
    try {
      const result = node.evaluate(scope);
      const value = typeof result === "object" && result && "re" in result ? NaN : result;
      return Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  };
}
