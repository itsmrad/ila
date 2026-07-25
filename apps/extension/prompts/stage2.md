# Stage 01 – ILA Extension: Next Feature Roadmap (Frontend Only)

> Context: Stage 1 UI (sidepanel shell, static chat layout, advanced input, basic useChat wiring) is **done**.  
> We are now planning the **next front-end stages** for the ILA Chrome extension. Backend and heavy automation are still deferred.
>
> Goal: Split upcoming work into small, well‑defined stages that a coding AI can implement one at a time without overloading a single session.

---

## Stage 2 – UI Refinement, Component Library &amp; Layout System

**Objective:** Turn the initial static UI into a clean, reusable component system with a robust layout structure, theming, and basic navigation. No backend calls or real automations yet.

## 2.1 Shadcn/ui &amp; Tailwind consolidation

- Review all existing UI code and:
  - Replace ad‑hoc markup with **Shadcn/ui primitives** (Card, Input, Textarea, DropdownMenu, ScrollArea, Tabs, etc.).[web:84][web:90] if its already done then ignore.
  - Ensure all components follow the `components/ui/*` pattern and use the `cn` helper for conditional classNames.[web:84][web:86]
- Enforce a single source of truth for:
  - Typography (heading sizes, body text, mono text for code‑like elements).
  - Spacing scale (padding/margins) via Tailwind utility conventions.

**Best practices:**

- Do **not** duplicate Tailwind classes everywhere; use Shadcn variants (e.g., Button variants, Card variants) when possible.[web:94]
- Avoid inline styles; everything should be Tailwind or CSS variables.

## 2.2 Layout &amp; shell components

**Best practices:**

- Keep shell components **dumb**: they receive children and props, no business logic.
- Maintain strict separation between layout components (`Shell`, `Header`, `Content`) and chat components (`MessageList`, `MessageBubble`, `TabOverviewCard`).

## 2.3 Message &amp; card components

you can also implement something that will be more professional and user friendly, and better for this extension

- Define reusable components:
  - `MessageBubble` (role-aware: user vs AI).
  - `TabOverviewCard` (title + list of tab groups + icons).
  - `TagPill` for categories like “Development / Coding (6 tabs)”.
- Use static, hardcoded data for now.
- Implement a **design language**:
  - Rounded corners, subtle shadows, and consistent icon sizes.
  - Use `lucide-react` or Shadcn‑compatible icons for generic controls.

**Best practices:**

- No data fetching or async code in Stage 2.
- Focus purely on component API design and visual polish.

---

## Stage 3 – State Management &amp; Chat UX Enhancements (Frontend Only)

**Objective:** Improve chat experience using local state only; refine Vercel AI SDK integration for a realistic UX without hitting real APIs.

## 3.1 useChat mock integration

- Wire `useChat` from the Vercel AI SDK into the sidepanel app:
  - Use a **local mock endpoint** or an in‑memory handler that simply echoes responses with a small delay.[web:92][web:93]
  - Messages should flow through `MessageBubble` components.
- Implement:
  - Loading indicator when a response is “streaming”.
  - Error state (e.g., show a toast if the mock handler throws).

**Best practices:**

- Do **not** configure real API keys in Stage 3.
- Keep the Vercel AI SDK usage minimal: `useChat` hook, `messages`, `input`, `handleInputChange`, `handleSubmit`.

## 3.2 Input area behavior &amp; keyboard UX

- Enhance the bottom input card:
  - Support **Enter to send** and **Shift+Enter for newline**.
  - Trim trailing whitespace; prevent empty submissions.
- Add a small **character counter** or input hints under the textarea.
- Ensure focus behavior works well: focus input when sidepanel opens.

**Best practices:**

- No complex suggestion logic yet (for `@` or `/`); only basic hints and keystroke handling.
- Keep all state in React hooks (`useState`, `useEffect`); no global store yet.

---

## Stage 4 – Context &amp; Mode UI (Still No Real Automation)

**Objective:** Add UI for modes and context selection (tabs, pages, apps) without actually triggering backend agents.

## 4.1 Context selector UI

- Add a `ContextBar` above the chat or in the header:
  - Show pills for current tab, all tabs, “workspace” (browser window), etc.
  - Allow clicking to toggle the active context; store selection in local state.
- Add static context preview:
  - e.g., a list of fake tabs with icons and titles.

**Best practices:**

- Do not touch the real Chrome tabs yet; rely on mock data.
- Make the context selector fully reusable; it will later bind to real tab data.

## 4.2 Mode switcher UI (chat vs automations)

- Introduce a simple **tabbed interface** (Shadcn Tabs) for:
  - `Chat` (current UI).
  - `Automations` (placeholder list of workflows).
- In `Automations` tab, show static cards for future workflows (e.g., “Analyze my tabs”, “Summarize GitHub notifications”).

**Best practices:**

- No routing library; keep it as internal tab state.
- Keep the tab content structured so future logic can attach easily.

## 4.3 Settings &amp; profile drawer

- Add a `SettingsDrawer` or `Sheet` component accessible via a header icon:
  - Theme toggle (light/dark) – but **still default to light** for now.
  - Placeholder for “Link accounts” (e.g., Google, GitHub) as static items.

**Best practices:**

- All settings are local-only; no backend calls.
- Ensure accessibility: focus trapping, ESC to close, keyboard navigation.

---

## Stage 5 – Extension Integration &amp; Chrome APIs (Light Touch)

**Objective:** Lightly integrate with Chrome extension APIs for sidepanel, tab info, and storage, while keeping business logic mocked.

## 5.1 WXT sidepanel and entries review

- Confirm that the WXT `sidepanel` entry is correctly wired and documented.
- Refactor any ad‑hoc WXT usage into a small `extension` utility module (e.g., wrappers for `browser.tabs.query`, [`browser.storage](http://browser.storage).local`).[web:38]

**Best practices:**

- Use WXT’s recommended runtime APIs and type-safe wrappers when possible.
- No background script business logic yet; only minimal tab queries.

## 5.2 Real tab metadata in UI

- Replace mock tab lists in `TabOverviewCard` and `ContextBar` with real data from `browser.tabs.query`.
- Only show:
  - Title
  - URL
  - Favicon URL, if available.

**Best practices:**

- Do not automate tabs (no closing/creating/moving) in Stage 5.
- Keep all tab interaction read‑only.

## 5.3 Persistent UI preferences

- Store user preferences (theme, active mode, last context) in `storage.local`.
- Restore them on extension load.

**Best practices:**

- Guard storage calls with try/catch; handle cases where storage is unavailable.
- Keep the data schema small and documented.

---

## General Rules &amp; Best Practices for All Upcoming Stages

- **Single responsibility per stage:** Each stage should focus on **one major concern** (UI, state, context, etc.) to avoid overloading the coding AI.
- **No backend / Composio / browser-use / Stagehand** until explicitly introduced in later stages.
- **No real secrets or API keys** in the extension during these stages; all AI behavior is mocked.
- **Accessibility &amp; UX first:** use semantic HTML, ARIA where needed, and keyboard-friendly controls.
- **Consistent design:** follow Shadcn/ui and Tailwind best practices for components, theming, and layouts.[web:84][web:90][web:87]
- **Clean React hooks:** no global mutable state or event buses; prefer hooks and props until the app becomes large enough to justify a store.

At the end of these stages, ILA’s extension will have a **production-grade, fully interactive front-end shell** ready for real automation, memory, and backend integration in later stages.