import { useEffect, useState } from "react";

function emptyState() {
  return {
    status: "idle",
    result: null,
    error: "",
  };
}

function EvidencePageLinks({
  requestKey,
  onResolveEvidence,
  onJumpToPage,
  buttonLabel = "근거 페이지 찾기",
  loadingLabel = "근거 페이지 탐색 중...",
  emptyLabel = "근거 후보가 약합니다. 다시 찾아보세요.",
  className = "",
}) {
  const [state, setState] = useState(() => emptyState());

  useEffect(() => {
    setState(emptyState());
  }, [requestKey]);

  const pages = Array.isArray(state.result?.pages) ? state.result.pages : [];
  const snippet = String(state.result?.snippet || "").trim();

  const handleResolve = async () => {
    if (typeof onResolveEvidence !== "function" || state.status === "loading") return;

    setState({
      status: "loading",
      result: null,
      error: "",
    });

    try {
      const resolved = await onResolveEvidence();
      setState({
        status: "loaded",
        result: {
          pages: Array.isArray(resolved?.pages) ? resolved.pages : [],
          snippet: String(resolved?.snippet || "").trim(),
        },
        error: "",
      });
    } catch (error) {
      setState({
        status: "error",
        result: null,
        error: String(error?.message || emptyLabel),
      });
    }
  };

  return (
    <div className={`mt-3 flex flex-col gap-2 ${className}`.trim()}>
      {state.status === "idle" && (
        <button
          type="button"
          onClick={handleResolve}
          className="ghost-button self-start text-[11px] text-slate-200"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          {buttonLabel}
        </button>
      )}

      {state.status === "loading" && <p className="text-[11px] text-slate-400">{loadingLabel}</p>}

      {state.status === "error" && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-200 ring-1 ring-red-400/30">
          {state.error || emptyLabel}
        </p>
      )}

      {state.status === "loaded" && (
        <div className="flex flex-col gap-2">
          {pages.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {pages.map((page) => {
                  const pageNumber = Number.parseInt(page?.pageNumber, 10);
                  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
                  return (
                    <button
                      key={`${requestKey || "evidence"}:${pageNumber}`}
                      type="button"
                      onClick={() =>
                        onJumpToPage?.(
                          pageNumber,
                          String(page?.snippet || snippet || "").trim(),
                          String(page?.label || "").trim()
                        )
                      }
                      className="ghost-button text-[11px] text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      {`p.${pageNumber}`}
                    </button>
                  );
                })}
              </div>
              {snippet && (
                <p className="rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-slate-300 ring-1 ring-white/10">
                  {snippet}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-400">{emptyLabel}</p>
              <button
                type="button"
                onClick={handleResolve}
                className="ghost-button self-start text-[11px] text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                다시 찾기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EvidencePageLinks;
