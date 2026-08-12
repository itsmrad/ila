import { describe, expect, test } from 'bun:test';
import {
  AgentPlanningError,
  AgentProviderError,
  parseAgentDecisionText,
  parseAgentPlanText,
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
