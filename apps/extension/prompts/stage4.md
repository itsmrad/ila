# Important points:

read &amp; follow apps/extension/prompts/[guidelines.md](http://guidelines.md)

to access the guideline for this project

## 4A.1 ContextBar with real tabs

**Instructions:**

- Add a `ContextBar` component above the chat area (or input).
- Use `chrome.tabs.query` (via WXT APIs) to fetch:
  - `id`, `title`, `url`, `favIconUrl` for current window [tabs.developer.chrome](http://tabs.developer.chrome)+1
- Render selectable pills for:
  - “Current Tab”
  - “All Tabs in this window”
  - “Custom Selection” (multi-select list of tabs).
- Maintain selected context in React state and persist it to [`chrome.storage](http://chrome.storage).local` (just the **tab IDs and URLs**, not DOM).[developer.chrome](http://developer.chrome)

**Best practices:**

- Do **not** attempt to read DOM or innerText in Stage 4A—keep this step strictly about tab metadata.
- Request only necessary permissions in `wxt.config.ts`:
  - `"tabs"` and possibly host permissions (e.g., `<all_urls>`) for later DOM access, but you can defer host permissions until Stage [5.dev](http://5.dev)
- Keep the UI fully functional even if `chrome.tabs.query` fails (e.g., show a fallback “No tabs available” state).

---

## Stage 4B – Mode Switcher (Chat vs Automations, Still Mostly Mocked)

**Objective:** Introduce a robust mode UI (Chat vs Automations) and define the contract with background + backend, but **keep automations mostly mocked or minimal** at this stage.

## 4B.1 Tabs for “Chat” and “Automations”

**Instructions:**

- Use Shadcn Tabs to create a top-level mode switch:
  - Tab 1: `Chat`
  - Tab 2: `Automations`
- In `Chat`:
  - Use selected context from Stage 4A (tab metadata) to display **what the AI is “looking at”**, but still send only minimal context in prompts for now.
- In `Automations`:
  - Show a static list or lightly mocked list of “Skills” / “Workflows”:
    - e.g., “Analyze my tabs”, “Summarize GitHub notifications”, “Pull tasks from Jira”.

## 4B.2 Automation trigger → background message

**Instructions:**

- When an automation is clicked:
- Construct a payload:
- Use `chrome.runtime.sendMessage` (or WXT messaging helper) to send a `"automation:start"` message to the background service [worker.developer.chrome](http://worker.developer.chrome)+1

**Best practices:**

- Don’t run heavy logic in the sidepanel:
  - The sidepanel **only** constructs the payload and shows progress.
- For now, the background can:
  - Log the payload and respond with a mocked progress sequence returned to UI (“Starting…”, “Complete”) to validate the messaging path.
- Don’t assume long-lived worker:
  - Return `true` from `onMessage` handlers or use Promises where supported; plan for the service worker to be killed between [events.developer.chrome](http://events.developer.chrome)+1

---

## Stage 4C – Settings, Integrations &amp; BYOK (Backend-Centric Secrets)

**Objective:** Build the Settings UI for integrations and BYOK, but design secrets to live in the **backend**, with the extension only holding non-sensitive indicators.

## 4C.1 SettingsDrawer UI

**Instructions:**

- Add a `SettingsDrawer` or `Sheet` opened via a header icon.
- Sections:
  - Theme &amp; preferences (local-only).
  - Integrations (Google, GitHub, Notion, etc.).
  - BYOK (LLM provider keys).

## 4C.2 Integrations (Composio) – backend integration

**Instructions:**

- **Do not store OAuth tokens or Composio session tokens in** [`chrome.storage`](http://chrome.storage)**.**  
Instead:
  - Call backend endpoints:
    - `GET /integrations/status` → list of connected apps + status.
    - `POST /integrations/{app}/connect` → returns an OAuth URL or Composio connect URL.
  - In the UI:
    - Show “Connected / Not connected” based on backend response.
    - Open the returned URL in a new tab or window for the user to complete OAuth.

**Best practices:**

- The backend owns:
  - OAuth flows
  - Composio session creation
  - Token encryption &amp; storage

The extension **only** displays status and triggers flows.

## 4C.3 BYOK (Bring Your Own Key) – safe handling

**Instructions:**

- Add a secure-looking input field for user LLM API keys (OpenAI, Anthropic, etc.).
- When user submits:
  - Immediately send the key to backend via HTTPS (`POST /keys/llm`) where it is encrypted and saved.
  - Do **not** persist the raw key in [`chrome.storage](http://chrome.storage).local`.stackoverflow+1
- In extension storage:
  - Store a small flag like `hasByok: true` and maybe an identifier (e.g., provider name), not the actual key.

**Best practices:**

- Never log the key or show it after initial entry.
- Treat [`chrome.storage](http://chrome.storage).local` as **non-secure**; only store indicators or opaque tokens if absolutely necessary, never secrets.

