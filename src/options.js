import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeAllowlist,
  saveSettings
} from "./shared/settings.js";

const form = document.querySelector("#settingsForm");
const maxTabs = document.querySelector("#maxTabs");
const ignorePinned = document.querySelector("#ignorePinned");
const allowlist = document.querySelector("#allowlist");
const status = document.querySelector("#status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = await saveSettings({
    maxTabs: maxTabs.value,
    ignorePinned: ignorePinned.checked,
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

getSettings().then(render);

function render(settings) {
  maxTabs.value = settings.maxTabs;
  ignorePinned.checked = settings.ignorePinned;
  allowlist.value = settings.allowlist.join("\n");
}

function linesToEntries(value) {
  return normalizeAllowlist(value.split(/\r?\n/));
}

function flashStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    status.textContent = "";
  }, 2200);
}
