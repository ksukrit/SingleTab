import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeAllowlist,
  saveSettings
} from "./shared/settings.js";

const form = document.querySelector("#settingsForm");
const maxTabs = document.querySelector("#maxTabs");
const ignorePinned = document.querySelector("#ignorePinned");
const interventionSeconds = document.querySelector("#interventionSeconds");
const interventionText = document.querySelector("#interventionText");
const allowlist = document.querySelector("#allowlist");
const status = document.querySelector("#status");
const pauseStatus = document.querySelector("#pauseStatus");
const pauseFocus = document.querySelector("#pauseFocus");
const resumeFocus = document.querySelector("#resumeFocus");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = await saveSettings({
    maxTabs: maxTabs.value,
    ignorePinned: ignorePinned.checked,
    interventionSeconds: interventionSeconds.value,
    interventionText: interventionText.value,
    allowlist: linesToEntries(allowlist.value)
  });

  render(settings);
  flashStatus("Settings saved.");
});

document.querySelector("#resetDefaults").addEventListener("click", async () => {
  const settings = await saveSettings(DEFAULT_SETTINGS);
  render(settings);
  flashStatus("Defaults restored.");
});

pauseFocus.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "pauseFocus" });
  if (!response.ok) {
    flashStatus(response.error || "Could not disable focus.");
    return;
  }

  renderPause(response.state.focusPause);
  flashStatus("Disabled for 15 minutes.");
});

resumeFocus.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "resumeFocus" });
  if (!response.ok) {
    flashStatus(response.error || "Could not resume focus.");
    return;
  }

  renderPause(response.state.focusPause);
  flashStatus("Focus enforcement resumed.");
});

load();

async function load() {
  const [settings, response] = await Promise.all([
    getSettings(),
    chrome.runtime.sendMessage({ type: "getFocusState" })
  ]);

  render(settings);
  if (response.ok) {
    renderPause(response.state.focusPause);
  }
}

function render(settings) {
  maxTabs.value = settings.maxTabs;
  ignorePinned.checked = settings.ignorePinned;
  interventionSeconds.value = settings.interventionSeconds;
  interventionText.value = settings.interventionText;
  allowlist.value = settings.allowlist.join("\n");
}

function linesToEntries(value) {
  return normalizeAllowlist(value.split(/\r?\n/));
}

function renderPause(focusPause) {
  const isPaused = Boolean(focusPause?.isPaused);
  pauseFocus.hidden = isPaused;
  resumeFocus.hidden = !isPaused;
  pauseStatus.textContent = isPaused
    ? `Tab limit enforcement is disabled until ${formatTime(focusPause.pausedUntil)}.`
    : "Tab limit enforcement is active.";
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function flashStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    status.textContent = "";
  }, 2200);
}
