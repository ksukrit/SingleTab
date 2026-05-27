export const DEFAULT_SETTINGS = {
  maxTabs: 3,
  ignorePinned: true,
  interventionSeconds: 12,
  interventionText: "Take one breath. Stop doom scrolling and ask: is this tab helping the thing you meant to do?",
  allowlist: []
};

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

function normalizeInterventionText(value) {
  const text = String(value || "").trim();
  return text || DEFAULT_SETTINGS.interventionText;
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
    tabs,
    countedTabs,
    exemptTabs,
    overLimit: Math.max(0, countedTabs.length - settings.maxTabs)
  };
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
