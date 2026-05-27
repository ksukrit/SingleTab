import {
  getAllowlistEntryForUrl,
  getFocusPageUrl,
  getSettings,
  saveSettings,
  urlMatchesAllowlist
} from "./shared/settings.js";

const summary = document.querySelector("#summary");
const detail = document.querySelector("#detail");
const countedTabs = document.querySelector("#countedTabs");
const focusTabsStat = document.querySelector("#focusTabsStat");
const focusRatio = document.querySelector("#focusRatio");
const focusState = document.querySelector("#focusState");
const maxTabs = document.querySelector("#maxTabs");
const exemptTabs = document.querySelector("#exemptTabs");
const meterFill = document.querySelector("#meterFill");
const status = document.querySelector("#status");
const allowCurrentSite = document.querySelector("#allowCurrentSite");

document.querySelector("#reviewTabs").addEventListener("click", async () => {
  await chrome.tabs.create({ url: getFocusPageUrl() });
  window.close();
});

document.querySelector("#openOptions").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});

allowCurrentSite.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const entry = getAllowlistEntryForUrl(tab?.url || "");

  if (!entry) {
    flashStatus("This page cannot be allowlisted.");
    return;
  }

  const settings = await getSettings();
  if (urlMatchesAllowlist(tab.url, settings.allowlist)) {
    flashStatus(`${entry} is already allowed.`);
    return;
  }

  await saveSettings({
    ...settings,
    allowlist: [...settings.allowlist, entry]
  });

  flashStatus(`${entry} is now allowed.`);
  await render();
});

render();

async function render() {
  const response = await chrome.runtime.sendMessage({ type: "getFocusState" });
  if (!response.ok) {
    summary.textContent = "Could not read tabs";
    detail.textContent = response.error;
    return;
  }

  const { state } = response;
  const used = state.countedTabs.length;
  const limit = state.settings.maxTabs;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const isPaused = state.focusPause?.isPaused;
  const isOutsideSchedule = state.enforcement?.reason === "outside_schedule";

  summary.textContent = isPaused
    ? "Focus is disabled"
    : isOutsideSchedule
    ? "Outside focus hours"
    : used <= limit
    ? "Focused and contained"
    : "A little overloaded";
  detail.textContent = isPaused
    ? `Tab limit enforcement resumes at ${formatTime(state.focusPause.pausedUntil)}.`
    : isOutsideSchedule
    ? getScheduleDetail(state.enforcement.schedule)
    : used <= limit
    ? "Pinned and allowed sites stay outside your focus tabs."
    : "Close or exempt a tab to reduce context switching.";
  countedTabs.textContent = used;
  focusTabsStat.textContent = used;
  focusRatio.textContent = `${used} of ${limit} focus tabs`;
  focusState.textContent = isPaused
    ? "Paused"
    : isOutsideSchedule
    ? "Scheduled"
    : used <= limit
    ? "On track"
    : `${used - limit} over`;
  focusState.classList.toggle("is-over", !isPaused && !isOutsideSchedule && used > limit);
  maxTabs.textContent = limit;
  exemptTabs.textContent = state.exemptTabs.length;
  meterFill.style.width = `${percent}%`;
  meterFill.classList.toggle("is-over", !isPaused && !isOutsideSchedule && used > limit);
}

function getScheduleDetail(schedule) {
  return schedule?.nextLabel
    ? `Enforcement starts ${schedule.nextLabel}.`
    : "Scheduled enforcement is off right now.";
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
  }, 2400);
}
