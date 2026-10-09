import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { buildIdeaBankPrompt, buildSentenceBankPrompt } from '../bankPrompts';
import { validateIdeaBank } from '../expressions';

describe('buildIdeaBankPrompt', () => {
  it('names every valid category and the exact bank type/version', () => {
    const p = buildIdeaBankPrompt();
    for (const c of ['History', 'Literature', 'Psychology', 'Business', 'Language', 'Philosophy', 'Science', 'Culture']) {
      expect(p).toContain(c);
    }
    expect(p).toContain('"type": "levelup-daily-ideas-bank"');
    expect(p).toContain('"version": 1');
  });

  it('applies topic and clamps count', () => {
    expect(buildIdeaBankPrompt({ topic: 'ancient history' })).toContain('Focus on: ancient history.');
    expect(buildIdeaBankPrompt({ count: 9999 })).toContain('bank of 200 ');
    expect(buildIdeaBankPrompt({ count: 0 })).toContain('bank of 1 ');
  });

  it("the prompt's own example is accepted by the real validator", () => {
    const p = buildIdeaBankPrompt();
    const json = p.match(/```json\n([\s\S]*?)\n```/)![1];
    const v = validateIdeaBank(json);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.count).toBe(1);
  });
});

describe('buildSentenceBankPrompt', () => {
  it('uses the languages and the pipe format the parser expects', () => {
    const p = buildSentenceBankPrompt({ target: 'English', native: 'Turkish' });
    expect(p).toContain('in English');
    expect(p).toContain('Turkish translation');
    expect(p).toContain('English sentence | Turkish translation');
  });

  it('shows placeholders when languages are not set yet', () => {
    const p = buildSentenceBankPrompt({ target: '', native: ' ' });
    expect(p).toContain('[LANGUAGE I AM LEARNING]');
    expect(p).toContain('[MY NATIVE LANGUAGE]');
  });
});
