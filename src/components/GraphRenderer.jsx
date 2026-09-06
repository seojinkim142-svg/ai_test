import { useEffect, useRef, useState } from "react";
import { compileExpr, parseGraphSpecJson } from "../utils/graphExpr";

let plotlyPromise = null;
function loadPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then((mod) => mod.default || mod);
  }
  return plotlyPromise;
}

const CURVE_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

const BASE_LAYOUT = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#cbd5e1", size: 11 },
  margin: { l: 40, r: 20, t: 20, b: 36 },
};

const AXIS_STYLE = {
  gridcolor: "rgba(255,255,255,0.12)",
  zerolinecolor: "rgba(255,255,255,0.25)",
  linecolor: "rgba(255,255,255,0.2)",
  color: "#cbd5e1",
};

function buildGrid(spec) {
  const fn = compileExpr(spec.expr);
  const steps = 45;
  const xs = Array.from({ length: steps + 1 }, (_, i) => spec.xMin + ((spec.xMax - spec.xMin) * i) / steps);
  const ys = Array.from({ length: steps + 1 }, (_, i) => spec.yMin + ((spec.yMax - spec.yMin) * i) / steps);
  const z = ys.map((y) => xs.map((x) => {
    const value = fn({ x, y });
    return Number.isFinite(value) ? value : null;
  }));
  return { xs, ys, z };
}

function GraphPlot({ spec }) {
  const containerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let plottedNode = null;

    loadPlotly()
      .then((Plotly) => {
        if (cancelled || !containerRef.current) return;
        plottedNode = containerRef.current;

        if (spec.type === "3d") {
          const { xs, ys, z } = buildGrid(spec);
          Plotly.newPlot(
            plottedNode,
            [
              {
                type: "surface",
                x: xs,
                y: ys,
                z,
                colorscale: "Viridis",
                showscale: false,
                contours: { z: { show: true, usecolormap: true, project: { z: true } } },
              },
            ],
            {
              ...BASE_LAYOUT,
              scene: {
                xaxis: { title: "x", ...AXIS_STYLE },
                yaxis: { title: "y", ...AXIS_STYLE },
                zaxis: { title: "z", ...AXIS_STYLE },
                bgcolor: "rgba(0,0,0,0)",
              },
              margin: { l: 0, r: 0, t: 10, b: 0 },
            },
            { displayModeBar: false, responsive: true }
          );
        } else {
          const samples = 400;
          const traces = spec.exprs.map((expr, idx) => {
            const fn = compileExpr(expr);
            const x = [];
            const y = [];
            for (let i = 0; i <= samples; i += 1) {
              const xv = spec.xMin + ((spec.xMax - spec.xMin) * i) / samples;
              const yv = fn({ x: xv });
              x.push(xv);
              y.push(Number.isFinite(yv) ? yv : null);
            }
            return {
              type: "scatter",
              mode: "lines",
              x,
              y,
              name: `y = ${expr}`,
              line: { color: CURVE_COLORS[idx % CURVE_COLORS.length], width: 2.5 },
              connectgaps: false,
            };
          });
          Plotly.newPlot(
            plottedNode,
            traces,
            {
              ...BASE_LAYOUT,
              xaxis: { title: "x", ...AXIS_STYLE },
              yaxis: { title: "y", ...AXIS_STYLE },
              showlegend: spec.exprs.length > 1,
              legend: { font: { color: "#cbd5e1", size: 10 }, orientation: "h", y: -0.2 },
            },
            { displayModeBar: false, responsive: true }
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message || "그래프 라이브러리를 불러오지 못했습니다."));
      });

    return () => {
      cancelled = true;
      if (plottedNode) {
        loadPlotly().then((Plotly) => Plotly.purge(plottedNode)).catch(() => {});
      }
    };
  }, [spec]);

  if (error) {
    return <p className="text-[11px] text-red-300">{error}</p>;
  }

  return (
    <div
      ref={containerRef}
      className="h-[320px] w-full"
      style={{ minHeight: 320 }}
    />
  );
}

function GraphError({ raw }) {
  return (
    <div className="my-2 rounded-2xl border border-red-400/20 bg-red-500/5 p-3 text-[11px] text-red-200">
      그래프를 그릴 수 없습니다.
      <pre className="mt-1 whitespace-pre-wrap break-all text-red-300/70">{raw}</pre>
    </div>
  );
}

function GraphRenderer({ raw }) {
  const [spec] = useState(() => parseGraphSpecJson(raw));
  if (!spec) return <GraphError raw={raw} />;

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-3">
      <GraphPlot spec={spec} />
      <p className="mt-1 text-[11px] text-slate-400">
        {spec.type === "3d" ? `z = ${spec.expr}` : spec.exprs.map((e) => `y = ${e}`).join(",  ")}
      </p>
    </div>
  );
}

export default GraphRenderer;
