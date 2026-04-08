import { buildClip, buildOpenUrl, captureTabState, persistClip } from "./shared.js";

const MENU_CAPTURE_SELECTION = "zeusian-capture-selection";
const MENU_CAPTURE_PAGE = "zeusian-capture-page";
const MENU_OPEN_WEBAPP = "zeusian-open-webapp";

async function rebuildContextMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_CAPTURE_SELECTION,
    title: "Save selected text to Zeusian Clip",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: MENU_CAPTURE_PAGE,
    title: "Save current page to Zeusian Clip",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: MENU_OPEN_WEBAPP,
    title: "Open Zeusian.ai",
    contexts: ["action"],
  });
}

async function probeTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: captureTabState,
  });
  return results?.[0]?.result || null;
}

async function saveSelectionFromContext(info, tab) {
  const selectedText = String(info?.selectionText || "").trim();
  if (!selectedText) {
    throw new Error("No selected text was provided by Chrome.");
  }

  const clip = buildClip({
    title: tab?.title || info?.pageUrl || "",
    url: info?.pageUrl || tab?.url || "",
    text: selectedText,
    kind: "selection",
  });

  await persistClip(clip);
  await chrome.tabs.create({ url: buildOpenUrl(true) });
}

async function savePageFromContext(tab) {
  if (!tab?.id) {
    throw new Error("No active tab was available.");
  }

  const snapshot = await probeTab(tab.id);
  const clip = buildClip({
    title: snapshot?.title || tab?.title || tab?.url || "",
    url: snapshot?.url || tab?.url || "",
    text: snapshot?.fallbackText || snapshot?.selection || tab?.title || "",
    kind: snapshot?.selection ? "selection" : "page",
  });

  await persistClip(clip);
  await chrome.tabs.create({ url: buildOpenUrl(true) });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus().catch((error) => {
    console.error("Failed to create Zeusian Clip context menus", error);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  (async () => {
    if (info.menuItemId === MENU_CAPTURE_SELECTION) {
      await saveSelectionFromContext(info, tab);
      return;
    }

    if (info.menuItemId === MENU_CAPTURE_PAGE) {
      await savePageFromContext(tab);
      return;
    }

    if (info.menuItemId === MENU_OPEN_WEBAPP) {
      await chrome.tabs.create({ url: buildOpenUrl(false) });
    }
  })().catch((error) => {
    console.error("Zeusian Clip background action failed", error);
  });
});
