import { useCallback, useEffect, useRef } from "react";
import { savePremiumProfileState, getPremiumProfileStateFromUser } from "../services/supabase";
import {
  DEFAULT_PREMIUM_PROFILE_PIN,
  PREMIUM_PROFILE_PRESETS,
  PREMIUM_PROFILE_LIMIT,
  PREMIUM_SPACE_MODE_PROFILE,
  PREMIUM_SPACE_MODE_SHARED,
  createPremiumProfileId,
  normalizePremiumProfilePinInput,
  normalizePremiumProfiles,
  sanitizePremiumProfileName,
  sanitizePremiumProfilePin,
  getPremiumActiveProfileStorageKey,
  getPremiumProfilesStorageKey,
  getPremiumSpaceModeStorageKey,
} from "../utils/appStateHelpers";
import { usePremiumStore, useUiStore, useDocumentStore } from "../stores";

export function usePremiumProfile({ user, isPremiumTier, activePremiumProfileId, resetActiveDocumentState }) {
  const {
    premiumProfiles, setPremiumProfiles,
    setActivePremiumProfileId,
    premiumSpaceMode, setPremiumSpaceMode,
  } = usePremiumStore();

  const {
    showPremiumProfilePicker, setShowPremiumProfilePicker,
    setShowProfilePinDialog,
    setProfilePinInputs,
    setProfilePinError,
    setSidebarOpen,
  } = useUiStore();

  const { setSelectedFolderId, setSelectedUploadIds, setStatus } = useDocumentStore();

  const premiumProfileHydratedRef = useRef(false);
  const premiumProfileSyncSignatureRef = useRef("");
  const premiumProfileSessionUserIdRef = useRef(null); // tracks which user has authenticated via PIN

  const handleOpenProfilePicker = useCallback(() => {
    if (!user || !isPremiumTier) return;
    setShowPremiumProfilePicker(true);
  }, [isPremiumTier, user]);

  const handleOpenProfilePinDialog = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
    setShowProfilePinDialog(true);
  }, [activePremiumProfileId, isPremiumTier, user]);

  const handleCloseProfilePinDialog = useCallback(() => {
    setShowProfilePinDialog(false);
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
  }, []);

  const handleCloseProfilePicker = useCallback(() => {
    if (!activePremiumProfileId) return;
    setShowPremiumProfilePicker(false);
  }, [activePremiumProfileId]);

  const handleTogglePremiumSpaceMode = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    const nextMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_PROFILE
        : PREMIUM_SPACE_MODE_SHARED;
    resetActiveDocumentState();
    setSelectedFolderId("all");
    setSelectedUploadIds([]);
    setPremiumSpaceMode(nextMode);
      setStatus(
        nextMode === PREMIUM_SPACE_MODE_SHARED
          ? "공유 모드가 활성화됐습니다. 앱 데이터가 프리미엄 공유 공간에 연결됩니다."
          : "개인 모드가 활성화됐습니다. 앱 데이터가 현재 프로필에 연결됩니다."
      );
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode, resetActiveDocumentState, user]);

  const handleSelectPremiumProfile = useCallback(
    (profileId, pinInput, { skipPin = false } = {}) => {
      const selected = premiumProfiles.find((profile) => profile.id === profileId);
      if (!selected) {
        return { ok: false, message: "선택한 프로필을 열 수 없습니다." };
      }
      if (!skipPin && !selected.pinDisabled) {
        const inputPin = normalizePremiumProfilePinInput(pinInput);
        if (!inputPin) {
          return { ok: false, message: "4자리 PIN을 입력해주세요." };
        }
        const expectedPin = sanitizePremiumProfilePin(selected.pin);
        if (inputPin !== expectedPin) {
          return { ok: false, message: "PIN이 올바르지 않습니다." };
        }
      }
      resetActiveDocumentState();
      setSelectedFolderId("all");
      setSelectedUploadIds([]);
      setActivePremiumProfileId(selected.id);
      setShowPremiumProfilePicker(false);
      premiumProfileSessionUserIdRef.current = user?.id ?? null;
      setSidebarOpen(true);
      try { localStorage.setItem("sidebarOpen", "true"); } catch {}
      setStatus(`${selected.name} 프로필이 선택되었습니다.`);
      return { ok: true };
    },
    [premiumProfiles, resetActiveDocumentState, setSidebarOpen, user?.id]
  );

  const handleRenamePremiumProfile = useCallback(
    (profileId, pin, newName) => {
      const profile = premiumProfiles.find((p) => p.id === profileId);
      if (!profile) return { ok: false, message: "프로필을 찾을 수 없습니다." };
      const inputPin = normalizePremiumProfilePinInput(pin);
      if (!inputPin) return { ok: false, message: "4자리 PIN을 입력해주세요." };
      const expectedPin = sanitizePremiumProfilePin(profile.pin);
      if (inputPin !== expectedPin) return { ok: false, message: "PIN이 올바르지 않습니다." };
      const trimmedName = sanitizePremiumProfileName(newName, profile.name);
      setPremiumProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, name: trimmedName } : p))
      );
      setStatus(`프로필 이름이 "${trimmedName}"(으)로 변경되었습니다.`);
      return { ok: true };
    },
    [premiumProfiles]
  );

  const handleChangePremiumProfilePin = useCallback(
    (profileId, currentPin, newPin) => {
      const profile = premiumProfiles.find((p) => p.id === profileId);
      if (!profile) return { ok: false, message: "프로필을 찾을 수 없습니다." };
      const inputPin = normalizePremiumProfilePinInput(currentPin);
      if (!inputPin) return { ok: false, message: "현재 PIN 4자리를 입력해주세요." };
      const expectedPin = sanitizePremiumProfilePin(profile.pin);
      if (inputPin !== expectedPin) return { ok: false, message: "현재 PIN이 올바르지 않습니다." };
      const sanitizedNew = sanitizePremiumProfilePin(newPin);
      if (!sanitizedNew) return { ok: false, message: "새 PIN은 4자리 숫자로 입력해주세요." };
      setPremiumProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, pin: sanitizedNew } : p))
      );
      setStatus("프로필 PIN이 변경됐습니다.");
      return { ok: true };
    },
    [premiumProfiles]
  );

  const handleDisablePremiumProfilePin = useCallback(
    (profileId, currentPin) => {
      const profile = premiumProfiles.find((p) => p.id === profileId);
      if (!profile) return { ok: false, message: "프로필을 찾을 수 없습니다." };
      const inputPin = normalizePremiumProfilePinInput(currentPin);
      if (!inputPin) return { ok: false, message: "현재 PIN 4자리를 입력해주세요." };
      const expectedPin = sanitizePremiumProfilePin(profile.pin);
      if (inputPin !== expectedPin) return { ok: false, message: "PIN이 올바르지 않습니다." };
      setPremiumProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, pinDisabled: true } : p))
      );
      setStatus("PIN 보호가 해제되었습니다.");
      return { ok: true };
    },
    [premiumProfiles]
  );

  const handleCreatePremiumProfile = useCallback(
    (requestedName) => {
      if (!isPremiumTier) return;
      setPremiumProfiles((prev) => {
        if (prev.length >= PREMIUM_PROFILE_LIMIT) return prev;
        const index = prev.length;
        const preset = PREMIUM_PROFILE_PRESETS[index % PREMIUM_PROFILE_PRESETS.length];
        const created = {
          id: createPremiumProfileId(),
          name: sanitizePremiumProfileName(requestedName, `Member ${index + 1}`),
          color: preset.color,
          avatar: preset.avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        };
        return [...prev, created];
      });
    },
    [isPremiumTier]
  );

  useEffect(() => {
    premiumProfileHydratedRef.current = false;
    if (!user?.id || !isPremiumTier) {
      premiumProfileSessionUserIdRef.current = null;
      setPremiumProfiles([]);
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(false);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      premiumProfileSyncSignatureRef.current = "";
      return;
    }
    // If the same user is already authenticated in this session (e.g. metadata update
    // triggered by savePremiumProfileState), skip the profile picker reset.
    if (premiumProfileSessionUserIdRef.current === user.id) {
      premiumProfileHydratedRef.current = true;
      return;
    }
    const remoteState = getPremiumProfileStateFromUser(user);
    const remoteProfiles = normalizePremiumProfiles(remoteState?.profiles);
    const hasRemoteProfiles = remoteProfiles.length > 0;
    const remoteActiveProfileId = String(remoteState?.activeProfileId || "").trim();
    const remoteSpaceModeRaw = String(remoteState?.spaceMode || "").trim();
    const remoteSpaceMode =
      remoteSpaceModeRaw === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : remoteSpaceModeRaw === PREMIUM_SPACE_MODE_PROFILE
          ? PREMIUM_SPACE_MODE_PROFILE
          : "";

    let loadedProfiles = hasRemoteProfiles ? remoteProfiles : [];
    let storedActiveProfileId = "";
    let normalizedSpaceMode = remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE;

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);

      let localProfiles = [];
      try {
        const raw = window.localStorage.getItem(profilesKey);
        localProfiles = normalizePremiumProfiles(raw ? JSON.parse(raw) : []);
      } catch {
        localProfiles = [];
      }
      const shouldPreferLocalProfiles =
        localProfiles.length > loadedProfiles.length &&
        localProfiles.some((localProfile) => !loadedProfiles.some((remote) => remote.id === localProfile.id));

      if ((!loadedProfiles.length && localProfiles.length) || shouldPreferLocalProfiles) {
        loadedProfiles = localProfiles;
      }

      storedActiveProfileId = String(window.localStorage.getItem(activeProfileKey) || "").trim();

      const storedSpaceMode = String(window.localStorage.getItem(spaceModeKey) || "").trim();
      const localSpaceMode =
        storedSpaceMode === PREMIUM_SPACE_MODE_SHARED
          ? PREMIUM_SPACE_MODE_SHARED
          : PREMIUM_SPACE_MODE_PROFILE;
      if (!remoteSpaceMode) {
        normalizedSpaceMode = localSpaceMode;
      }
      if (storedSpaceMode && storedSpaceMode !== localSpaceMode) {
        window.localStorage.removeItem(spaceModeKey);
      }
    }

    if (loadedProfiles.length === 0) {
      const ownerName = sanitizePremiumProfileName(
        user?.user_metadata?.name || user?.email?.split("@")?.[0] || "공유 공간",
        "공유 공간"
      );
      loadedProfiles = [
        {
          id: createPremiumProfileId(),
          name: ownerName,
          color: PREMIUM_PROFILE_PRESETS[0].color,
          avatar: PREMIUM_PROFILE_PRESETS[0].avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        },
      ];
    }

    const preferredActiveProfileId = remoteActiveProfileId || storedActiveProfileId;
    const hasPreferredActiveProfile = loadedProfiles.some(
      (profile) => profile.id === preferredActiveProfileId
    );
    const resolvedActiveProfileId = hasPreferredActiveProfile ? preferredActiveProfileId : "";

    setPremiumProfiles(loadedProfiles);
    setPremiumSpaceMode(normalizedSpaceMode);
    // Always require profile PIN selection on every login.
    setActivePremiumProfileId(null);
    setShowPremiumProfilePicker(true);

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);
      try {
        window.localStorage.setItem(profilesKey, JSON.stringify(loadedProfiles));
        // Never persist active profile — force PIN on every login.
        window.localStorage.removeItem(activeProfileKey);
        window.localStorage.setItem(spaceModeKey, normalizedSpaceMode);
      } catch {
        // Ignore local cache write errors.
      }
    }

    const syncSignature = JSON.stringify({
      profiles: loadedProfiles,
      activeProfileId: null,
      spaceMode: normalizedSpaceMode,
    });
    const remoteResolvedActiveProfileId = remoteProfiles.some(
      (profile) => profile.id === remoteActiveProfileId
    )
      ? remoteActiveProfileId
      : null;
    const remoteSignature = JSON.stringify({
      profiles: remoteProfiles,
      activeProfileId: remoteResolvedActiveProfileId,
      spaceMode: remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE,
    });
    premiumProfileSyncSignatureRef.current = syncSignature === remoteSignature ? syncSignature : "";
    premiumProfileHydratedRef.current = true;
  }, [isPremiumTier, user]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const normalized = normalizePremiumProfiles(premiumProfiles);
    if (!normalized.length) return;
    window.localStorage.setItem(getPremiumProfilesStorageKey(user.id), JSON.stringify(normalized));
  }, [isPremiumTier, premiumProfiles, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumActiveProfileStorageKey(user.id);
    if (activePremiumProfileId) {
      window.localStorage.setItem(key, activePremiumProfileId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [activePremiumProfileId, isPremiumTier, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumSpaceModeStorageKey(user.id);
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    window.localStorage.setItem(key, normalizedMode);
  }, [isPremiumTier, premiumSpaceMode, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || !premiumProfileHydratedRef.current) return;
    const normalizedProfiles = normalizePremiumProfiles(premiumProfiles);
    if (!normalizedProfiles.length) return;
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    const resolvedActiveProfileId = normalizedProfiles.some(
      (profile) => profile.id === activePremiumProfileId
    )
      ? activePremiumProfileId
      : null;
    const syncSignature = JSON.stringify({
      profiles: normalizedProfiles,
      activeProfileId: resolvedActiveProfileId,
      spaceMode: normalizedMode,
    });
    if (syncSignature === premiumProfileSyncSignatureRef.current) return;

    premiumProfileSyncSignatureRef.current = syncSignature;
    let cancelled = false;
    (async () => {
      try {
        await savePremiumProfileState({
          profiles: normalizedProfiles,
          activeProfileId: null, // Never persist active profile — PIN required on every login.
          spaceMode: normalizedMode,
        });
      } catch (err) {
        if (!cancelled) {
          premiumProfileSyncSignatureRef.current = "";
          // eslint-disable-next-line no-console
          console.warn("Failed to sync premium profile state", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activePremiumProfileId,
    isPremiumTier,
    premiumProfiles,
    premiumSpaceMode,
    user?.id,
  ]);

  return {
    handleOpenProfilePicker,
    handleOpenProfilePinDialog,
    handleCloseProfilePinDialog,
    handleCloseProfilePicker,
    handleTogglePremiumSpaceMode,
    handleSelectPremiumProfile,
    handleRenamePremiumProfile,
    handleChangePremiumProfilePin,
    handleDisablePremiumProfilePin,
    handleCreatePremiumProfile,
  };
}
