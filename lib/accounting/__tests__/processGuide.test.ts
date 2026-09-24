import { describe, expect, it } from 'vitest';
import { ACTION_CATEGORY_ORDER, type ActionCategory } from '@/lib/accounting/insights';
import {
  ACCOUNTING_CHECKLIST,
  AUTOMATION_ROADMAP,
  allProcessGuides,
  automationStatusLabel,
  cadenceLabel,
  getProcessGuide,
} from '@/lib/accounting/processGuide';

describe('processGuide', () => {
  it('covers every accounting action category', () => {
    const guides = allProcessGuides();
    expect(guides.map((g) => g.category)).toEqual(ACTION_CATEGORY_ORDER);
    for (const category of ACTION_CATEGORY_ORDER) {
      const guide = getProcessGuide(category);
      expect(guide.steps.length).toBeGreaterThan(2);
      expect(guide.odooHref).toContain('babetteconcept.be');
      expect(guide.automation.next.length).toBeGreaterThan(10);
    }
  });

  it('labels automation statuses exhaustively', () => {
    expect(automationStatusLabel('in_app')).toBe('Kan via deze app');
    expect(automationStatusLabel('planned')).toBe('Te automatiseren');
    expect(automationStatusLabel('keep_with_partner')).toBe('Bij partner houden');
  });

  it('has a checklist that maps back to known categories', () => {
    const known = new Set<ActionCategory>(ACTION_CATEGORY_ORDER);
    for (const item of ACCOUNTING_CHECKLIST) {
      expect(item.categories.length).toBeGreaterThan(0);
      expect(cadenceLabel(item.cadence).length).toBeGreaterThan(0);
      for (const category of item.categories) {
        expect(known.has(category)).toBe(true);
      }
    }
    expect(AUTOMATION_ROADMAP.length).toBeGreaterThanOrEqual(3);
  });
});
