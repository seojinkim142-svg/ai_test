import { useEffect, useMemo, useRef, useState } from "react";
import { compileExpr, parseGraphSpecJson } from "../utils/graphExpr";

const CURVE_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

function Graph2D({ spec }) {
  const width = 480;
  const height = 300;
  const pad = 28;

  const { paths, xMin, xMax, yMin, yMax } = useMemo(() => {
    const samples = 240;
    const fns = spec.exprs.map((expr) => compileExpr(expr));
    const series = fns.map(() => []);
    let yLo = Infinity;
    let yHi = -Infinity;

    for (let i = 0; i <= samples; i += 1) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / samples;
      fns.forEach((fn, idx) => {
        const y = fn({ x });
        series[idx].push([x, y]);
        if (Number.isFinite(y)) {
          if (y < yLo) yLo = y;
          if (y > yHi) yHi = y;
        }
      });
    }

    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = -1;
      yHi = 1;
    }
    if (yHi - yLo < 1e-6) {
      yLo -= 1;
      yHi += 1;
    }
    const marginY = (yHi - yLo) * 0.1;
    yLo -= marginY;
    yHi += marginY;

    const toPx = (x) => pad + ((x - spec.xMin) / (spec.xMax - spec.xMin)) * (width - pad * 2);
    const toPy = (y) => height - pad - ((y - yLo) / (yHi - yLo)) * (height - pad * 2);

    const builtPaths = series.map((points) => {
      let d = "";
      let drawing = false;
      for (const [x, y] of points) {
        if (!Number.isFinite(y)) {
          drawing = false;
          continue;
        }
        const px = toPx(x);
        const py = toPy(y);
        d += drawing ? ` L ${px.toFixed(2)} ${py.toFixed(2)}` : ` M ${px.toFixed(2)} ${py.toFixed(2)}`;
        drawing = true;
      }
      return d;
    });

    return { paths: builtPaths, xMin: spec.xMin, xMax: spec.xMax, yMin: yLo, yMax: yHi, toPx, toPy };
  }, [spec]);

  const zeroX = paths.toPx ? paths.toPx(0) : null;
  const zeroY = paths.toPy ? paths.toPy(0) : null;

  return (
    <div className="my-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="block">
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        {zeroY != null && zeroY >= pad && zeroY <= height - pad && (
          <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        )}
        {zeroX != null && zeroX >= pad && zeroX <= width - pad && (
          <line x1={zeroX} y1={pad} x2={zeroX} y2={height - pad} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        )}
        <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="rgba(255,255,255,0.12)" />
        {spec.exprs.map((expr, idx) => (
          <path key={expr + idx} d={paths[idx]} fill="none" stroke={CURVE_COLORS[idx % CURVE_COLORS.length]} strokeWidth="2" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {spec.exprs.map((expr, idx) => (
          <span key={expr + idx} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CURVE_COLORS[idx % CURVE_COLORS.length] }} />
            y = {expr}
          </span>
        ))}
      </div>
    </div>
  );
}

function Graph3D({ spec }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = 480;
    const height = 340;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const fn = compileExpr(spec.expr);
    const steps = 22;
    const grid = [];
    let zLo = Infinity;
    let zHi = -Infinity;

    for (let i = 0; i <= steps; i += 1) {
      const row = [];
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / steps;
      for (let j = 0; j <= steps; j += 1) {
        const y = spec.yMin + ((spec.yMax - spec.yMin) * j) / steps;
        const z = fn({ x, y });
        if (Number.isFinite(z)) {
          if (z < zLo) zLo = z;
          if (z > zHi) zHi = z;
        }
        row.push([x, y, z]);
      }
      grid.push(row);
    }
    if (!Number.isFinite(zLo) || !Number.isFinite(zHi)) {
      zLo = -1;
      zHi = 1;
    }
    if (zHi - zLo < 1e-6) {
      zLo -= 1;
      zHi += 1;
    }

    const xSpan = spec.xMax - spec.xMin || 1;
    const ySpan = spec.yMax - spec.yMin || 1;
    const zSpan = zHi - zLo || 1;
    const cosT = Math.cos(Math.PI / 6);
    const sinT = Math.sin(Math.PI / 6);
    const scale = 105;
    const originX = width / 2;
    const originY = height / 2 + 40;

    const project = ([x, y, z]) => {
      const nx = ((x - spec.xMin) / xSpan - 0.5) * 2;
      const ny = ((y - spec.yMin) / ySpan - 0.5) * 2;
      const nz = Number.isFinite(z) ? (((z - zLo) / zSpan) - 0.5) * 2 : 0;
      const sx = (nx - ny) * cosT * scale;
      const sy = (nx + ny) * sinT * scale - nz * scale * 0.85;
      return [originX + sx, originY - sy];
    };

    const colorForZ = (z) => {
      const t = Number.isFinite(z) ? Math.min(1, Math.max(0, (z - zLo) / zSpan)) : 0.5;
      const hue = 160 - t * 140; // emerald -> amber
      return `hsla(${hue}, 75%, 60%, 0.75)`;
    };

    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i += 1) {
      for (let j = 0; j < steps; j += 1) {
        const a = grid[i][j];
        const b = grid[i][j + 1];
        if (!Number.isFinite(a[2]) || !Number.isFinite(b[2])) continue;
        const [ax, ay] = project(a);
        const [bx, by] = project(b);
        ctx.strokeStyle = colorForZ((a[2] + b[2]) / 2);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    for (let j = 0; j <= steps; j += 1) {
      for (let i = 0; i < steps; i += 1) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        if (!Number.isFinite(a[2]) || !Number.isFinite(b[2])) continue;
        const [ax, ay] = project(a);
        const [bx, by] = project(b);
        ctx.strokeStyle = colorForZ((a[2] + b[2]) / 2);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // 원점 기준 축 표시
    const axisColor = "rgba(255,255,255,0.35)";
    ctx.strokeStyle = axisColor;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "11px sans-serif";
    const originPoint = project([Math.max(spec.xMin, 0), Math.max(spec.yMin, 0), zLo]);
    const xAxisEnd = project([spec.xMax, Math.max(spec.yMin, 0), zLo]);
    const yAxisEnd = project([Math.max(spec.xMin, 0), spec.yMax, zLo]);
    ctx.beginPath();
    ctx.moveTo(originPoint[0], originPoint[1]);
    ctx.lineTo(xAxisEnd[0], xAxisEnd[1]);
    ctx.moveTo(originPoint[0], originPoint[1]);
    ctx.lineTo(yAxisEnd[0], yAxisEnd[1]);
    ctx.stroke();
    ctx.fillText("x", xAxisEnd[0] + 4, xAxisEnd[1]);
    ctx.fillText("y", yAxisEnd[0] + 4, yAxisEnd[1]);
  }, [spec]);

  return (
    <div className="my-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3">
      <canvas ref={canvasRef} className="block" />
      <p className="mt-2 text-[11px] text-slate-400">z = {spec.expr}</p>
    </div>
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
  return spec.type === "3d" ? <Graph3D spec={spec} /> : <Graph2D spec={spec} />;
}

export default GraphRenderer;
