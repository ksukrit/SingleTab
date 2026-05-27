export const DEFAULT_SETTINGS = {
  maxTabs: 3,
  ignorePinned: true,
  scheduleEnabled: false,
  scheduleStart: "09:00",
  scheduleEnd: "17:00",
  scheduleDays: [1, 2, 3, 4, 5],
  interventionType: "breathing",
  interventionSeconds: 12,
  interventionText: "Take one breath. Stop doom scrolling and ask: is this tab helping the thing you meant to do?",
  allowlist: []
};

export const INTERVENTION_TYPES = ["breathing", "reflection", "typing"];
export const WEEK_DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

export const FOCUS_PAGE = "src/focus.html";

export function getFocusPageUrl(blockedUrl = "") {
  const url = new URL(chrome.runtime.getURL(FOCUS_PAGE));
  if (blockedUrl) {
    url.searchParams.set("blocked", blockedUrl);
  }
  return url.toString();
}

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return normalizeSettings(stored);
}

export async function saveSettings(nextSettings) {
  const settings = normalizeSettings(nextSettings);
  await chrome.storage.sync.set(settings);
  return settings;
}

export function normalizeSettings(settings) {
  return {
    maxTabs: clampInteger(settings.maxTabs, 1, 20, DEFAULT_SETTINGS.maxTabs),
    ignorePinned: settings.ignorePinned !== false,
    scheduleEnabled: settings.scheduleEnabled === true,
    scheduleStart: normalizeTime(settings.scheduleStart, DEFAULT_SETTINGS.scheduleStart),
    scheduleEnd: normalizeTime(settings.scheduleEnd, DEFAULT_SETTINGS.scheduleEnd),
    scheduleDays: normalizeScheduleDays(settings.scheduleDays),
    interventionType: normalizeInterventionType(settings.interventionType),
    interventionSeconds: clampInteger(
      settings.interventionSeconds,
      3,
      120,
      DEFAULT_SETTINGS.interventionSeconds
    ),
    interventionText: normalizeInterventionText(settings.interventionText),
    allowlist: normalizeAllowlist(settings.allowlist)
  };
}

function normalizeInterventionType(value) {
  return INTERVENTION_TYPES.includes(value) ? value : DEFAULT_SETTINGS.interventionType;
}

function normalizeInterventionText(value) {
  const text = String(value || "").trim();
  return text || DEFAULT_SETTINGS.interventionText;
}

function normalizeTime(value, fallback) {
  const text = String(value || "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalizeScheduleDays(days) {
  if (!Array.isArray(days)) {
    return DEFAULT_SETTINGS.scheduleDays;
  }

  const normalized = [...new Set(days
    .map((day) => clampInteger(day, 0, 6, -1))
    .filter((day) => day >= 0))]
    .sort((a, b) => a - b);

  return normalized.length ? normalized : DEFAULT_SETTINGS.scheduleDays;
}

export function normalizeAllowlist(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return [...new Set(entries
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean))];
}

export function isCountedTab(tab, settings, temporaryAllowances = {}) {
  if (!tab || !tab.id || !tab.url) {
    return false;
  }

  if (settings.ignorePinned && tab.pinned) {
    return false;
  }

  if (isInternalUrl(tab.url)) {
    return false;
  }

  if (matchesTemporaryAllowance(tab, temporaryAllowances)) {
    return false;
  }

  return !urlMatchesAllowlist(tab.url, settings.allowlist);
}

export function isInternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return [
      "about:",
      "chrome:",
      "chrome-extension:",
      "devtools:",
      "edge:",
      "moz-extension:",
      "opera:"
    ].includes(url.protocol);
  } catch {
    return true;
  }
}

export function urlMatchesAllowlist(rawUrl, allowlist) {
  if (!rawUrl || !allowlist?.length) {
    return false;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const href = url.href.toLowerCase();

  return allowlist.some((entry) => {
    if (!entry) {
      return false;
    }

    if (entry.includes("://")) {
      return href.startsWith(entry);
    }

    if (entry.startsWith("*.")) {
      const domain = entry.slice(2);
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }

    return hostname === entry || hostname.endsWith(`.${entry}`);
  });
}

export function getAllowlistEntryForUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return "";
    }
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function getTemporaryAllowances() {
  const { temporaryAllowances = {} } = await chrome.storage.session.get({
    temporaryAllowances: {}
  });
  return pruneTemporaryAllowances(temporaryAllowances);
}

