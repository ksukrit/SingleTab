const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get("blocked") || "";

const pageTitle = document.querySelector("#pageTitle");
const message = document.querySelector("#message");
const countedTabs = document.querySelector("#countedTabs");
const maxTabs = document.querySelector("#maxTabs");
const exemptTabs = document.querySelector("#exemptTabs");
const focusStats = document.querySelector("#focusStats");
const focusMeter = document.querySelector("#focusMeter");
const meterFill = document.querySelector("#meterFill");
const tabListCard = document.querySelector("#tabListCard");
const tabListIntro = document.querySelector("#tabListIntro");
const tabList = document.querySelector("#tabList");
const allowOnceButton = document.querySelector("#allowOnce");
const intervention = document.querySelector("#intervention");
const interventionText = document.querySelector("#interventionText");
const interventionTimer = document.querySelector("#interventionTimer");
const interventionExtra = document.querySelector("#interventionExtra");
const breathPhase = document.querySelector("#breathPhase");

let interventionState = "idle";
let interventionType = "breathing";
let interventionSeconds = 12;
let interventionStartedAt = 0;
let interventionEndsAt = 0;
let interventionInterval = 0;
let interventionRequirementMet = false;

const typingPhrase = "I choose this tab";

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
  const isBlockedMode = Boolean(blockedUrl);
  allowOnceButton.hidden = !blockedUrl;
  intervention.hidden = !blockedUrl;
  focusStats.hidden = isBlockedMode;
  focusMeter.hidden = isBlockedMode;
  tabListCard.hidden = isBlockedMode;
  allowOnceButton.disabled = Boolean(blockedUrl);
  allowOnceButton.textContent = blockedUrl ? "Preparing pause..." : "Allow once";
  document.querySelector("#closeThisTab").textContent = blockedUrl
    ? "Close this tab"
    : "Close review";

  if (blockedUrl) {
    const host = safeHost(blockedUrl);
    pageTitle.textContent = "Pause for a breath.";
    message.textContent = host
      ? `${host} was paused for a short breath. Continue only if it still matters.`
      : "This tab was paused for a short breath. Continue only if it still matters.";
    tabListIntro.textContent = "Close one thing you do not need right now, then continue with the task at hand.";
  } else {
    pageTitle.textContent = "Review focus tabs.";
    message.textContent = "See what currently counts toward your focus limit without starting an intervention.";
    tabListIntro.textContent = "Review the tabs currently counted by your focus boundary.";
  }

  const response = await chrome.runtime.sendMessage({ type: "getFocusState" });
  if (!response.ok) {
    tabList.textContent = response.error;
    return;
  }

  const { state } = response;
  const used = state.countedTabs.length;
  const limit = state.settings.maxTabs;
  interventionType = state.settings.interventionType;
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
  interventionRequirementMet = interventionType === "breathing";
  interventionStartedAt = Date.now();
  interventionEndsAt = Date.now() + interventionSeconds * 1000;
  allowOnceButton.disabled = true;
  window.clearInterval(interventionInterval);
  intervention.className = `intervention is-running is-${interventionType}`;
  renderInterventionExtra();
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

  breathPhase.textContent = getInterventionPhase(phase);
  intervention.classList.toggle("is-inhale", interventionType === "breathing" && isInhale && remainingSeconds > 0);
  intervention.classList.toggle("is-exhale", interventionType === "breathing" && !isInhale && remainingSeconds > 0);
  allowOnceButton.textContent = remainingSeconds > 0
    ? `Continue in ${remainingSeconds}s`
    : "Continue intentionally";
  interventionTimer.textContent = remainingSeconds > 0
    ? getRunningCopy(remainingSeconds)
    : getReadyCopy();

  if (remainingSeconds === 0) {
    window.clearInterval(interventionInterval);
    interventionState = "ready";
    allowOnceButton.disabled = !interventionRequirementMet;
    intervention.classList.remove("is-running", "is-inhale", "is-exhale");
    intervention.classList.add("is-ready");
  }
}

function renderInterventionExtra() {
  interventionExtra.replaceChildren();

  if (interventionType === "reflection") {
    const label = document.createElement("label");
    label.className = "reflection-field";
    label.textContent = "Reason for opening";

    const input = document.createElement("textarea");
    input.rows = 2;
    input.maxLength = 140;
    input.placeholder = "I need this tab because...";
    input.addEventListener("input", () => {
      interventionRequirementMet = input.value.trim().length >= 3;
      updateContinueState();
    });

    label.append(input);
    interventionExtra.append(label);
  }

  if (interventionType === "typing") {
    const label = document.createElement("label");
    label.className = "typing-field";
    label.textContent = `Type "${typingPhrase}"`;

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      interventionRequirementMet = input.value.trim() === typingPhrase;
      updateContinueState();
    });

    label.append(input);
    interventionExtra.append(label);
  }
}

function updateContinueState() {
  allowOnceButton.disabled = interventionState !== "ready" || !interventionRequirementMet;
  if (interventionState === "ready") {
    interventionTimer.textContent = getReadyCopy();
  }
}

function getInterventionPhase(defaultPhase) {
  if (interventionType === "reflection") {
    return "Why now?";
  }

  if (interventionType === "typing") {
    return "Type it";
  }

  return defaultPhase;
}

function getRunningCopy(remainingSeconds) {
  if (interventionType === "reflection") {
    return `${remainingSeconds} seconds left. Write why this tab matters.`;
  }

  if (interventionType === "typing") {
    return `${remainingSeconds} seconds left. Type the phrase exactly.`;
  }

  return `${remainingSeconds} seconds before this tab can open.`;
}

function getReadyCopy() {
  if (interventionType === "reflection") {
    return interventionRequirementMet
      ? "Reflection complete. Choose whether this tab still matters."
      : "Write a short reason to continue.";
  }

  if (interventionType === "typing") {
    return interventionRequirementMet
      ? "Phrase matched. Choose whether this tab still matters."
      : "Type the phrase exactly to continue.";
  }

  return "Pause complete. Choose whether this tab still matters.";
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
