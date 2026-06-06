import { useCallback, useEffect, useMemo } from "react";
import { useUiStore } from "../stores";
import { usePremiumStore } from "../stores";
import { sanitizeUiText } from "../utils/errorHandler";
import { normalizePremiumProfilePinInput, sanitizePremiumProfilePin } from "../utils/appStateHelpers";

export default function ProfilePinDialog({ onChangePin, onDisablePin }) {
  const {
    showProfilePinDialog,
    setShowProfilePinDialog,
    profilePinInputs,
    setProfilePinInputs,
    profilePinError,
    setProfilePinError,
    theme,
  } = useUiStore();

  const {
    premiumProfiles,
    activePremiumProfileId,
  } = usePremiumStore();

  const activePremiumProfile = useMemo(
    () => premiumProfiles.find((p) => p.id === activePremiumProfileId) || null,
    [premiumProfiles, activePremiumProfileId]
  );

  const safeProfilePinError = useMemo(
    () => sanitizeUiText(profilePinError, "PIN 입력을 다시 확인해주세요."),
    [profilePinError]
  );

  const handleClose = useCallback(() => {
    setShowProfilePinDialog(false);
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
  }, [setShowProfilePinDialog, setProfilePinInputs, setProfilePinError]);

  const handleChangeInput = useCallback((field, value) => {
    const sanitized = String(value || "").replace(/\D/g, "").slice(0, 4);
    setProfilePinInputs((prev) => ({ ...prev, [field]: sanitized }));
    setProfilePinError("");
  }, [setProfilePinInputs, setProfilePinError]);

  const handleDisablePinWithAuth = useCallback(() => {
    if (!activePremiumProfileId) return;
    const currentProfile = premiumProfiles.find((p) => p.id === activePremiumProfileId);
    if (!currentProfile) return;
    const inputPin = normalizePremiumProfilePinInput(profilePinInputs.currentPin);
    if (!inputPin) {
      setProfilePinError("현재 PIN 4자리를 입력해주세요.");
      return;
    }
    if (inputPin !== sanitizePremiumProfilePin(currentProfile.pin)) {
      setProfilePinError("현재 PIN이 올바르지 않습니다.");
      return;
    }
    onDisablePin?.(activePremiumProfileId);
    handleClose();
  }, [activePremiumProfileId, premiumProfiles, profilePinInputs.currentPin, setProfilePinError, onDisablePin, handleClose]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (!activePremiumProfileId) {
      setProfilePinError("선택한 프로필이 없습니다.");
      return;
    }
    const currentProfile = premiumProfiles.find((p) => p.id === activePremiumProfileId);
    if (!currentProfile) {
      setProfilePinError("선택한 프로필을 열 수 없습니다.");
      return;
    }
    const currentPin = normalizePremiumProfilePinInput(profilePinInputs.currentPin);
    const nextPin = normalizePremiumProfilePinInput(profilePinInputs.nextPin);
    const confirmPin = normalizePremiumProfilePinInput(profilePinInputs.confirmPin);

    if (!currentPin || !nextPin || !confirmPin) {
      setProfilePinError("모든 PIN은 4자리 숫자여야 합니다.");
      return;
    }
    if (currentPin !== sanitizePremiumProfilePin(currentProfile.pin)) {
      setProfilePinError("현재 PIN이 올바르지 않습니다.");
      return;
    }
    if (nextPin !== confirmPin) {
      setProfilePinError("새 PIN과 확인 PIN이 올바르지 않습니다.");
      return;
    }
    if (nextPin === currentPin) {
      setProfilePinError("새 PIN은 현재 PIN과 달라야 합니다.");
      return;
    }
    onChangePin?.(activePremiumProfileId, nextPin);
    setShowProfilePinDialog(false);
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
  }, [activePremiumProfileId, premiumProfiles, profilePinInputs, setProfilePinError, setShowProfilePinDialog, setProfilePinInputs, onChangePin]);

  useEffect(() => {
    if (!showProfilePinDialog) return undefined;
    const prevOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, showProfilePinDialog]);

  if (!showProfilePinDialog || !activePremiumProfile) return null;

  return (
    <div className="fixed inset-0 z-[155] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="PIN 변경 창 닫기"
        onClick={handleClose}
        className={`absolute inset-0 ${theme === "light" ? "bg-slate-900/25" : "bg-black/75"} backdrop-blur-[2px]`}
      />
      <form
        onSubmit={handleSubmit}
        className={`relative z-[156] w-full max-w-md rounded-2xl border p-5 ${
          theme === "light"
            ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
            : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
        }`}
      >
        <p className="text-sm font-semibold">{activePremiumProfile.name} PIN 변경</p>
        <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
          현재 PIN을 입력하고 새 4자리 PIN을 설정해주세요.
        </p>
        <div className="mt-4 space-y-2">
          <input
            name="current-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={profilePinInputs.currentPin}
            onChange={(event) => handleChangeInput("currentPin", event.target.value)}
            placeholder="현재 PIN"
            className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
              theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
            }`}
          />
          <input
            name="new-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={profilePinInputs.nextPin}
            onChange={(event) => handleChangeInput("nextPin", event.target.value)}
            placeholder="새 PIN"
            className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
              theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
            }`}
          />
          <input
            name="confirm-new-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={profilePinInputs.confirmPin}
            onChange={(event) => handleChangeInput("confirmPin", event.target.value)}
            placeholder="새 PIN 확인"
            className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
              theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
            }`}
          />
        </div>
        {safeProfilePinError && <p className="mt-2 text-xs text-rose-300">{safeProfilePinError}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDisablePinWithAuth}
            className={`ghost-button text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}
            data-ghost-size="sm"
            style={{ "--ghost-color": "148, 163, 184" }}
            title="현재 PIN 인증 후 이 프로필의 PIN을 해제합니다"
          >
            PIN 없이 사용
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
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
              변경
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