export async function getFocusPause() {
  const { focusPausedUntil = 0 } = await chrome.storage.session.get({
    focusPausedUntil: 0
  });
  const pausedUntil = Number(focusPausedUntil) || 0;

  if (pausedUntil <= Date.now()) {
    await clearFocusPause();
    return { isPaused: false, pausedUntil: 0 };
  }

  return { isPaused: true, pausedUntil };
}

export async function pauseFocusForMinutes(minutes = 15) {
  const durationMs = clampInteger(minutes, 1, 240, 15) * 60 * 1000;
  const focusPausedUntil = Date.now() + durationMs;
  await chrome.storage.session.set({ focusPausedUntil });
  return getFocusPause();
}

export async function clearFocusPause() {
  await chrome.storage.session.remove("focusPausedUntil");
}

export async function setTemporaryAllowance(tabId, url) {
  const temporaryAllowances = await getTemporaryAllowances();
  temporaryAllowances[String(tabId)] = {
    url,
    expiresAt: Date.now() + 10 * 60 * 1000
  };
  await chrome.storage.session.set({ temporaryAllowances });
}

export async function clearTemporaryAllowance(tabId) {
  const temporaryAllowances = await getTemporaryAllowances();
  delete temporaryAllowances[String(tabId)];
  await chrome.storage.session.set({ temporaryAllowances });
}

export async function getFocusState() {
  const [settings, temporaryAllowances, focusPause, tabs] = await Promise.all([
    getSettings(),
    getTemporaryAllowances(),
    getFocusPause(),
    chrome.tabs.query({ windowType: "normal" })
  ]);

  const countedTabs = tabs.filter((tab) =>
    isCountedTab(tab, settings, temporaryAllowances)
  );
  const exemptTabs = tabs.filter((tab) =>
    tab.url && !isInternalUrl(tab.url) && !isCountedTab(tab, settings, temporaryAllowances)
  );

  return {
    settings,
    focusPause,
    enforcement: getEnforcementState(settings, focusPause),
    tabs,
    countedTabs,
    exemptTabs,
    overLimit: Math.max(0, countedTabs.length - settings.maxTabs)
  };
}

export function getEnforcementState(settings, focusPause = { isPaused: false }) {
  const schedule = getScheduleState(settings);

  if (focusPause.isPaused) {
    return {
      isActive: false,
      reason: "paused",
      schedule
    };
  }

  if (!schedule.isActive) {
    return {
      isActive: false,
      reason: "outside_schedule",
      schedule
    };
  }

  return {
    isActive: true,
    reason: "active",
    schedule
  };
}

export function getScheduleState(settings, date = new Date()) {
  if (!settings.scheduleEnabled) {
    return {
      isActive: true,
      nextLabel: "",
      summary: "Always active"
    };
  }

  const startMinutes = timeToMinutes(settings.scheduleStart);
  const endMinutes = timeToMinutes(settings.scheduleEnd);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const today = date.getDay();
  const yesterday = (today + 6) % 7;
  const isOvernight = startMinutes > endMinutes;
  const isAllDay = startMinutes === endMinutes;
  const activeToday = settings.scheduleDays.includes(today);
  const activeYesterday = settings.scheduleDays.includes(yesterday);
  const isActive = isAllDay
    ? activeToday
    : isOvernight
    ? (activeToday && currentMinutes >= startMinutes) ||
      (activeYesterday && currentMinutes < endMinutes)
    : activeToday && currentMinutes >= startMinutes && currentMinutes < endMinutes;

  return {
    isActive,
    nextLabel: getNextScheduleLabel(settings, date),
    summary: isAllDay ? "All day" : `${settings.scheduleStart} to ${settings.scheduleEnd}`
  };
}

function getNextScheduleLabel(settings, date) {
  const startMinutes = timeToMinutes(settings.scheduleStart);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  for (let offset = 0; offset < 7; offset += 1) {
    const day = (date.getDay() + offset) % 7;
    if (!settings.scheduleDays.includes(day)) {
      continue;
    }

    if (offset === 0 && currentMinutes >= startMinutes) {
      continue;
    }

    const dayLabel = offset === 0
      ? "today"
      : WEEK_DAYS.find((item) => item.value === day)?.label || "";
    return `${dayLabel} at ${settings.scheduleStart}`;
  }

  return "";
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function matchesTemporaryAllowance(tab, temporaryAllowances) {
  const allowance = temporaryAllowances[String(tab.id)];
  return allowance && allowance.url === tab.url && allowance.expiresAt > Date.now();
}

function pruneTemporaryAllowances(temporaryAllowances) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(temporaryAllowances)
    .filter(([, allowance]) => allowance?.url && allowance.expiresAt > now));
}
