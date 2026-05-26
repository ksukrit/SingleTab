const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get("blocked") || "";

const message = document.querySelector("#message");
const countedTabs = document.querySelector("#countedTabs");
const maxTabs = document.querySelector("#maxTabs");
const exemptTabs = document.querySelector("#exemptTabs");
const meterFill = document.querySelector("#meterFill");
const tabList = document.querySelector("#tabList");
const allowOnceButton = document.querySelector("#allowOnce");

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
  await chrome.runtime.sendMessage({ type: "allowOnce", url: blockedUrl });
});

document.querySelector("#openOptions").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

render();

async function render() {
  allowOnceButton.hidden = !blockedUrl;
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

  countedTabs.textContent = used;
  maxTabs.textContent = limit;
  exemptTabs.textContent = state.exemptTabs.length;
  meterFill.style.width = `${Math.min(100, Math.round((used / limit) * 100))}%`;

  tabList.replaceChildren(...state.countedTabs.map(renderTabRow));
  if (!state.countedTabs.length) {
    tabList.textContent = "No focus tabs are open.";
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
