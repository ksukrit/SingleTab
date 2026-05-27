import {
  clearTemporaryAllowance,
  clearFocusPause,
  getEnforcementState,
  getFocusPageUrl,
  getFocusPause,
  getFocusState,
  getSettings,
  getTemporaryAllowances,
  isInternalUrl,
  isCountedTab,
  pauseFocusForMinutes,
  setTemporaryAllowance
} from "./shared/settings.js";

const enforcingTabs = new Set();
const newTabCandidates = new Set();

chrome.runtime.onInstalled.addListener(async () => {
  await getSettings();
});

chrome.tabs.onCreated.addListener((tab) => {
  newTabCandidates.add(tab.id);
  scheduleEnforcement(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    cleanupAllowanceForNavigation(tabId, changeInfo.url);
  }

  if (newTabCandidates.has(tabId) && (changeInfo.url || changeInfo.status === "complete")) {
    scheduleEnforcement(tabId, tab);
  }
});

chrome.tabs.onAttached.addListener((tabId) => {
  if (newTabCandidates.has(tabId)) {
    scheduleEnforcement(tabId);
  }
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (newTabCandidates.has(removedTabId)) {
    newTabCandidates.delete(removedTabId);
    newTabCandidates.add(addedTabId);
    scheduleEnforcement(addedTabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  newTabCandidates.delete(tabId);
  clearTemporaryAllowance(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

function scheduleEnforcement(tabId, tab) {
  if (!tabId || enforcingTabs.has(tabId)) {
    return;
  }

  globalThis.setTimeout(() => {
    enforceTabLimit(tabId, tab)
      .then((isFinalized) => {
        if (isFinalized) {
          newTabCandidates.delete(tabId);
        }
      })
      .catch(console.error);
  }, 100);
}

async function enforceTabLimit(tabId, knownTab) {
  enforcingTabs.add(tabId);

  try {
    const [settings, temporaryAllowances, focusPause, targetTab, allTabs] = await Promise.all([
      getSettings(),
      getTemporaryAllowances(),
      getFocusPause(),
      knownTab?.url ? Promise.resolve(knownTab) : chrome.tabs.get(tabId).catch(() => null),
      chrome.tabs.query({ windowType: "normal" })
    ]);

    if (!getEnforcementState(settings, focusPause).isActive) {
      return true;
    }

    if (!targetTab) {
      return true;
    }

    if (!targetTab.url || isInternalUrl(targetTab.url)) {
      return false;
    }

    if (!isCountedTab(targetTab, settings, temporaryAllowances)) {
      return true;
    }

    const countedTabs = allTabs.filter((tab) =>
      isCountedTab(tab, settings, temporaryAllowances)
    );

    if (countedTabs.length <= settings.maxTabs) {
      return true;
    }

    await chrome.tabs.update(tabId, {
      url: getFocusPageUrl(targetTab.url)
    });
    return true;
  } finally {
    enforcingTabs.delete(tabId);
  }
}

async function cleanupAllowanceForNavigation(tabId, nextUrl) {
  const allowances = await getTemporaryAllowances();
  const allowance = allowances[String(tabId)];
  if (allowance && allowance.url !== nextUrl) {
    await clearTemporaryAllowance(tabId);
  }
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "getFocusState":
      return { ok: true, state: await getFocusState() };
    case "closeTab":
      await chrome.tabs.remove(message.tabId);
      return { ok: true, state: await getFocusState() };
    case "allowOnce": {
      const tabId = sender.tab?.id;
      if (!tabId || !message.url) {
        throw new Error("No active tab or URL to allow.");
      }
      await setTemporaryAllowance(tabId, message.url);
      await chrome.tabs.update(tabId, { url: message.url });
      return { ok: true };
    }
    case "pauseFocus":
      return {
        ok: true,
        focusPause: await pauseFocusForMinutes(15),
        state: await getFocusState()
      };
    case "resumeFocus":
      await clearFocusPause();
      return { ok: true, state: await getFocusState() };
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    default:
      throw new Error("Unknown message type.");
  }
}
