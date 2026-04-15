import {
  buildClip,
  buildOpenUrl,
  captureTabState,
  formatClipTimestamp,
  getDomainLabel,
  getOutputLanguageLabel,
  getStoredSummaryForSnapshot,
  getValidAuthSession,
  persistClip,
  resolveBrowserOutputLanguage,
  signInWithExtensionEmail,
  signOutExtensionSession,
  summarizeCurrentPage,
} from "./shared.js";

const refs = {
  openZeusian: document.getElementById("open-zeusian"),
  openSignup: document.getElementById("open-signup"),
  signIn: document.getElementById("sign-in"),
  signOut: document.getElementById("sign-out"),
  refreshPage: document.getElementById("refresh-page"),
  summarizePage: document.getElementById("summarize-page"),
  copySummary: document.getElementById("copy-summary"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signedOutView: document.getElementById("signed-out-view"),
  signedInView: document.getElementById("signed-in-view"),
  sessionEmail: document.getElementById("session-email"),
  status: document.getElementById("status"),
  pagePanel: document.getElementById("page-panel"),
  summaryPanel: document.getElementById("summary-panel"),
};

const state = {
  session: null,
  activeTab: null,
  snapshot: null,
  summary: null,
  outputLanguage: resolveBrowserOutputLanguage(),
  loadingPage: false,
  loadingSummary: false,
  signingIn: false,
};

function setStatus(message, isError = false) {
  refs.status.textContent = String(message || "").trim();
  refs.status.classList.toggle("error", Boolean(isError));
}

function setButtonLabel(button, defaultLabel, busyLabel, busy) {
  if (!button) return;
  button.textContent = busy ? busyLabel : defaultLabel;
}

function syncButtonState() {
  const hasSession = Boolean(state.session?.access_token);
  const hasSnapshotText = Boolean(String(state.snapshot?.fallbackText || state.snapshot?.selection || "").trim());
  const hasSummary = Boolean(String(state.summary?.summary || "").trim());

  refs.signIn.disabled = state.signingIn;
  refs.refreshPage.disabled = state.loadingPage;
  refs.summarizePage.disabled = !hasSession || !hasSnapshotText || state.loadingSummary || state.loadingPage;
  refs.copySummary.disabled = !hasSummary;
  refs.signOut.disabled = !hasSession || state.loadingSummary || state.signingIn;

  setButtonLabel(refs.signIn, "Sign in", "Signing in...", state.signingIn);
  setButtonLabel(refs.refreshPage, "Read again", "Reading...", state.loadingPage);
  setButtonLabel(refs.summarizePage, "Summarize again", "Summarizing...", state.loadingSummary);
}

function renderAuth() {
  const hasSession = Boolean(state.session?.access_token);
  refs.signedOutView.hidden = hasSession;
  refs.signedInView.hidden = !hasSession;
  refs.signOut.hidden = !hasSession;
  refs.sessionEmail.textContent = hasSession
    ? state.session?.user?.email || "Signed in"
    : "";
  syncButtonState();
}

function renderPagePanel() {
  const snapshot = state.snapshot;
  if (!snapshot) {
    refs.pagePanel.className = "panel-empty";
    refs.pagePanel.textContent =
      "Open any article, notes page, blog post, or study document tab and Zeusian will read it here.";
    return;
  }

  const wrapper = document.createElement("article");
  wrapper.className = "page-card";

  const meta = document.createElement("div");
  meta.className = "page-meta";

  const domain = document.createElement("span");
  domain.className = "meta-pill";
  domain.textContent = snapshot.domain || getDomainLabel(snapshot.url) || "Page";

  const language = document.createElement("span");
  language.className = "meta-pill";
  language.textContent = `Summary in ${getOutputLanguageLabel(state.outputLanguage)}`;

  const source = document.createElement("span");
  source.className = "meta-pill";
  source.textContent = snapshot.selection ? "Selection first" : "Page body";

  meta.append(domain, language, source);

  const title = document.createElement("h3");
  title.className = "page-title";
  title.textContent = snapshot.title || "Untitled page";

  const excerpt = document.createElement("p");
  excerpt.className = "page-excerpt";
  excerpt.textContent =
    snapshot.excerpt || snapshot.metaDescription || "The active tab was read, but there is not much visible text.";

  wrapper.append(meta, title, excerpt);

  if (snapshot.url) {
    const link = document.createElement("a");
    link.className = "page-url";
    link.href = snapshot.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = snapshot.url;
    wrapper.append(link);
  }

  refs.pagePanel.className = "";
  refs.pagePanel.replaceChildren(wrapper);
}

function renderSummaryPanel() {
  if (!state.session?.access_token) {
    refs.summaryPanel.className = "panel-empty";
    refs.summaryPanel.textContent = "Sign in to let Zeusian summarize the current page automatically.";
    syncButtonState();
    return;
  }

  if (!state.snapshot) {
    refs.summaryPanel.className = "panel-empty";
    refs.summaryPanel.textContent = "The current page has not been read yet.";
    syncButtonState();
    return;
  }

  if (!state.summary?.summary) {
    refs.summaryPanel.className = "panel-empty";
    refs.summaryPanel.textContent = state.loadingSummary
      ? "Generating the summary for the current page..."
      : "Zeusian is ready. Read the page again or run the summary now.";
    syncButtonState();
    return;
  }

  const wrapper = document.createElement("article");
  wrapper.className = "summary-card";

  const meta = document.createElement("div");
  meta.className = "summary-meta";

  const language = document.createElement("span");
  language.className = "meta-pill";
  language.textContent = getOutputLanguageLabel(state.summary.outputLanguage || state.outputLanguage);

  const timestamp = document.createElement("span");
  timestamp.className = "meta-pill";
  timestamp.textContent = formatClipTimestamp(state.summary.createdAt);

  meta.append(language, timestamp);

  const title = document.createElement("h3");
  title.className = "summary-title";
  title.textContent = state.snapshot.title || "Current page summary";

  const body = document.createElement("div");
  body.className = "summary-body";
  body.textContent = state.summary.summary;

  wrapper.append(meta, title, body);

  refs.summaryPanel.className = "";
  refs.summaryPanel.replaceChildren(wrapper);
  syncButtonState();
}

function buildSnapshotClip(snapshot) {
  const clipText = snapshot?.selection || snapshot?.fallbackText || "";
  if (!String(clipText).trim()) return null;

  return buildClip({
    title: snapshot?.title || state.activeTab?.title || snapshot?.url || "",
    url: snapshot?.url || state.activeTab?.url || "",
    text: clipText,
    kind: snapshot?.selection ? "selection" : "page",
  });
}

async function persistSnapshotClip() {
  const clip = buildSnapshotClip(state.snapshot);
  if (!clip) return null;
  await persistClip(clip);
  return clip;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs?.[0] || null;
  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }
  return tab;
}

