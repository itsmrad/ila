import { describe, expect, test } from 'bun:test';
import {
  AgentPlanningError,
  AgentProviderError,
  rankAgentModelCandidates,
  runTimedAttempt,
  parseAgentDecisionText,
  parseAgentPlanText,
  detectImmediateHumanNeed,
  usesUnrequestedParameterizedNavigation,
} from './agent-planner.service';

const validPlan = {
  summary: 'Open YouTube search results',
  steps: [
    {
      id: 'open-results',
      title: 'Open YouTube results for MrBeast',
      action: {
        type: 'navigate',
        url: 'https://www.youtube.com/results?search_query=mrbeast',
      },
    },
  ],
};

describe('agent plan text parsing', () => {
  test('accepts valid JSON and harmless Markdown fences', () => {
    expect(parseAgentPlanText(JSON.stringify(validPlan))).toEqual(validPlan);
    expect(parseAgentPlanText(`\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\``)).toEqual(
      validPlan,
    );
  });

  test('rejects refusals, unknown actions, and executable URLs', () => {
    expect(parseAgentPlanText('{"error":"I cannot help"}')).toBeNull();
    expect(
      parseAgentPlanText(
        JSON.stringify({
          ...validPlan,
          steps: [{ ...validPlan.steps[0], action: { type: 'run_javascript', code: 'x' } }],
        }),
      ),
    ).toBeNull();
    expect(
      parseAgentPlanText(
        JSON.stringify({
          ...validPlan,
          steps: [
            { ...validPlan.steps[0], action: { type: 'navigate', url: 'javascript:alert(1)' } },
          ],
        }),
      ),
    ).toBeNull();
  });

  test('uses actionable gateway errors instead of opaque internal errors', () => {
    expect(new AgentPlanningError().statusCode).toBe(502);
    expect(new AgentPlanningError().code).toBe('AGENT_PLAN_FAILED');
    expect(new AgentProviderError().statusCode).toBe(502);
    expect(new AgentProviderError(true).statusCode).toBe(504);
  });

  test('uses a dedicated fast controller and bounds failover to one attempt', () => {
    const candidates = rankAgentModelCandidates('moonshotai/kimi-k3', [
      'moonshotai/kimi-k3',
      'google/gemini-2.5-flash',
      'openai/gpt-4.1-mini',
    ]);
    expect(candidates[0]).toBe('google/gemini-2.5-flash');
    expect(candidates.length).toBe(2);
  });

  test('returns at the hard deadline even when a provider ignores abort', async () => {
    const started = Date.now();
    const result = await runTimedAttempt(
      new AbortController().signal,
      () => new Promise<string>(() => undefined),
      10,
    );
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started < 500).toBe(true);
  });

  test('accepts one grounded decision and rejects invalid completion shapes', () => {
    expect(parseAgentDecisionText(JSON.stringify({
      status: 'action',
      step: {
        id: 'type-search',
        title: 'Type into search',
        action: {
          type: 'type',
          selector: '#search',
          target: 'Search field',
          text: 'MrBeast',
          clear: true,
        },
      },
    }))).toEqual({
      status: 'action',
      step: {
        id: 'type-search',
        title: 'Type into search',
        action: {
          type: 'type',
          selector: '#search',
          target: 'Search field',
          text: 'MrBeast',
          clear: true,
        },
      },
    });
    expect(parseAgentDecisionText('{"status":"complete"}')).toBeNull();
  });

  test('accepts structured human input decisions', () => {
    const decision = {
      status: 'needs_input',
      request: {
        title: 'Application detail needed',
        questions: [{
          id: 'notice-period',
          prompt: 'What is your notice period?',
          type: 'text',
          required: true,
        }],
      },
    };
    expect(parseAgentDecisionText(JSON.stringify(decision))).toEqual(decision);
  });

  test('pauses deterministically for CAPTCHA and a missing required file', () => {
    const base = {
      task: 'Apply to this job with my resume',
      reasoning: false,
      execution: [],
      signal: new AbortController().signal,
    };
    expect(detectImmediateHumanNeed({
      ...base,
      pageSnapshot: '<iframe title="reCAPTCHA">',
    })?.status).toBe('needs_input');
    const missingFile = detectImmediateHumanNeed({
      ...base,
      pageSnapshot: '<input type="file" name="resume">',
    });
    expect(missingFile?.status).toBe('needs_input');
    expect(missingFile?.status === 'needs_input'
      ? missingFile.request.questions[0]?.type
      : undefined).toBe('file');
    expect(detectImmediateHumanNeed({
      ...base,
      pageSnapshot: '<input type="file" name="resume">',
      attachmentMetadata: [{
        id: 'resume-one',
        name: 'Resume.pdf',
        mediaType: 'application/pdf',
        size: 100,
      }],
    })).toBeNull();
  });

  test('blocks model-invented deep and parameterized navigation', () => {
    expect(usesUnrequestedParameterizedNavigation('Search YouTube for MrBeast', {
      type: 'navigate',
      url: 'https://www.youtube.com/results?search_query=mrbeast',
    })).toBe(true);
    expect(usesUnrequestedParameterizedNavigation('Open YouTube', {
      type: 'navigate',
      url: 'https://www.youtube.com/',
    })).toBe(false);
    expect(usesUnrequestedParameterizedNavigation('Open github.com/openai/codex', {
      type: 'navigate',
      url: 'https://github.com/openai/codex',
    })).toBe(false);
  });
});
