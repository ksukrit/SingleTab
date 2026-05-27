const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get("blocked") || "";

const message = document.querySelector("#message");
const countedTabs = document.querySelector("#countedTabs");
const maxTabs = document.querySelector("#maxTabs");
const exemptTabs = document.querySelector("#exemptTabs");
const meterFill = document.querySelector("#meterFill");
const tabList = document.querySelector("#tabList");
const allowOnceButton = document.querySelector("#allowOnce");
const intervention = document.querySelector("#intervention");
const interventionText = document.querySelector("#interventionText");
const interventionTimer = document.querySelector("#interventionTimer");
const breathPhase = document.querySelector("#breathPhase");

let interventionState = "idle";
let interventionSeconds = 12;
let interventionStartedAt = 0;
let interventionEndsAt = 0;
let interventionInterval = 0;

document.querySelector("#closeThisTab").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.remove(tab.id);
  }
});

allowOnceButton.addEventListener("click", async () => {
  if (!blockedUrl) {
    return;
  }

  if (interventionState !== "ready") {
    return;
  }

  await chrome.runtime.sendMessage({ type: "allowOnce", url: blockedUrl });
});

document.querySelector("#openOptions").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

render();

async function render() {
  allowOnceButton.hidden = !blockedUrl;
  intervention.hidden = !blockedUrl;
  allowOnceButton.disabled = Boolean(blockedUrl);
  allowOnceButton.textContent = blockedUrl ? "Preparing pause..." : "Allow once";

  if (blockedUrl) {
    const host = safeHost(blockedUrl);
    message.textContent = host
      ? `${host} was paused because your browser is already carrying enough context.`
      : "This tab was paused because your browser is already carrying enough context.";
  }

  const response = await chrome.runtime.sendMessage({ type: "getFocusState" });
  if (!response.ok) {
    tabList.textContent = response.error;
    return;
  }

  const { state } = response;
  const used = state.countedTabs.length;
  const limit = state.settings.maxTabs;
  interventionSeconds = state.settings.interventionSeconds;
  interventionText.textContent = state.settings.interventionText;

  if (blockedUrl && interventionState === "idle") {
    startIntervention();
  }

  countedTabs.textContent = used;
  maxTabs.textContent = limit;
  exemptTabs.textContent = state.exemptTabs.length;
  meterFill.style.width = `${Math.min(100, Math.round((used / limit) * 100))}%`;

  tabList.replaceChildren(...state.countedTabs.map(renderTabRow));
  if (!state.countedTabs.length) {
    tabList.textContent = "No focus tabs are open.";
  }
}

function startIntervention() {
  interventionState = "running";
  interventionStartedAt = Date.now();
  interventionEndsAt = Date.now() + interventionSeconds * 1000;
  allowOnceButton.disabled = true;
  window.clearInterval(interventionInterval);
  intervention.classList.remove("is-ready", "is-exhale");
  intervention.classList.add("is-running", "is-inhale");
  updateIntervention();

  interventionInterval = window.setInterval(updateIntervention, 100);
}

function updateIntervention() {
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.ceil((interventionEndsAt - now) / 1000));
  const elapsedMs = Math.max(0, now - interventionStartedAt);
  const phaseElapsedMs = elapsedMs % 8000;
  const isInhale = phaseElapsedMs < 4000;
  const phase = isInhale ? "Breathe in" : "Breathe out";

  breathPhase.textContent = phase;
  intervention.classList.toggle("is-inhale", isInhale && remainingSeconds > 0);
  intervention.classList.toggle("is-exhale", !isInhale && remainingSeconds > 0);
  allowOnceButton.textContent = remainingSeconds > 0
    ? `Continue in ${remainingSeconds}s`
    : "Continue intentionally";
  interventionTimer.textContent = remainingSeconds > 0
    ? `${remainingSeconds} seconds before this tab can open.`
    : "Pause complete. Choose whether this tab still matters.";

  if (remainingSeconds === 0) {
    window.clearInterval(interventionInterval);
    interventionState = "ready";
    allowOnceButton.disabled = false;
    intervention.classList.remove("is-running", "is-inhale", "is-exhale");
    intervention.classList.add("is-ready");
  }
}

function renderTabRow(tab) {
  const row = document.createElement("article");
  row.className = "tab-row";

  const text = document.createElement("div");
  const title = document.createElement("div");
  const url = document.createElement("div");
  text.className = "tab-text";
  title.className = "tab-title";
  url.className = "tab-url";
  title.textContent = tab.title || "Untitled tab";
  url.textContent = tab.url || "";
  text.append(title, url);

  const close = document.createElement("button");
  close.className = "secondary";
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "closeTab", tabId: tab.id });
    await render();
  });

  row.append(text, close);
  return row;
}

function safeHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}
