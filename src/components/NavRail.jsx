import { lazy, useRef, useState, Suspense } from "react";
import { motion } from "framer-motion";
import {
  BookMarked,
  FileText,
  GraduationCap,
  Home,
  ListChecks,
  ListTree,
  LogOut,
  MessagesSquare,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils";
import { getDetailCopy } from "../utils/detailCopy";

const KnowledgeGapPanel = lazy(() => import("./KnowledgeGapPanel"));

const TAB_ICONS = {
  topicStructure: ListTree,
  summary: FileText,
  quiz: ListChecks,
  reviewNotes: NotebookPen,
  mockExam: GraduationCap,
  flashcards: BookMarked,
  vocabQuiz: Sparkles,
  tutor: MessagesSquare,
};

const railVariants = {
  open: { width: "14rem" },
  search: { width: "20rem" },
  closed: { width: "3.25rem" },
};

const labelVariants = {
  open: { opacity: 1, x: 0, transition: { delay: 0.05 } },
  closed: { opacity: 0, x: -8 },
};

const transitionProps = {
  type: "tween",
  ease: "easeOut",
  duration: 0.2,
};

function NavItem({ icon, label, active, onClick, isOpen }) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition",
        active
          ? "bg-emerald-500/15 text-emerald-300"
          : "text-slate-300 hover:text-white"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <motion.span
        variants={labelVariants}
        animate={isOpen ? "open" : "closed"}
        className="truncate"
      >
        {isOpen && label}
      </motion.span>
    </button>
  );
}

export default function NavRail({
  showDetail,
  panelTab,
  onGoHome,
  onSelectPanelTab,
  onOpenSettings,
  isVocabularyFile = false,
  user,
  onSignOut,
  // 자료 검색
  uploadedFiles = [],
  allArtifacts = [],
  onSemanticSearch,
  semanticSearchResults = null,
  isSemanticSearching = false,
  outputLanguage = "ko",
  onSelectFile,
}) {
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem("navRailPinned") === "true"; } catch { return false; }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [gapCollapsed, setGapCollapsed] = useState(() => {
    try { return localStorage.getItem("knowledgeGapCollapsed") === "true"; } catch { return false; }
  });
  const inputRef = useRef(null);

  const isOpen = pinned;

  const togglePinned = () => {
    setPinned((prev) => {
      const next = !prev;
      try { localStorage.setItem("navRailPinned", String(next)); } catch { /* ignore */ }
      return next;
    });
  };

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
    try { localStorage.setItem("knowledgeGapCollapsed", String(next)); } catch { /* ignore */ }
  };

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

  const copy = getDetailCopy(outputLanguage);
  const detailTabs = isVocabularyFile
    ? [
        { id: "flashcards", label: copy.tabs.flashcards },
        { id: "vocabQuiz", label: copy.tabs.vocabQuiz },
      ]
    : [
        { id: "topicStructure", label: copy.tabs.topicStructure },
        { id: "summary", label: copy.tabs.summary },
        { id: "quiz", label: copy.tabs.quiz },
        { id: "reviewNotes", label: copy.tabs.reviewNotes },
        { id: "mockExam", label: copy.tabs.mockExam },
        { id: "flashcards", label: copy.tabs.flashcards },
        { id: "tutor", label: copy.tabs.tutor },
      ];

  const navItems = [
    {
      key: "home",
      label: "홈",
      icon: Home,
      active: false,
      onClick: onGoHome,
    },
    ...detailTabs.map((item) => ({
      key: item.id,
      label: item.label,
      icon: TAB_ICONS[item.id] || FileText,
      active: showDetail && panelTab === item.id,
      onClick: () => onSelectPanelTab?.(item.id),
    })),
  ];

  const emailInitial = (user?.email || "?").charAt(0).toUpperCase();
  const railState = isOpen ? "search" : "closed";

  return (
    <div className="relative z-30 w-[3.25rem] shrink-0">
      <motion.div
        className="absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-white/10 bg-slate-900"
        initial="closed"
        animate={railState}
        variants={railVariants}
        transition={transitionProps}
      >
        <div className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-white/10 px-2.5">
          <img
            src="/apple-touch-icon.png"
            alt=""
            aria-hidden="true"
            decoding="async"
            className="h-7 w-7 shrink-0 rounded-[8px] object-cover"
          />
          <motion.span
            variants={labelVariants}
            animate={isOpen ? "open" : "closed"}
            className="truncate text-sm font-semibold text-white"
          >
            {isOpen && "Zeusian.ai"}
          </motion.span>
        </div>

        <div className={cn("flex shrink-0 pt-2", isOpen ? "justify-end pr-2" : "justify-center")}>
          <button
            type="button"
            onClick={togglePinned}
            title={pinned ? "사이드바 닫기" : "사이드바 열기"}
            className="flex h-7 w-auto min-w-[28px] items-center justify-center rounded-lg bg-slate-800 px-1.5 font-mono text-[10px] font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            {pinned ? "<-" : "->"}
          </button>
        </div>

        <nav className="flex shrink-0 flex-col gap-1 p-2">
          {navItems.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={item.active}
              onClick={item.onClick}
              isOpen={isOpen}
            />
          ))}
        </nav>

        {isOpen && (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-t border-white/10 px-3 pb-4 pt-3">
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-300">
                자료 검색
              </p>
              <form onSubmit={handleSearch}>
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-2 ring-1 ring-transparent transition focus-within:border-emerald-400/60 focus-within:ring-emerald-400/20">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
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

            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-300">
                현황
              </p>
              <Suspense fallback={null}>
                <KnowledgeGapPanel
                  uploadedFiles={uploadedFiles}
                  allArtifacts={allArtifacts}
                  outputLanguage={outputLanguage}
                  collapsed={gapCollapsed}
                  onCollapse={handleGapCollapse}
                  onSelectFile={onSelectFile}
                />
              </Suspense>
            </section>
          </div>
        )}

        {!isOpen && <div className="flex-1" />}

        <div className="flex flex-col gap-1 border-t border-white/10 p-2">
          <NavItem
            icon={Settings}
            label="설정"
            active={false}
            onClick={onOpenSettings}
            isOpen={isOpen}
          />
          {user && (
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-slate-200">
                {emailInitial}
              </div>
              <motion.div
                variants={labelVariants}
                animate={isOpen ? "open" : "closed"}
                className="flex min-w-0 flex-1 items-center justify-between gap-2"
              >
                {isOpen && (
                  <>
                    <span className="truncate text-xs text-slate-300">{user.email}</span>
                    <button
                      type="button"
                      onClick={onSignOut}
                      title="로그아웃"
                      className="shrink-0 text-slate-400 transition hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
