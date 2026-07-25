## 3.1 useChat mock integration

- Wire `useChat` from the Vercel AI SDK into the sidepanel app:
- Implement:
  - Loading indicator when a response is “streaming”. use vercel 
  - Error state (e.g., show a toast if the mock handler throws).

**Best practices:**

- configure real API keys in Stage 3. and i will update it in the env in the backend
- Keep the Vercel AI SDK usage minimal and proper where needed: `useChat` hook, `messages`, `input`, `handleInputChange`, `handleSubmit`.

## 3.2 Input area behavior &amp; keyboard UX

- Enhance the bottom input card:
  - Support **Enter to send** and **Shift+Enter for newline**.
  - Trim trailing whitespace; prevent empty submissions.
- Add a small **character counter** or input hints under the textarea.
- Ensure focus behavior works well: focus input when sidepanel opens.

**Best practices:**

- No complex suggestion logic yet (for `@` or `/`); only basic hints and keystroke handling.
- Keep all state in React hooks (`useState`, `useEffect`); no global store yet.

## 3.3 Message history persistence (local only)

- Store chat history in `chrome.storage.local` or `browser.storage.local` when the sidepanel unmounts.
- On mount, restore the last session’s messages.

**Best practices:**

- Keep the stored payload small; do not store large or binary content.
- Implement a “Clear conversation” button in the header.



# important :

- the frontend will call the backend and then the backend will authenticate the ai req and then call the ai endpoint so make sure to implement a solid production grade api flow for this
- make sure to add openai compatible endpoint and api key fields in the env which i will use to setup my openrouter key later
- only authenticated users can make request to the api, and make sure the chats get stored in the database by userid so user can see his/her previous chat log, and make sure only the owner of the chat can see his chat history, implement the button and ui for this in the extension also
- no need for workflows now, only need to implement a chat interface

