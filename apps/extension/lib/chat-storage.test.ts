import { describe, expect, test } from 'bun:test';
import { parseStoredSession } from './chat-storage';

describe('chat session cache', () => {
  test('migrates message-only sessions without losing their transcript', () => {
    const restored = parseStoredSession({
      version: 1,
      messages: [{ id: 'one', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      savedAt: 10,
    });

    expect(restored?.version).toBe(2);
    expect(restored?.messages).toHaveLength(1);
    expect(restored?.agentRuns).toEqual([]);
  });

  test('keeps completed agent turns and marks interrupted work accurately', () => {
    const restored = parseStoredSession({
      version: 2,
      messages: [],
      agentRuns: [
        {
          id: 'complete',
          createdAt: 10,
          status: 'complete',
          task: 'Search Wikipedia for Darjeeling',
          summary: 'Darjeeling is open.',
        },
        {
          id: 'running',
          createdAt: 20,
          status: 'running',
          task: 'Play the latest MrBeast video',
          thinking: true,
        },
      ],
      savedAt: 30,
    });

    expect(restored?.agentRuns).toHaveLength(2);
    expect(restored?.agentRuns[0]?.status).toBe('complete');
    expect({
      status: restored?.agentRuns[1]?.status,
      thinking: restored?.agentRuns[1]?.thinking,
      error: restored?.agentRuns[1]?.error,
    }).toEqual({
      status: 'failed',
      thinking: false,
      error: 'This task was interrupted when the side panel closed.',
    });
  });

  test('rejects malformed agent history instead of trusting it', () => {
    expect(parseStoredSession({
      version: 2,
      messages: [],
      agentRuns: [{ id: 'bad', status: 'complete' }],
      savedAt: 30,
    })).toBeNull();
  });

  test('requires a fresh attachment after restoring an unapproved upload task', () => {
    const restored = parseStoredSession({
      version: 2,
      messages: [],
      agentRuns: [{
        id: 'resume-task',
        createdAt: 20,
        status: 'awaiting-confirmation',
        task: 'Apply using my resume',
        plan: {
          summary: 'Upload resume',
          steps: [{
            id: 'upload-resume',
            title: 'Upload resume',
            action: {
              type: 'upload',
              selector: 'input[type="file"]',
              attachmentId: 'resume-one',
            },
          }],
        },
      }],
      savedAt: 30,
    });

    expect(restored?.agentRuns[0]?.status).toBe('failed');
    expect(restored?.agentRuns[0]?.error).toBe(
      'The attachment was removed when the side panel closed. Attach it again and retry.',
    );
  });

  test('marks a human-input checkpoint as interrupted after the panel closes', () => {
    const restored = parseStoredSession({
      version: 2,
      messages: [],
      agentRuns: [{
        id: 'paused-task',
        createdAt: 20,
        status: 'awaiting-input',
        task: 'Complete the application',
        humanInput: {
          title: 'Information needed',
          questions: [{
            id: 'notice-period',
            prompt: 'What is your notice period?',
            type: 'text',
            required: true,
          }],
        },
      }],
      savedAt: 30,
    });

    expect(restored?.agentRuns[0]?.status).toBe('failed');
    expect(restored?.agentRuns[0]?.error).toBe(
      'This paused task was interrupted when the side panel closed. Start it again to continue safely.',
    );
  });
});
