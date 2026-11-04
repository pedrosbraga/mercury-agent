import { describe, expect, it } from 'vitest';
import { interactiveUiSection, INTERACTIVE_UI_VERSION } from './interactive-ui.js';

describe('interactive UI capability negotiation', () => {
  it('only opts in an explicitly capable web client', () => {
    expect(interactiveUiSection('web', INTERACTIVE_UI_VERSION)).toContain('Interactive chat UI');
    for (const channel of ['cli', 'telegram', 'whatsapp', 'internal']) {
      expect(interactiveUiSection(channel, INTERACTIVE_UI_VERSION)).toBe('');
    }
    for (const value of [undefined, null, true, {}, ['mercury-ui-v1'], 'mercury-ui-v2']) {
      expect(interactiveUiSection('web', value)).toBe('');
    }
  });
  it('keeps draft preparation distinct from real authorization', () => {
    const guide = interactiveUiSection('web', INTERACTIVE_UI_VERSION);
    expect(guide).toContain('NEVER submit messages or execute actions automatically');
    expect(guide).toContain('does NOT constitute authorization');
    expect(guide).toContain('Never request passwords');
    expect(guide).toContain('never invent real-world values');
  });
});