function isBlockedTabUrl(url) {
  return /^(chrome|edge|about|chrome-extension|chrome-search|view-source):/i.test(String(url || "").trim());
}

async function inspectActiveTab() {
  const tab = await getActiveTab();
  if (isBlockedTabUrl(tab.url)) {
    throw new Error("Chrome internal pages cannot be read by the extension.");
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: captureTabState,
  });

  const snapshot = results?.[0]?.result || null;
  if (!snapshot) {
    throw new Error("The extension could not read the current tab.");
  }

  return {
    tab,
    snapshot: {
      ...snapshot,
      title: snapshot.title || tab.title || tab.url || "Untitled page",
      url: snapshot.url || tab.url || "",
      domain: snapshot.domain || getDomainLabel(snapshot.url || tab.url || ""),
    },
  };
}

async function ensureSummary({ force = false, initialLoad = false } = {}) {
  if (!state.session?.access_token) {
    renderSummaryPanel();
    return;
  }

  if (!state.snapshot) {
    throw new Error("Read the current page before generating a summary.");
  }

  if (!force) {
    const cachedSummary =
      state.summary ||
      (await getStoredSummaryForSnapshot(state.snapshot, state.outputLanguage));

    if (cachedSummary) {
      state.summary = cachedSummary;
      renderSummaryPanel();
      if (initialLoad) {
        setStatus("Loaded the saved summary for this page.");
      }
      return;
    }
  }

  state.loadingSummary = true;
  renderSummaryPanel();
  setStatus("Generating an AI summary for the current page...");

  try {
    const summary = await summarizeCurrentPage(state.snapshot, {
      session: state.session,
      outputLanguage: state.outputLanguage,
    });
    state.summary = summary;
    await persistSnapshotClip();
    renderSummaryPanel();
    setStatus("AI summary is ready.");
  } finally {
    state.loadingSummary = false;
    renderSummaryPanel();
  }
}

