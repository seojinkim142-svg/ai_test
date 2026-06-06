import { useCallback, useState } from "react";

/**
 * FlashcardList
 * 플래시카드 목록 표시 UI: 개별 카드 표시, 편집/삭제
 * Props:
 *   cards, filteredCards, isLoading, isGenerating, onDelete, onUpdate
 */
function FlashcardList({ cards, filteredCards, isLoading, isGenerating, onDelete, onUpdate }) {
  const [editingCardId, setEditingCardId] = useState(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editHint, setEditHint] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const startEdit = useCallback((card) => {
    setEditingCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditHint(card.hint || "");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editFront.trim() || !editBack.trim() || !onUpdate) return;
    setIsSavingEdit(true);
    try {
      await onUpdate(editingCardId, editFront.trim(), editBack.trim(), editHint.trim());
      setEditingCardId(null);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingCardId, editFront, editBack, editHint, onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditingCardId(null);
  }, []);

  return (
    <div className="mt-4 space-y-2">
      {isLoading && <p className="text-sm text-slate-300">불러오는 중...</p>}
      {!isLoading && cards.length === 0 && (
        <p className="text-sm text-slate-400">저장된 카드가 없습니다.</p>
      )}
      {!isLoading && cards.length > 0 && filteredCards.length === 0 && (
        <p className="text-sm text-slate-400">선택한 카테고리에 카드가 없습니다.</p>
      )}
      {!isLoading &&
        filteredCards.map((card) => {
          const isEditing = editingCardId === card.id;
          return (
            <div
              key={card.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 shadow-inner shadow-black/20"
            >
              {isEditing ? (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <textarea
                      value={editFront}
                      onChange={(e) => setEditFront(e.target.value)}
                      className="min-h-[70px] rounded-xl border border-emerald-300/40 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                      placeholder="앞면"
                    />
                    <textarea
                      value={editBack}
                      onChange={(e) => setEditBack(e.target.value)}
                      className="min-h-[70px] rounded-xl border border-emerald-300/40 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                      placeholder="뒷면"
                    />
                  </div>
                  <input
                    type="text"
                    value={editHint}
                    onChange={(e) => setEditHint(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                    placeholder="힌트/예문 (선택)"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={isSavingEdit}
                      className="ghost-button text-xs text-slate-300"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "148, 163, 184" }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editFront.trim() || !editBack.trim() || isSavingEdit}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      {isSavingEdit ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-emerald-200">앞면</p>
                    {card.category && (
                      <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300 border border-violet-400/30 shrink-0">
                        {card.category}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-semibold text-white">{card.front}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.15em] text-cyan-200">뒷면</p>
                  <p className="mt-1 text-slate-100">{card.back}</p>
                  {card.hint && (
                    <p className="mt-2 text-xs text-slate-300">
                      힌트: <span className="text-slate-100">{card.hint}</span>
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    {onUpdate && (
                      <button
                        type="button"
                        onClick={() => startEdit(card)}
                        className="ghost-button text-xs text-slate-200"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "226, 232, 240" }}
                      >
                        편집
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(card.id)}
                      className="ghost-button text-xs text-slate-200"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "226, 232, 240" }}
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}

export default FlashcardList;
