import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_PROFILE_AVATAR = "/pngegg.png";
const BACKUP_PROFILE_AVATAR = "/profile-default-character.svg";

const PremiumProfilePicker = memo(function PremiumProfilePicker({
  profiles = [],
  activeProfileId = null,
  maxProfiles = 4,
  canClose = false,
  theme = "light",
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onChangePin,
  onDisablePin,
  onClose,
}) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [targetProfileId, setTargetProfileId] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);

  // unified profile settings dialog state
  const [settingsTargetId, setSettingsTargetId] = useState(null);
  const [settingsCurrentPin, setSettingsCurrentPin] = useState("");
  const [settingsNewName, setSettingsNewName] = useState("");
  const [settingsNewPin, setSettingsNewPin] = useState("");
  const [settingsConfirmPin, setSettingsConfirmPin] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSubmitting, setSettingsSubmitting] = useState(null); // "rename"|"pin"|"disable"|null
  const [settingsDisableConfirm, setSettingsDisableConfirm] = useState(false);

  const nameInputRef = useRef(null);
  const pinInputRef = useRef(null);
  const settingsNameInputRef = useRef(null);
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
      const profile = profiles.find((p) => p.id === profileId);
      if (profile?.pinDisabled) {
        onSelectProfile?.(profileId, null, { skipPin: true });
        return;
      }
      openPinDialog(profileId);
    },
    [activeProfileId, canClose, onClose, onSelectProfile, openPinDialog, profiles]
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

  const openSettingsDialog = useCallback(
    (profileId, event) => {
      event.stopPropagation();
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) return;
      setSettingsTargetId(profileId);
      setSettingsCurrentPin("");
      setSettingsNewName(profile.name);
      setSettingsNewPin("");
      setSettingsConfirmPin("");
      setSettingsError("");
      setSettingsSubmitting(null);
      setSettingsDisableConfirm(false);
    },
    [profiles]
  );

  const closeSettingsDialog = useCallback(() => {
    setSettingsTargetId(null);
    setSettingsCurrentPin("");
    setSettingsNewName("");
    setSettingsNewPin("");
    setSettingsConfirmPin("");
    setSettingsError("");
    setSettingsSubmitting(null);
    setSettingsDisableConfirm(false);
  }, []);

  const handleSettingsRename = useCallback(
    async (event) => {
      event.preventDefault();
      if (!settingsTargetId || settingsSubmitting) return;
      const trimmedName = settingsNewName.trim().slice(0, 16);
      if (!trimmedName) { setSettingsError("이름을 입력해주세요."); return; }
      if (!/^\d{4}$/.test(settingsCurrentPin)) { setSettingsError("현재 PIN 4자리를 입력해주세요."); return; }
      setSettingsSubmitting("rename");
      try {
        const result = await onRenameProfile?.(settingsTargetId, settingsCurrentPin, trimmedName);
        const isOk = result?.ok ?? result === true;
        if (!isOk) { setSettingsError(result?.message || "PIN이 올바르지 않습니다."); return; }
        closeSettingsDialog();
      } finally {
        setSettingsSubmitting(null);
      }
    },
    [closeSettingsDialog, onRenameProfile, settingsCurrentPin, settingsNewName, settingsSubmitting, settingsTargetId]
  );

  const handleSettingsPinChange = useCallback(
    async (event) => {
      event.preventDefault();
      if (!settingsTargetId || settingsSubmitting) return;
      if (!/^\d{4}$/.test(settingsCurrentPin)) { setSettingsError("현재 PIN 4자리를 입력해주세요."); return; }
      if (!/^\d{4}$/.test(settingsNewPin)) { setSettingsError("새 PIN은 4자리 숫자로 입력해주세요."); return; }
      if (settingsNewPin !== settingsConfirmPin) { setSettingsError("새 PIN과 확인 PIN이 일치하지 않습니다."); return; }
      setSettingsSubmitting("pin");
      try {
        const result = await onChangePin?.(settingsTargetId, settingsCurrentPin, settingsNewPin);
        const isOk = result?.ok ?? result === true;
        if (!isOk) { setSettingsError(result?.message || "PIN이 올바르지 않습니다."); return; }
        closeSettingsDialog();
      } finally {
        setSettingsSubmitting(null);
      }
    },
    [closeSettingsDialog, onChangePin, settingsConfirmPin, settingsCurrentPin, settingsNewPin, settingsSubmitting, settingsTargetId]
  );

  const handleSettingsDisablePin = useCallback(
    async () => {
      if (!settingsTargetId || settingsSubmitting) return;
      if (!settingsDisableConfirm) { setSettingsDisableConfirm(true); return; }
      if (!/^\d{4}$/.test(settingsCurrentPin)) { setSettingsError("현재 PIN 4자리를 입력해주세요."); return; }
      setSettingsSubmitting("disable");
      try {
        const result = await onDisablePin?.(settingsTargetId, settingsCurrentPin);
        const isOk = result?.ok ?? result === true;
        if (!isOk) { setSettingsError(result?.message || "PIN이 올바르지 않습니다."); return; }
        closeSettingsDialog();
      } finally {
        setSettingsSubmitting(null);
      }
    },
    [closeSettingsDialog, onDisablePin, settingsCurrentPin, settingsDisableConfirm, settingsSubmitting, settingsTargetId]
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

  const isSettingsDialogOpen = Boolean(settingsTargetId);
  const settingsTargetProfile = useMemo(
    () => profiles.find((p) => p.id === settingsTargetId) || null,
    [profiles, settingsTargetId]
  );

  useEffect(() => {
    if (!isSettingsDialogOpen) return;
    settingsNameInputRef.current?.focus();
    settingsNameInputRef.current?.select();
  }, [isSettingsDialogOpen]);

  useEffect(() => {
    if (!isCreateDialogOpen && !isPinDialogOpen && !isSettingsDialogOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (isSettingsDialogOpen) {
        closeSettingsDialog();
        return;
      }
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
  }, [closeCreateDialog, closePinDialog, closeSettingsDialog, isCreateDialogOpen, isPinDialogOpen, isSettingsDialogOpen]);

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
                name="premium-profile-name"
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
                name="premium-profile-pin"
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

  const settingsDialog =
    isSettingsDialogOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="프로필 설정 닫기"
              onClick={closeSettingsDialog}
              className={`absolute inset-0 ${
                isLight ? "bg-slate-900/[0.24] backdrop-blur-[2px]" : "bg-black/[0.74] backdrop-blur-[1px]"
              }`}
            />
            <div
              className={`relative z-[161] w-full max-w-md rounded-2xl border p-5 ${
                isLight
                  ? "border-slate-200 bg-white shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                  : "border-white/10 bg-slate-950/[0.97] shadow-[0_20px_80px_rgba(0,0,0,0.7)]"
              }`}
            >
              <p className={`text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                프로필 설정
              </p>
              <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                "{settingsTargetProfile?.name}" 프로필
              </p>

              {/* Shared current PIN */}
              <div className="mt-4">
                <label className={`mb-1 block text-xs font-medium ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  현재 PIN
                </label>
                <input
                  name="settings-current-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={settingsCurrentPin}
                  onChange={(e) => {
                    setSettingsCurrentPin(String(e.target.value || "").replace(/\D/g, "").slice(0, 4));
                    setSettingsError("");
                    setSettingsDisableConfirm(false);
                  }}
                  placeholder="4자리 PIN"
                  className={`h-10 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                  }`}
                />
              </div>

              <hr className={`my-4 ${isLight ? "border-slate-200" : "border-white/10"}`} />

              {/* Rename section */}
              <form onSubmit={handleSettingsRename}>
                <p className={`mb-2 text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>이름 변경</p>
                <input
                  ref={settingsNameInputRef}
                  name="settings-new-name"
                  type="text"
                  value={settingsNewName}
                  maxLength={16}
                  onChange={(e) => { setSettingsNewName(e.target.value); setSettingsError(""); }}
                  placeholder="새 이름 (최대 16자)"
                  className={`h-10 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                    isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                  }`}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={settingsSubmitting === "rename"}
                    className="ghost-button text-xs text-emerald-100 disabled:opacity-60"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    {settingsSubmitting === "rename" ? "변경 중..." : "이름 변경"}
                  </button>
                </div>
              </form>

              <hr className={`my-4 ${isLight ? "border-slate-200" : "border-white/10"}`} />

              {/* PIN change section */}
              <form onSubmit={handleSettingsPinChange}>
                <p className={`mb-2 text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>PIN 변경</p>
                <div className="flex flex-col gap-2">
                  <input
                    name="settings-new-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={settingsNewPin}
                    onChange={(e) => { setSettingsNewPin(String(e.target.value || "").replace(/\D/g, "").slice(0, 4)); setSettingsError(""); }}
                    placeholder="새 PIN 4자리"
                    className={`h-10 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                      isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                    }`}
                  />
                  <input
                    name="settings-confirm-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={settingsConfirmPin}
                    onChange={(e) => { setSettingsConfirmPin(String(e.target.value || "").replace(/\D/g, "").slice(0, 4)); setSettingsError(""); }}
                    placeholder="새 PIN 확인"
                    className={`h-10 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                      isLight ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                    }`}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={settingsSubmitting === "pin"}
                    className="ghost-button text-xs text-sky-200 disabled:opacity-60"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "125, 211, 252" }}
                  >
                    {settingsSubmitting === "pin" ? "변경 중..." : "PIN 변경"}
                  </button>
                </div>
              </form>

              <hr className={`my-4 ${isLight ? "border-slate-200" : "border-white/10"}`} />

              {/* Disable PIN section */}
              <div>
                <p className={`mb-1 text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>PIN 없이 사용</p>
                <p className={`mb-2 text-[11px] ${isLight ? "text-slate-500" : "text-slate-500"}`}>
                  {settingsDisableConfirm
                    ? "정말로 이 프로필의 PIN 보호를 해제하시겠습니까?"
                    : "이 프로필을 PIN 없이 바로 접근할 수 있게 합니다."}
                </p>
                <button
                  type="button"
                  onClick={handleSettingsDisablePin}
                  disabled={settingsSubmitting === "disable"}
                  className={`ghost-button text-xs disabled:opacity-60 ${
                    settingsDisableConfirm ? "text-rose-300" : isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                  data-ghost-size="sm"
                  style={{ "--ghost-color": settingsDisableConfirm ? "252, 165, 165" : "148, 163, 184" }}
                >
                  {settingsSubmitting === "disable"
                    ? "처리 중..."
                    : settingsDisableConfirm
                      ? "PIN 해제 확인"
                      : "PIN 없이 사용"}
                </button>
              </div>

              {settingsError && <p className="mt-3 text-xs text-rose-300">{settingsError}</p>}

              <div className={`mt-4 flex justify-end border-t pt-3 ${isLight ? "border-slate-200" : "border-white/10"}`}>
                <button
                  type="button"
                  onClick={closeSettingsDialog}
                  className={`ghost-button text-xs ${isLight ? "text-slate-700" : "text-slate-200"}`}
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  닫기
                </button>
              </div>
            </div>
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
              <h2 className={`text-2xl font-bold sm:text-3xl ${isLight ? "text-slate-900" : "text-white"}`}>
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
                <div key={profile.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => handleProfileClick(profile.id)}
                    className={`flex w-full flex-col items-center rounded-2xl border px-3 py-4 transition hover:-translate-y-0.5 ${
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
                  <button
                    type="button"
                    aria-label={`${profile.name} 프로필 설정`}
                    onClick={(e) => openSettingsDialog(profile.id, e)}
                    className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border opacity-0 transition group-hover:opacity-100 ${
                      isLight
                        ? "border-slate-300 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
                        : "border-white/20 bg-slate-800 text-slate-400 hover:border-emerald-300/60 hover:text-emerald-300"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.79 2.02a.75.75 0 0 0 .966.966l2.02-.79a2.75 2.75 0 0 0 .892-.596l4.262-4.263a1.75 1.75 0 0 0 0-2.475ZM2.75 8.75a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5h-4Zm-1 3.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5H1.75Z" />
                    </svg>
                  </button>
                </div>
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
      {settingsDialog}
    </>
  );
});

export default PremiumProfilePicker;