async function refreshPageSnapshot({ forceSummary = false, silent = false } = {}) {
  state.loadingPage = true;
  syncButtonState();
  if (!silent) {
    setStatus("Reading the current page...");
  }

  try {
    const { tab, snapshot } = await inspectActiveTab();
    state.activeTab = tab;
    state.snapshot = snapshot;

    const cachedSummary = state.session?.access_token
      ? await getStoredSummaryForSnapshot(snapshot, state.outputLanguage)
      : null;
    state.summary = cachedSummary;

    renderPagePanel();
    renderSummaryPanel();

    if (state.session?.access_token) {
      await ensureSummary({ force: forceSummary, initialLoad: !forceSummary });
    } else if (!silent) {
      setStatus("Sign in to let Zeusian summarize the current page automatically.");
    }
  } finally {
    state.loadingPage = false;
    syncButtonState();
  }
}

async function handleSignIn() {
  const email = refs.email.value;
  const password = refs.password.value;

  state.signingIn = true;
  syncButtonState();
  setStatus("Signing in...");

  try {
    state.session = await signInWithExtensionEmail(email, password);
    refs.password.value = "";
    renderAuth();
    setStatus("Signed in. Preparing the current page summary...");
    if (state.snapshot) {
      await ensureSummary({ force: false, initialLoad: true });
    } else {
      await refreshPageSnapshot({ forceSummary: false, silent: true });
    }
  } finally {
    state.signingIn = false;
    syncButtonState();
  }
}

async function handleSignOut() {
  await signOutExtensionSession();
  state.session = null;
  state.summary = null;
  renderAuth();
  renderSummaryPanel();
  setStatus("Signed out.");
}

async function handleCopySummary() {
  const summary = String(state.summary?.summary || "").trim();
  if (!summary) {
    throw new Error("There is no summary to copy yet.");
  }

  await navigator.clipboard.writeText(summary);
  setStatus("Summary copied to the clipboard.");
}

async function handleOpenZeusian() {
  const clip = await persistSnapshotClip().catch(() => null);
  await chrome.tabs.create({ url: buildOpenUrl(Boolean(clip?.text)) });
  setStatus("Opened Zeusian.ai.");
}

async function handleOpenSignup() {
  await chrome.tabs.create({ url: buildOpenUrl(false) });
  setStatus("Opened the Zeusian sign-in page.");
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error("Zeusian extension popup action failed", error);
    setStatus(error?.message || "The extension action failed.", true);
  } finally {
    syncButtonState();
  }
}

refs.signIn.addEventListener("click", () => run(handleSignIn));
refs.signOut.addEventListener("click", () => run(handleSignOut));
refs.openZeusian.addEventListener("click", () => run(handleOpenZeusian));
refs.openSignup.addEventListener("click", () => run(handleOpenSignup));
refs.refreshPage.addEventListener("click", () => run(() => refreshPageSnapshot({ forceSummary: false, silent: false })));
refs.summarizePage.addEventListener("click", () => run(() => ensureSummary({ force: true, initialLoad: false })));
refs.copySummary.addEventListener("click", () => run(handleCopySummary));
refs.password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run(handleSignIn);
  }
});

(async () => {
  renderAuth();
  renderPagePanel();
  renderSummaryPanel();
  setStatus("Loading the active tab...");

  state.session = await getValidAuthSession();
  renderAuth();
  await refreshPageSnapshot({ forceSummary: false, silent: true });

  if (!state.session?.access_token) {
    setStatus("Sign in to let Zeusian summarize the current page automatically.");
  }
})().catch((error) => {
  console.error("Zeusian extension popup failed to initialize", error);
  setStatus(error?.message || "Failed to initialize the extension popup.", true);
});
