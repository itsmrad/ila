import { describe, expect, test } from 'bun:test';
import { DEFAULT_AGENT_SETTINGS, parseAgentSettings } from './settings-storage';

describe('agent settings', () => {
  test('falls back to safe defaults for malformed stored data', () => {
    expect(parseAgentSettings({ browserAgent: true })).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});
