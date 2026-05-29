import { useRef, useState } from "react";
import KnowledgeGapPanel from "./KnowledgeGapPanel";

export default function LeftSidebar({
  isOpen,
  onToggle,
  uploadedFiles = [],
  allArtifacts = [],
  onSemanticSearch,
  semanticSearchResults = null,
  isSemanticSearching = false,
  outputLanguage = "ko",
  onSelectFile,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [gapCollapsed, setGapCollapsed] = useState(() => {
    try { return localStorage.getItem("knowledgeGapCollapsed") === "true"; } catch { return false; }
  });
  const inputRef = useRef(null);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) onSemanticSearch?.(q);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onSemanticSearch?.("");
    inputRef.current?.focus();
  };

  const handleQueryChange = (e) => {
    setSearchQuery(e.target.value);
    if (semanticSearchResults) onSemanticSearch?.("");
  };

  const handleGapCollapse = (next) => {
    setGapCollapsed(next);
    try { localStorage.setItem("knowledgeGapCollapsed", String(next)); } catch {}
  };

  // 파일명 로컬 매칭 — useMemo 없이 직접 계산
  const q = searchQuery.trim().toLowerCase();
  const filenameMatches = q
    ? uploadedFiles.filter((f) => String(f.name ?? "").toLowerCase().includes(q))
    : [];

  const semanticOnlyResults = Array.isArray(semanticSearchResults)
    ? (() => {
        const ids = new Set(filenameMatches.map((f) => String(f.id)));
        return semanticSearchResults.filter((r) => !ids.has(String(r.id)));
      })()
    : [];

  const showNoResults =
    q &&
    Array.isArray(semanticSearchResults) &&
    !isSemanticSearching &&
    filenameMatches.length === 0 &&
    semanticOnlyResults.length === 0;

  return (
    <div
      className={`relative flex shrink-0 flex-col border-r border-white/10 bg-slate-900 transition-all duration-300 ${
        isOpen ? "w-56" : "w-10"
      }`}
    >
      {/* 토글 버튼 */}
      <div className={`flex pt-3 ${isOpen ? "justify-end pr-2" : "justify-center"}`}>
        <button
          type="button"
          onClick={onToggle}
          title={isOpen ? "사이드바 닫기" : "사이드바 열기"}
          className="flex h-7 w-auto min-w-[28px] items-center justify-center rounded-lg bg-slate-800 px-1.5 font-mono text-[10px] font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          {isOpen ? "|<-" : "->|"}
        </button>
      </div>

      {isOpen && (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6 pt-4">
          {/* 내용 검색 */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-300">
              자료 검색
            </p>
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-2 ring-1 ring-transparent transition focus-within:border-emerald-400/60 focus-within:ring-emerald-400/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleQueryChange}
                  placeholder={`파일 검색... (${uploadedFiles.length}개)`}
                  className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                />
                {searchQuery && (
                  <button type="button" onClick={handleClearSearch} className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300" aria-label="지우기">
                    ✕
                  </button>
                )}
              </div>
              {searchQuery.trim() && (
                <button
                  type="submit"
                  disabled={isSemanticSearching}
                  className="ghost-button mt-2 w-full text-xs text-emerald-300"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  {isSemanticSearching ? "검색 중..." : "AI 내용 검색"}
                </button>
              )}
            </form>

            {/* 파일명 매칭 결과 */}
            {filenameMatches.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="mb-1 text-[10px] text-slate-500">파일명 ({filenameMatches.length})</p>
                {filenameMatches.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onSelectFile?.(f)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-left transition hover:border-emerald-400/40 hover:bg-slate-700"
                  >
                    <p className="truncate text-[11px] font-semibold text-slate-100">{f.name}</p>
                  </button>
                ))}
              </div>
            )}

            {/* AI 시맨틱 결과 */}
            {semanticOnlyResults.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="mb-1 text-[10px] text-slate-500">내용 관련 ({semanticOnlyResults.length})</p>
                {semanticOnlyResults.map((result) => {
                  const fileItem = uploadedFiles.find((f) => String(f.id) === String(result.id));
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => fileItem && onSelectFile?.(fileItem)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-left transition hover:border-emerald-400/40 hover:bg-slate-700"
                    >
                      <p className="truncate text-[11px] font-semibold text-slate-100">
                        {result.name || fileItem?.name || result.id}
                      </p>
                      {result.snippet && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-400">{result.snippet}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {showNoResults && (
              <p className="mt-2 rounded-lg bg-slate-800 px-3 py-2 text-[11px] text-slate-400">
                결과 없음
              </p>
            )}
          </section>

          <div className="h-px w-full bg-slate-700/60" />

          {/* 현황 */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-300">
              현황
            </p>
            <KnowledgeGapPanel
              uploadedFiles={uploadedFiles}
              allArtifacts={allArtifacts}
              outputLanguage={outputLanguage}
              collapsed={gapCollapsed}
              onCollapse={handleGapCollapse}
              onSelectFile={onSelectFile}
            />
          </section>
        </div>
      )}
    </div>
  );
}
