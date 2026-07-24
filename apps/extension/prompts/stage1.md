# ila Chrome Extension

# Project ILA: Stage 1 - Initial UI &amp; Architecture Setup

# Executive Summary: Project Vision &amp; Scope

We are building 'ILA' (tentative name), a Next-Generation AI-powered Browser Automation and Productivity Assistant, designed as a highly complex and deeply integrated Chrome extension. The final vision is an extension that can control any web application (e.g., Google Sheets, GitHub, Jira) using natural language, with full automation capabilities and cross-application workflows. ILA will feature a persistent memory system (BYOK or subscription-based), allowing it to learn and reduce token costs over time. The ultimate competitor is tools like Dex, but ILA aims to be faster, more seamless, and more personalized.

For future reference (and not for immediate implementation), we plan to use Composio for integrations, and tools like `browser-use` or `stagehand` for the main browser automation layer.

# Critical Focus for Stage 1: The Perfect UI/UX

Our **primary and only goal** for Stage 1 is to build a hyper-polished, functional user interface (UI) for the extension that opens in the Chrome sidepanel.

We are establishing the architectural groundwork and creating a visually stunning, reactive front-end. The UI must replicate the advanced, clean aesthetic seen in `image_0.png`.

- **No complex logic is required in Stage 1.**
- **Composio and automation tools are DEFERRED.**
- **The focus is entirely on the look, feel, and structure.**

## Technical Stack (WXT, Shadcn/ui, Vercel AI SDK)

To build a professional, maintainable, and modern extension, we are using the following stack:

1. **Framework:** WXT ([https://wxt.dev/](https://wxt.dev/](https://wxt.dev/)))
2. **UI Library:** Shadcn/ui (Tailwind-based reusable components)
3. **Styling:** Tailwind CSS
4. **Chat UI/Setup:** Vercel AI SDK (just the components, minimal logic).

## Stage 1 AI Prompt: Generate the Foundation

You are a Senior Browser Extension Developer and UI/UX expert. Your task is to initialize a new WXT extension project and create the initial polished UI. We need a modern, light-themed (by default), hyper-professional look that exactly replicates the advanced interface elements from `image_0.png`.

### Task 1: Project Initialization &amp; Configuration

1. Configure Tailwind CSS according to the WXT documentation.
2. Install Shadcn/ui and configure its base setup `components.json`). Configure the default theme to be **light**. Use reusable Shadcn/ui components `Input`, `Textarea`, `Card`, `DropdownMenu`, etc.) as much as possible.

### Task 2: Build the Main Sidebar Interface

Using WXT's `sidepanel` entry point, build the main UI. Referencing `image_0.png`, break the UI into reusable components:

**1. Main Structure `src/entries/sidepanel/index.tsx`)**

- The overall container must look like the sidebar view in `image_0.png`. light background, clean margins, and sophisticated typography.

**2. Header Component** 

- Replicate the top section of `image_0.png`.
- **Left Side:** 'ILA' logo/name. Maybe a simple, stylized icon with the text 'ILA'. ( this is chrome sidebar feature that shows the extension icon and name )
- **Right Side:** Utility icons matching the screenshot: ( this is chrome sidebar feature, you dont need to do )
- Back/Forward arrows).
- Home icon ).
- Edit/Compose icon ).
- Settings gear ).
- Help/Support icon or similar).
- Pin/Close icons ).

**3. Chat Window Component** 

- This is the main content area. Replicate the look of the structured text in `image_0.png`. Use clean typography.
- Include a static user message block: (e.g., a card or bubble showing "Analyze my tabs").
- Include a static AI response block: Replicate the rich text formatting and card structures from the screenshot:
- 'Tab Overview' card.
- List of categories (e.g., "Development / Coding (6 tabs)").
- List items with icons (e.g., YouTube logo, Convex logo, custom browser icons). *Stage 1 only needs static, hardcoded stubs.*

**4. Advanced Input Area Component** 

- **This is the most critical element to replicate.** It is the floating, rounded input card at the bottom of `image_0.png`.
- The main input should be a rounded `Textarea` card.
- **Inner Left (triggers/context):**
- Small ILA/Gemini icon with text "Google Gemini...".
- Clickable triggers for context: `@` and `/`.
- **Placeholder Text:** "type @ for context, / for actions...".
- **Inner Right (actions):** Replicate the action icons precisely on the bottom edge:
- Settings cog, paperclip, screenshot tool, audio tool.
- A prominent, large upward arrow for the send button (like the one in `image_0.png`).

**5. Vercel AI SDK Integration (UI Only)**

- Setup the basic boilerplate for `useChat` hook from `@ai-sdk/react`. Connect the input area to the state. *For Stage 1, the AI just needs to echo simple text back; no actual API key is needed yet.*

### Task 3: Best Practices for WXT

Ensure the code follows these best practices for WXT:

- **Modular Component Structure:** Break everything into small, focused, reusable components.
- **WXT Utility:** Utilize WXT's runtime APIs `browser`) correctly if any background script interaction is needed (e.g., for resizing the sidebar, although the browser handles it now).
- **Theme Consistency:** The entire extension must adhere strictly to the dark mode palette defined by Shadcn/ui and Tailwind.
- **Optimized Styling:** Use Tailwind efficiently.
- **HMR (Hot Module Replacement):** The development environment must be configured for seamless HMR for the sidebar and content scripts.
- **Clear State Management:** Use React hooks `useState`, `useEffect`, `useChat`) clearly and concisely.

### Stage 1 Deliverables

When complete, the extension should:

1. Initialize properly with `wxt dev`.
2. Successfully open the extension in the Chrome sidepanel.
3. Display a perfectly polished, dark-mode UI that looks *identical* to `image_0.png`.
4. Have functioning (visually) reusable components.
5. Have a basic Vercel AI SDK chat interface hooked up, where a user can type and the AI responds with static text.

### additional ref image are : image_1.png ( this is the new chat window, ignore the black borders, those are by the chrome app that got taken while screenshot )

---

