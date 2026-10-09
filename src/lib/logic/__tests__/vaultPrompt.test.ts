import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { buildConceptPrompt, parsePastedPack } from '../vaultPrompt';

const PACK = {
  type: 'levelup-vault-pack',
  version: 1,
  exportedAt: '2026-10-09T00:00:00.000Z',
  domains: [{ name: 'History', icon: '🏛️', color: '#38bdf8' }],
  concepts: [{ title: 'The Silk Road', domainName: 'History', summary: 's', keyIdeas: [{ title: 'a', body: 'b' }], sourceType: 'manual' }],
};
const JSON_TEXT = JSON.stringify(PACK, null, 2);

describe('buildConceptPrompt', () => {
  it('embeds the topic, schema literal and ISO date', () => {
    const p = buildConceptPrompt({ topic: ' The Silk Road ', now: new Date('2026-10-09T00:00:00Z') });
    expect(p).toContain('TOPIC: The Silk Road');
    expect(p).toContain('"type": "levelup-vault-pack"');
    expect(p).toContain('2026-10-09T00:00:00.000Z');
  });

  it('shows a placeholder for an empty topic', () => {
    expect(buildConceptPrompt({ topic: '  ' })).toContain('[TYPE YOUR TOPIC HERE]');
  });

  it('asks the AI to reuse existing domains when given', () => {
    const p = buildConceptPrompt({ topic: 'x', existingDomains: ['History', 'Science'] });
    expect(p).toContain('existing domains if it fits: History, Science');
  });
});

describe('parsePastedPack', () => {
  it('parses bare JSON', () => {
    expect(parsePastedPack(JSON_TEXT).concepts[0].title).toBe('The Silk Road');
  });

  it('parses a fenced block with chatter around it', () => {
    const text = `Sure! Here you go:\n\n\`\`\`json\n${JSON_TEXT}\n\`\`\`\n\nLet me know if you want more.`;
    expect(parsePastedPack(text).domains[0].name).toBe('History');
  });

  it('tolerates curly quotes', () => {
    const curly = JSON_TEXT.replace(/"/g, '”');
    // every quote swapped → structure still recoverable after normalization
    expect(parsePastedPack(curly).concepts).toHaveLength(1);
  });

  it('rejects empty input in plain language', () => {
    expect(() => parsePastedPack('   ')).toThrow(/paste/i);
  });

  it('rejects text with no JSON', () => {
    expect(() => parsePastedPack('I could not do that')).toThrow(/No JSON found/);
  });

  it('flags truncated output', () => {
    expect(() => parsePastedPack(JSON_TEXT.slice(0, 40))).toThrow(/cut off|valid JSON/);
  });

  it('passes through validation errors for wrong packs', () => {
    expect(() => parsePastedPack('{"type":"other"}')).toThrow(/Vault Pack/);
  });
});

describe('buildConceptPrompt — sources and details', () => {
  it('book: sets sourceType/sourceTitle and warns against invention', () => {
    const p = buildConceptPrompt({ topic: 'Atomic Habits', kind: 'book' });
    expect(p).toContain('BASED ON THE BOOK: Atomic Habits');
    expect(p).toContain('"sourceType": "book",\n      "sourceTitle": "Atomic Habits"');
    expect(p).toContain('Do NOT invent chapters');
  });

  it('course: sourceType course', () => {
    const p = buildConceptPrompt({ topic: 'CS50', kind: 'course' });
    expect(p).toContain('"sourceType": "course"');
  });

  it('topic with details: includes must-cover block, stays manual, no sourceTitle', () => {
    const p = buildConceptPrompt({ topic: 'Stoicism', details: 'focus on dichotomy of control' });
    expect(p).toContain('WHAT I WANT COVERED');
    expect(p).toContain('focus on dichotomy of control');
    expect(p).toContain('"sourceType": "manual"');
    expect(p).not.toContain('sourceTitle');
    expect(p).not.toContain('Do NOT invent chapters');
  });

  it('notes: notes become the primary source, sourceType note', () => {
    const p = buildConceptPrompt({ topic: 'My reading', kind: 'notes', details: 'ch1: cues matter' });
    expect(p).toContain('MY NOTES (primary source');
    expect(p).toContain('ch1: cues matter');
    expect(p).toContain('"sourceType": "note"');
  });

  it('book with details: both the honesty line and must-cover block appear', () => {
    const p = buildConceptPrompt({ topic: 'Sapiens', kind: 'book', details: 'the cognitive revolution' });
    expect(p).toContain('the cognitive revolution');
    expect(p).toContain('Do NOT invent chapters');
  });
});
