import { describe, expect, it } from 'vitest';
import {
  buildAssistantSystemPrompt,
  getAssistantToday,
} from '@/lib/mcp/chatTools';

describe('getAssistantToday / buildAssistantSystemPrompt', () => {
  it('formats Europe/Brussels calendar date', () => {
    // 2026-07-23 10:00 UTC = same calendar day in Brussels (CEST)
    const today = getAssistantToday(new Date('2026-07-23T10:00:00.000Z'));
    expect(today.isoDate).toBe('2026-07-23');
    expect(today.year).toBe(2026);
    expect(today.labelNl).toMatch(/2026/);
  });

  it('injects current year into system prompt so the model does not use training date', () => {
    const prompt = buildAssistantSystemPrompt({
      username: 'bart',
      now: new Date('2026-07-23T10:00:00.000Z'),
    });
    expect(prompt).toContain('HUIDIG JAAR: 2026');
    expect(prompt).toContain('year=2026');
    expect(prompt).toContain('bart');
    expect(prompt).not.toContain('HUIDIG JAAR: 2024');
  });
});
