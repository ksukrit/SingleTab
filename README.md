# Single Tab Focus

A calm Manifest V3 Chrome extension that nudges you back to focus by limiting the number of non-exempt tabs open across the browser.

## What It Does

- Defaults to a limit of 3 focus tabs.
- Counts tabs across all normal Chrome windows.
- Ignores pinned tabs by default.
- Supports an allowlist for domains and URL prefixes.
- Redirects extra tabs to a focus page instead of closing them automatically.
- Does not interrupt navigation inside tabs that were already open.
- Lets you close tabs, allow a blocked URL once, or adjust settings.
- Lets you add the current site to the allowlist from the popup.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `/Users/sukritk/Desktop/Side Quest/singe_tab`.

## Configure

Open the extension popup and click `Settings`, or visit the extension options page from `chrome://extensions`.

Allowlist examples:

```text
localhost
127.0.0.1
*.work-tools.com
https://example.com/docs
```

## Manual Test

1. Open 3 regular, non-pinned, non-allowlisted tabs.
2. Open a 4th regular tab.
3. Confirm the 4th tab redirects to the focus page.
4. Pin a tab and confirm it no longer counts.
5. Add an allowlisted domain and confirm matching tabs no longer count.
6. Start with more tabs than your limit, then navigate inside an existing tab and confirm it is not redirected.
