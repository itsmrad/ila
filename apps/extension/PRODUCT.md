# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Chrome users who want to complete browsing and web-app tasks with natural-language instructions instead of manually navigating each site.

## Product Purpose

ILA is an AI browser assistant delivered through a persistent Chrome side panel. It combines chat, current-page context, user-controlled browser automation, and browsing memory so users can ask for work and observe it being completed in the active browser.

## Positioning

ILA keeps conversation, page context, permissions, memory, and browser actions in one extension-native workflow, with explicit controls for how independently the agent may act.

## Operating Context

Users work from a Chrome side panel while visiting ordinary HTTP and HTTPS pages. They can include the active page, upload supporting files, capture the visible tab, choose an AI model, and decide whether the assistant may reason, use memory, control the browser, or skip action confirmations.

## Capabilities and Constraints

- Existing Better Auth authentication and AI chat workflows must remain intact.
- Browser automation must be opt-in and use Chrome extension APIs and page-level content scripts.
- Destructive or high-impact browser actions require confirmation unless the user explicitly enables skip confirmation.
- Browsing memory is local-first, user-controlled, inspectable, and clearable.
- File uploads and screenshots are contextual chat inputs, with bounded size and type validation.
- Internal browser pages, local files, and extension pages are excluded from page context and automation.
- The first production milestone supports a safe, deterministic action vocabulary rather than arbitrary generated JavaScript.

## Brand Commitments

The product name is ILA. Preserve the existing quiet, light interface, lavender accent, rounded controls, and concise assistant voice while extending its capabilities.

## Evidence on Hand

The repository contains working authentication, model-backed chat, conversation history, active-page context, and a side-panel interface. There are no customer claims, benchmarks, or testimonials to present.

## Product Principles

- Keep users in control of browser-changing actions.
- Make agent state and context visible at the point of use.
- Prefer reliable, explainable actions over opaque automation.
- Keep private browsing context local unless the user includes it in a request.
- Fail safely and leave the browser recoverable.

## Accessibility & Inclusion

New controls must be keyboard operable, expose accurate accessible names and states, preserve visible focus, and respect reduced-motion preferences.
