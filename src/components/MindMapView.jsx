import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

const transformer = new Transformer();

export default function MindMapView({ summary }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!svgRef.current || !summary) return;
    setError(null);
    try {
      const { root } = transformer.transform(summary);
      if (mmRef.current) {
        mmRef.current.setData(root);
        mmRef.current.fit();
      } else {
        mmRef.current = Markmap.create(svgRef.current, {
          color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15"],
          duration: 300,
          maxWidth: 200,
          initialExpandLevel: 3,
        }, root);
      }
    } catch (e) {
      setError(e.message);
    }

    return () => {
      if (mmRef.current && summary === "") {
        mmRef.current = null;
      }
    };
  }, [summary]);

  // summary 바뀌면 기존 인스턴스 파기해서 새로 그리도록
  useEffect(() => {
    return () => {
      mmRef.current = null;
    };
  }, [summary]);

  if (!summary) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        요약을 먼저 생성해 주세요.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-red-400">
        마인드맵 렌더링 실패: {error}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "520px", display: "block" }}
      />
      <p className="absolute bottom-2 right-3 text-[10px] text-slate-500">
        스크롤·드래그로 탐색
      </p>
    </div>
  );
}
