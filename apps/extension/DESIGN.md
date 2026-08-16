# ILA Extension Design System

ILA uses a compact AI-workbench interface derived from Beautiful UI’s restrained component language. Agent work belongs in the conversation flow; it must never obscure the composer with a floating task popup.

## Visual language

- Mineral page and canvas surfaces keep long-running work calm.
- Ink levels (`--ink`, `--ink-2`, `--ink-3`) define hierarchy without low-contrast gray text.
- Violet indicates intent, focus, the selected model, and primary approval actions.
- Green means verified completion; red means a failed or blocked action.
- Dashed separators express sequence and disclosure. Elevation is reserved for overlays, approval cards, and the composer.
- Light and dark themes use the same semantic tokens from `entrypoints/sidepanel/style.css`.

## Interaction patterns

- The transcript contains chat messages, reasoning, tool activity, task rows, errors, and completion evidence.
- Consequential browser work uses `ApprovalCard`; its primary action is always explicitly labeled.
- The composer stays anchored, supports context and attachments, and discloses model choices through a compact `Model` button.
- Icon-only controls require accessible labels and visible focus. Motion must respect `prefers-reduced-motion`.

## Component boundaries

- `components/ai`: reusable AI-native primitives such as loading, thinking, streaming text, approval, context, recommendations, tool chips, task rows, search, code, and diffs.
- `components/agent`: browser-run composition and execution history.
- `components/chat`: transcript, composer, history, attachments, and chat errors.
- `components/layout`: persistent extension navigation.

Keep new UI on semantic tokens. Avoid one-off light-only colors, nested cards, decorative gradients, and modal flows for ordinary agent activity.
