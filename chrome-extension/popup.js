import {
  buildClipboardPayload,
  buildClip,
  buildOpenUrl,
  captureTabState,
  clearStoredClips,
  formatClipTimestamp,
  loadStoredClips,
  persistClip,
} from "./shared.js";

const refs = {
  captureSelection: document.getElementById("capture-selection"),
  capturePage: document.getElementById("capture-page"),
  copyCurrent: document.getElementById("copy-current"),
  openZeusian: document.getElementById("open-zeusian"),
  clearHistory: document.getElementById("clear-history"),
  status: document.getElementById("status"),
  currentClip: document.getElementById("current-clip"),
  historyList: document.getElementById("history-list"),
};

let currentClip = null;
let historyItems = [];

function setStatus(message, isError = false) {
  refs.status.textContent = String(message || "").trim();
  refs.status.classList.toggle("error", Boolean(isError));
}

function truncate(value, maxLength = 240) {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function renderCurrentClip() {
  if (!currentClip?.text) {
    refs.currentClip.className = "clip-empty";
    refs.currentClip.textContent = "선택 텍스트를 가져오면 여기에 미리보기가 표시됩니다.";
    return;
  }

  const article = document.createElement("article");
  article.className = "clip-card";

  const meta = document.createElement("div");
  meta.className = "clip-meta";

  const domain = document.createElement("span");
  domain.className = "clip-domain";
  domain.textContent = currentClip.domain || "Captured page";

  const timestamp = document.createElement("span");
  timestamp.textContent = formatClipTimestamp(currentClip.createdAt);

  const kind = document.createElement("span");
  kind.textContent = currentClip.kind === "page" ? "page snapshot" : "selection";

  meta.append(domain, timestamp, kind);

  const title = document.createElement("h3");
  title.className = "clip-title";
  title.textContent = currentClip.title || "Untitled page";

  const text = document.createElement("p");
  text.className = "clip-text";
  text.textContent = truncate(currentClip.text, 560);

  article.append(meta, title, text);

  if (currentClip.url) {
    const link = document.createElement("a");
    link.className = "clip-link";
    link.href = currentClip.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = currentClip.url;
    article.append(link);
  }

  refs.currentClip.className = "";
  refs.currentClip.replaceChildren(article);
}

function renderHistory() {
  if (!historyItems.length) {
    refs.historyList.className = "history-empty";
    refs.historyList.textContent = "아직 저장된 클립이 없습니다.";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "history-list";

  historyItems.forEach((clip) => {
    const item = document.createElement("article");
    item.className = "history-item";

    const title = document.createElement("h3");
    title.textContent = clip.title || "Untitled page";

    const meta = document.createElement("p");
    meta.textContent = `${formatClipTimestamp(clip.createdAt)} · ${clip.domain || "captured page"}`;

    const excerpt = document.createElement("p");
    excerpt.textContent = truncate(clip.text, 180);

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.textContent = "미리보기";
    previewButton.dataset.action = "preview";
    previewButton.dataset.id = clip.id;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "복사";
    copyButton.dataset.action = "copy";
    copyButton.dataset.id = clip.id;

    actions.append(previewButton, copyButton);
    item.append(title, meta, excerpt, actions);
    wrapper.append(item);
  });

  refs.historyList.className = "";
  refs.historyList.replaceChildren(wrapper);
}

async function refreshStoredState() {
  const { history, lastClip } = await loadStoredClips();
  historyItems = history;
  currentClip = lastClip || history[0] || null;
  renderCurrentClip();
  renderHistory();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs?.[0] || null;
  if (!tab?.id) {
    throw new Error("활성 탭을 찾을 수 없습니다.");
  }
  return tab;
}

async function inspectActiveTab() {
  const tab = await getActiveTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: captureTabState,
  });

  return {
    tab,
    snapshot: results?.[0]?.result || null,
  };
}

async function captureSelection() {
  setStatus("선택 텍스트를 읽는 중입니다.");

  const { tab, snapshot } = await inspectActiveTab();
  const selectedText = String(snapshot?.selection || "").trim();
  if (!selectedText) {
    throw new Error("먼저 웹페이지에서 텍스트를 선택한 뒤 다시 시도하세요.");
  }

  await persistClip(
    buildClip({
      title: snapshot?.title || tab?.title || tab?.url || "",
      url: snapshot?.url || tab?.url || "",
      text: selectedText,
      kind: "selection",
    })
  );

  await refreshStoredState();
  setStatus("선택 텍스트를 저장했습니다.");
}

async function capturePage() {
  setStatus("현재 페이지 내용을 정리하는 중입니다.");

  const { tab, snapshot } = await inspectActiveTab();
  const pageText = String(snapshot?.fallbackText || snapshot?.selection || "").trim();
  if (!pageText) {
    throw new Error("이 페이지에서는 읽을 수 있는 텍스트를 찾지 못했습니다.");
  }

  await persistClip(
    buildClip({
      title: snapshot?.title || tab?.title || tab?.url || "",
      url: snapshot?.url || tab?.url || "",
      text: pageText,
      kind: snapshot?.selection ? "selection" : "page",
    })
  );

  await refreshStoredState();
  setStatus("현재 페이지를 저장했습니다.");
}

async function copyClip(clip = currentClip) {
  if (!clip?.text) {
    throw new Error("복사할 클립이 없습니다.");
  }

  await navigator.clipboard.writeText(buildClipboardPayload(clip));
  currentClip = clip;
  renderCurrentClip();
  setStatus("클립을 클립보드에 복사했습니다.");
}

async function openZeusian() {
  await chrome.tabs.create({ url: buildOpenUrl(Boolean(currentClip?.text)) });
  setStatus("Zeusian.ai 탭을 열었습니다.");
}

async function handleHistoryClick(event) {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) return;

  const clip = historyItems.find((item) => item.id === button.dataset.id);
  if (!clip) return;

  if (button.dataset.action === "preview") {
    currentClip = clip;
    renderCurrentClip();
    setStatus("히스토리 클립을 불러왔습니다.");
    return;
  }

  if (button.dataset.action === "copy") {
    await copyClip(clip);
  }
}

async function clearHistory() {
  await clearStoredClips();
  historyItems = [];
  currentClip = null;
  renderCurrentClip();
  renderHistory();
  setStatus("저장된 클립을 모두 비웠습니다.");
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error("Zeusian Clip popup action failed", error);
    setStatus(error?.message || "작업에 실패했습니다.", true);
  }
}

refs.captureSelection.addEventListener("click", () => run(captureSelection));
refs.capturePage.addEventListener("click", () => run(capturePage));
refs.copyCurrent.addEventListener("click", () => run(() => copyClip(currentClip)));
refs.openZeusian.addEventListener("click", () => run(openZeusian));
refs.clearHistory.addEventListener("click", () => run(clearHistory));
refs.historyList.addEventListener("click", (event) => run(() => handleHistoryClick(event)));

refreshStoredState()
  .then(() => {
    setStatus("현재 탭에서 텍스트를 가져오거나 Zeusian.ai를 열 수 있습니다.");
  })
  .catch((error) => {
    console.error("Zeusian Clip initial load failed", error);
    setStatus("확장 프로그램 상태를 불러오지 못했습니다.", true);
  });
