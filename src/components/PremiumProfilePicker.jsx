import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_PROFILE_AVATAR = "/pngegg.png";
const BACKUP_PROFILE_AVATAR = "/profile-default-character.svg";

const PremiumProfilePicker = memo(function PremiumProfilePicker({
  profiles = [],
  activeProfileId = null,
  maxProfiles = 4,
  canClose = false,
  theme = "dark",
  onSelectProfile,
  onCreateProfile,
  onClose,
}) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [targetProfileId, setTargetProfileId] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);
  const nameInputRef = useRef(null);
  const pinInputRef = useRef(null);
  const isLight = theme === "light";

  const targetProfile = useMemo(
    () => profiles.find((profile) => profile.id === targetProfileId) || null,
    [profiles, targetProfileId]
  );
  const isPinDialogOpen = Boolean(targetProfile);

  const openCreateDialog = useCallback(() => {
    if (profiles.length >= maxProfiles) return;
    setTargetProfileId(null);
    setPinInput("");
    setPinError("");
    setDraftName(`Member ${profiles.length + 1}`);
    setIsCreateDialogOpen(true);
  }, [maxProfiles, profiles.length]);

  const closeCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(false);
  }, []);

  const openPinDialog = useCallback((profileId) => {
    setIsCreateDialogOpen(false);
    setTargetProfileId(profileId);
    setPinInput("");
    setPinError("");
  }, []);

  const closePinDialog = useCallback(() => {
    setTargetProfileId(null);
    setPinInput("");
    setPinError("");
    setIsPinSubmitting(false);
  }, []);

  const handleCreateSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (profiles.length >= maxProfiles) return;
      const fallback = `Member ${profiles.length + 1}`;
      const name = String(draftName || "").trim().slice(0, 16) || fallback;
      onCreateProfile?.(name);
      setIsCreateDialogOpen(false);
    },
    [draftName, maxProfiles, onCreateProfile, profiles.length]
  );

  const handleProfileClick = useCallback(
    (profileId) => {
      if (!profileId) return;
      if (profileId === activeProfileId && canClose) {
        onClose?.();
        return;
      }
      openPinDialog(profileId);
    },
    [activeProfileId, canClose, onClose, openPinDialog]
  );

  const handlePinSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!targetProfileId || isPinSubmitting) return;
      const normalizedPin = String(pinInput || "").trim();
      if (!/^\d{4}$/.test(normalizedPin)) {
        setPinError("PIN은 4자리 숫자로 입력해주세요.");
        return;
      }
      setIsPinSubmitting(true);
      try {
        const result = await onSelectProfile?.(targetProfileId, normalizedPin);
        const isOk = result?.ok ?? result === true;
        if (!isOk) {
          setPinError(result?.message || "PIN이 올바르지 않습니다.");
          return;
        }
        closePinDialog();
      } finally {
        setIsPinSubmitting(false);
      }
    },
    [closePinDialog, isPinSubmitting, onSelectProfile, pinInput, targetProfileId]
  );

  const handleAvatarError = useCallback((event) => {
    const img = event.currentTarget;
    const step = Number(img.dataset.fallbackStep || "0");
    if (step >= 2) return;
    img.dataset.fallbackStep = String(step + 1);
    img.src = step === 0 ? DEFAULT_PROFILE_AVATAR : BACKUP_PROFILE_AVATAR;
  }, []);

  useEffect(() => {
    if (!isCreateDialogOpen) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isCreateDialogOpen]);

  useEffect(() => {
    if (!isPinDialogOpen) return;
    pinInputRef.current?.focus();
    pinInputRef.current?.select();
  }, [isPinDialogOpen]);

  useEffect(() => {
    if (!isCreateDialogOpen && !isPinDialogOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (isPinDialogOpen) {
        closePinDialog();
        return;
      }
      if (isCreateDialogOpen) {
        closeCreateDialog();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeCreateDialog, closePinDialog, isCreateDialogOpen, isPinDialogOpen]);

  const createProfileDialog =
    isCreateDialogOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="프로필 생성 닫기"
              onClick={closeCreateDialog}
              className={`absolute inset-0 ${
                isLight ? "bg-slate-900/[0.22] backdrop-blur-[2px]" : "bg-black/[0.72] backdrop-blur-[1px]"
              }`}
            />
            <form
              onSubmit={handleCreateSubmit}
              className={`relative z-[141] w-full max-w-md rounded-2xl border p-5 ${
                isLight
                  ? "border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                  : "border-white/10 bg-slate-950/[0.96] shadow-[0_20px_80px_rgba(0,0,0,0.65)]"
              }`}
            >
              <p className={`text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                새 프로필 만들기
              </p>
              <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                프로필 이름은 최대 16자까지 입력할 수 있습니다.
              </p>
              <input
                ref={nameInputRef}
                type="text"
                value={draftName}
                maxLength={16}
                onChange={(event) => setDraftName(event.target.value)}
                className={`mt-4 h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateDialog}
                  className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="ghost-button text-xs text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  확인
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  const pinDialog =
    isPinDialogOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="PIN 입력 닫기"
              onClick={closePinDialog}
              className={`absolute inset-0 ${
                isLight ? "bg-slate-900/[0.24] backdrop-blur-[2px]" : "bg-black/[0.74] backdrop-blur-[1px]"
              }`}
            />
            <form
              onSubmit={handlePinSubmit}
              className={`relative z-[151] w-full max-w-md rounded-2xl border p-5 ${
                isLight
                  ? "border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                  : "border-white/10 bg-slate-950/[0.97] shadow-[0_20px_80px_rgba(0,0,0,0.7)]"
              }`}
            >
              <p className={`text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                {targetProfile?.name} 프로필 PIN 입력
              </p>
              <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                초기 PIN은 `0000` 입니다. 로그인 후 본인 PIN으로 변경하세요.
              </p>
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(event) => {
                  const next = String(event.target.value || "").replace(/\D/g, "").slice(0, 4);
                  setPinInput(next);
                  setPinError("");
                }}
                placeholder="4자리 PIN"
                className={`mt-4 h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              {pinError && <p className="mt-2 text-xs text-rose-300">{pinError}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePinDialog}
                  className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isPinSubmitting}
                  className="ghost-button text-xs text-emerald-100 disabled:opacity-60"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  {isPinSubmitting ? "확인 중..." : "확인"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section
        className={`fixed inset-0 z-[95] flex min-h-screen items-center justify-center px-4 py-8 backdrop-blur-sm ${
          isLight ? "bg-white/[0.82]" : "bg-black/[0.86]"
        }`}
      >
        <div
          className={`w-full max-w-3xl rounded-3xl border p-6 sm:p-8 ${
            isLight
              ? "border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.16)]"
              : "border-white/10 bg-slate-950/[0.95] shadow-[0_28px_90px_rgba(0,0,0,0.62)]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className={`text-xs uppercase tracking-[0.28em] ${
                  isLight ? "text-emerald-700/80" : "text-emerald-200/75"
                }`}
              >
                Premium Share
              </p>
              <h2 className={`mt-2 text-2xl font-bold sm:text-3xl ${isLight ? "text-slate-900" : "text-white"}`}>
                프로필을 선택하세요
              </h2>
              <p className={`mt-2 text-sm ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                각 프로필은 PIN으로 보호됩니다. 다른 멤버 프로필은 PIN 없이는 접근할 수 없습니다.
              </p>
            </div>
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                닫기
              </button>
            )}
          </div>

          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {profiles.map((profile) => {
              const isActive = profile.id === activeProfileId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleProfileClick(profile.id)}
                  className={`group flex flex-col items-center rounded-2xl border px-3 py-4 transition hover:-translate-y-0.5 ${
                    isLight
                      ? "border-slate-200 bg-slate-50 hover:border-emerald-400/60 hover:bg-emerald-50"
                      : "border-white/10 bg-white/[0.02] hover:border-emerald-300/50 hover:bg-emerald-400/5"
                  }`}
                >
                  <span
                    className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border shadow-lg transition ${
                      isActive
                        ? "border-emerald-300 ring-2 ring-emerald-300/60"
                        : isLight
                          ? "border-slate-300 group-hover:border-emerald-300/70"
                          : "border-white/20 group-hover:border-emerald-300/60"
                    }`}
                    style={{ background: profile.color }}
                    aria-hidden="true"
                  >
                    <img
                      src={profile.avatar || DEFAULT_PROFILE_AVATAR}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={handleAvatarError}
                    />
                  </span>
                  <span className={`mt-2 text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                    {profile.name}
                  </span>
                  {isActive && (
                    <span className={`mt-1 text-[11px] ${isLight ? "text-emerald-700" : "text-emerald-200"}`}>
                      현재 프로필
                    </span>
                  )}
                </button>
              );
            })}

            {profiles.length < maxProfiles && (
              <button
                type="button"
                onClick={openCreateDialog}
                className={`group flex flex-col items-center rounded-2xl border border-dashed px-3 py-4 transition hover:-translate-y-0.5 ${
                  isLight
                    ? "border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-500/70 hover:text-emerald-700"
                    : "border-white/20 bg-white/[0.02] text-slate-300 hover:border-emerald-300/55 hover:text-emerald-100"
                }`}
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-md border text-3xl ${
                    isLight ? "border-slate-300 bg-white text-slate-700" : "border-white/20 bg-black/30"
                  }`}
                >
                  +
                </span>
                <span className="mt-2 text-sm font-semibold">프로필 추가</span>
              </button>
            )}
          </div>
        </div>
      </section>
      {createProfileDialog}
      {pinDialog}
    </>
  );
});

export default PremiumProfilePicker;
