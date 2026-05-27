import {
  DEFAULT_SETTINGS,
  getSettings,
  getScheduleState,
  normalizeAllowlist,
  saveSettings
} from "./shared/settings.js";

const form = document.querySelector("#settingsForm");
const maxTabs = document.querySelector("#maxTabs");
const ignorePinned = document.querySelector("#ignorePinned");
const scheduleEnabled = document.querySelector("#scheduleEnabled");
const scheduleStart = document.querySelector("#scheduleStart");
const scheduleEnd = document.querySelector("#scheduleEnd");
const scheduleStatus = document.querySelector("#scheduleStatus");
const scheduleControls = document.querySelector("#scheduleControls");
const scheduleDays = [...document.querySelectorAll("[name='scheduleDays']")];
const interventionSeconds = document.querySelector("#interventionSeconds");
const interventionText = document.querySelector("#interventionText");
const interventionTypes = [...document.querySelectorAll("[name='interventionType']")];
const interventionOptions = [...document.querySelectorAll("[data-intervention-option]")];
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
    scheduleEnabled: scheduleEnabled.checked,
    scheduleStart: scheduleStart.value,
    scheduleEnd: scheduleEnd.value,
    scheduleDays: getSelectedScheduleDays(),
    interventionType: getSelectedInterventionType(),
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

scheduleEnabled.addEventListener("change", () => {
  renderScheduleControls();
});

scheduleStart.addEventListener("change", renderScheduleStatus);
scheduleEnd.addEventListener("change", renderScheduleStatus);
scheduleDays.forEach((checkbox) => {
  checkbox.addEventListener("change", renderScheduleStatus);
});
interventionTypes.forEach((radio) => {
  radio.addEventListener("change", renderInterventionOptions);
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
  scheduleEnabled.checked = settings.scheduleEnabled;
  scheduleStart.value = settings.scheduleStart;
  scheduleEnd.value = settings.scheduleEnd;
  scheduleDays.forEach((checkbox) => {
    checkbox.checked = settings.scheduleDays.includes(Number.parseInt(checkbox.value, 10));
  });
  interventionTypes.forEach((radio) => {
    radio.checked = radio.value === settings.interventionType;
  });
  interventionSeconds.value = settings.interventionSeconds;
  interventionText.value = settings.interventionText;
  allowlist.value = settings.allowlist.join("\n");
  renderScheduleControls();
  renderScheduleStatus();
  renderInterventionOptions();
}

function linesToEntries(value) {
  return normalizeAllowlist(value.split(/\r?\n/));
}

function getSelectedScheduleDays() {
  return scheduleDays
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number.parseInt(checkbox.value, 10));
}

function getSelectedInterventionType() {
  return interventionTypes.find((radio) => radio.checked)?.value || DEFAULT_SETTINGS.interventionType;
}

function renderScheduleControls() {
  scheduleControls.classList.toggle("is-disabled", !scheduleEnabled.checked);
  scheduleControls.querySelectorAll("input").forEach((input) => {
    input.disabled = !scheduleEnabled.checked;
  });
  renderScheduleStatus();
}

function renderScheduleStatus() {
  if (!scheduleEnabled.checked) {
    scheduleStatus.textContent = "Enforcement is always active.";
    return;
  }

  const state = getScheduleState({
    ...DEFAULT_SETTINGS,
    scheduleEnabled: true,
    scheduleStart: scheduleStart.value || DEFAULT_SETTINGS.scheduleStart,
    scheduleEnd: scheduleEnd.value || DEFAULT_SETTINGS.scheduleEnd,
    scheduleDays: getSelectedScheduleDays()
  });
  scheduleStatus.textContent = state.isActive
    ? `Enforcement is active now, ${state.summary}.`
    : `Enforcement is off now. Next window starts ${state.nextLabel || "on the next selected day"}.`;
}

function renderInterventionOptions() {
  const selected = getSelectedInterventionType();
  interventionOptions.forEach((option) => {
    option.classList.toggle(
      "is-selected",
      option.dataset.interventionOption === selected
    );
  });
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
