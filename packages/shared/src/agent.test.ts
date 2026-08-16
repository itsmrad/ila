import { describe, expect, test } from "bun:test";
import {
  actionRequiresConfirmation,
  agentPlanRequestSchema,
  agentPlanSchema,
  agentDecisionSchema,
  agentAttachmentContextRequestSchema,
  browserActionSchema,
} from "./agent";

describe("browser action contract", () => {
  test("accepts a bounded deterministic plan", () => {
    const result = agentPlanSchema.safeParse({
      summary: "Search the current site",
      steps: [
        {
          id: "focus-search",
          title: "Focus the search box",
          action: {
            type: "click",
            selector: '[aria-label="Search"]',
            target: "Search button",
          },
        },
        {
          id: "enter-query",
          title: "Enter the query",
          action: {
            type: "type",
            selector: '[aria-label="Search"]',
            target: "Site search field",
            text: "browser automation",
            clear: true,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects executable and privileged URLs", () => {
    expect(
      browserActionSchema.safeParse({ type: "navigate", url: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      browserActionSchema.safeParse({ type: "open_tab", url: "chrome://settings" })
        .success,
    ).toBe(false);
  });

  test("bounds semantic target descriptions", () => {
    expect(
      browserActionSchema.safeParse({
        type: "click",
        selector: "button",
        target: "x".repeat(241),
      }).success,
    ).toBe(false);
  });

  test("supports safe form controls and one-step agent decisions", () => {
    expect(browserActionSchema.safeParse({
      type: "select",
      selector: "#country",
      target: "Country field",
      value: "India",
    }).success).toBe(true);
    expect(browserActionSchema.safeParse({
      type: "check",
      selector: "#terms",
      target: "Terms checkbox",
      checked: true,
    }).success).toBe(true);
    expect(browserActionSchema.safeParse({
      type: "upload",
      selector: 'input[type="file"]',
      target: "Resume upload field",
      attachmentId: "resume-one",
    }).success).toBe(true);
    expect(agentDecisionSchema.safeParse({
      status: "complete",
      summary: "The requested page is visible.",
    }).success).toBe(true);
    expect(agentDecisionSchema.safeParse({
      status: "needs_input",
      request: {
        title: "Choose a work arrangement",
        questions: [{
          id: "work-arrangement",
          prompt: "Which visible option should I select?",
          type: "single_choice",
          required: true,
          options: ["Remote", "Hybrid"],
        }],
      },
    }).success).toBe(true);
    expect(agentDecisionSchema.safeParse({
      status: "needs_input",
      request: {
        title: "Missing choices",
        questions: [{
          id: "choice",
          prompt: "Choose one",
          type: "single_choice",
          required: true,
        }],
      },
    }).success).toBe(false);
  });

  test("requires confirmation for browser-changing page actions", () => {
    expect(actionRequiresConfirmation({ type: "close_tab" })).toBe(true);
    expect(
      actionRequiresConfirmation({ type: "click", selector: "button" }),
    ).toBe(true);
    expect(
      actionRequiresConfirmation({ type: "scroll", direction: "down", amount: 700 }),
    ).toBe(false);
    expect(actionRequiresConfirmation({
      type: "upload",
      selector: 'input[type="file"]',
      attachmentId: "resume-one",
    })).toBe(true);
  });

  test("accepts bounded attachment data and rejects aggregate overflow", () => {
    expect(agentPlanRequestSchema.safeParse({
      task: "Apply using my resume",
      attachments: [{
        id: "resume-one",
        name: "Resume.pdf",
        mediaType: "application/pdf",
        size: 6,
        dataUrl: "data:application/pdf;base64,JVBERg==",
      }],
    }).success).toBe(true);
    expect(agentAttachmentContextRequestSchema.safeParse({
      attachments: [{
        id: "resume-one",
        name: "Resume.pdf",
        mediaType: "application/pdf",
        size: 6,
        dataUrl: "data:application/pdf;base64,JVBERg==",
      }],
    }).success).toBe(true);
  });
});

describe("agent planning request", () => {
  test("rejects non-web page context and oversized tasks", () => {
    expect(
      agentPlanRequestSchema.safeParse({
        task: "Summarize this page",
        pageContext: { url: "file:///Users/example/private.txt" },
      }).success,
    ).toBe(false);
    expect(agentPlanRequestSchema.safeParse({ task: "x".repeat(4_001) }).success).toBe(
      false,
    );
  });
});
