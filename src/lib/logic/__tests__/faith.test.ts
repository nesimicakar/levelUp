import { describe, it, expect } from 'vitest';
import { getFaithConfig, scriptureTitle } from '../faith';
import { isPerComplete } from '../per';
import { computePerDomainProgress } from '../levels';
import type { UserSettings } from '@/types';

const base = (over: Partial<UserSettings> = {}) =>
  ({ enableSpirituality: true, dailyReadingMinutesTarget: 5, quranPagesPerDay: 2, ...over }) as UserSettings;

describe('getFaithConfig', () => {
  it('Islam (and unset) is exactly the original behaviour', () => {
    for (const s of [{ quranPagesPerDay: 2 }, { faithTradition: 'islam' as const, quranPagesPerDay: 2 }, null, undefined]) {
      const c = getFaithConfig(s);
      expect(c).toMatchObject({ tradition: 'islam', prayersPerDay: 5, scriptureName: 'Quran', scriptureUnit: 'pages', showNafile: true });
    }
    expect(getFaithConfig({ quranPagesPerDay: 3 }).scriptureTarget).toBe(3);
    expect(scriptureTitle(getFaithConfig(undefined))).toBe('Quran Pages');
  });

  it('Islam ignores non-Islam overrides left in settings', () => {
    const c = getFaithConfig({ faithTradition: 'islam', faithPrayersPerDay: 2, faithScriptureName: 'Bible' });
    expect(c.prayersPerDay).toBe(5);
    expect(c.scriptureName).toBe('Quran');
  });

  it('other traditions get editable presets and no nafile', () => {
    expect(getFaithConfig({ faithTradition: 'christianity' })).toMatchObject({ prayersPerDay: 1, scriptureName: 'Bible', scriptureUnit: 'chapters', showNafile: false });
    expect(getFaithConfig({ faithTradition: 'judaism' })).toMatchObject({ prayersPerDay: 3, scriptureName: 'Torah' });
    expect(getFaithConfig({ faithTradition: 'custom' })).toMatchObject({ scriptureName: 'Scripture' });
  });

  it('applies overrides, falls back when blank, and clamps prayers', () => {
    expect(getFaithConfig({ faithTradition: 'custom', faithScriptureName: 'Gita', faithScriptureUnit: 'verses', faithPrayersPerDay: 2 }))
      .toMatchObject({ scriptureName: 'Gita', scriptureUnit: 'verses', prayersPerDay: 2, scriptureUnitShort: 'ver' });
    expect(getFaithConfig({ faithTradition: 'judaism', faithScriptureName: '  ' }).scriptureName).toBe('Torah');
    expect(getFaithConfig({ faithTradition: 'custom', faithPrayersPerDay: 0 }).prayersPerDay).toBe(1);
    expect(getFaithConfig({ faithTradition: 'custom', faithPrayersPerDay: 99 }).prayersPerDay).toBe(10);
  });

  it('meditation: one session a day, no scripture, named Meditation', () => {
    expect(getFaithConfig({ faithTradition: 'meditation' })).toMatchObject({
      practiceName: 'Meditation', practiceShort: 'MEDIT', prayersPerDay: 1, scriptureEnabled: false, showNafile: false,
    });
  });

  it('practice name and reading toggle are overridable; Islam ignores them', () => {
    const c = getFaithConfig({ faithTradition: 'custom', faithPracticeName: 'Yoga', faithScriptureEnabled: false });
    expect(c).toMatchObject({ practiceName: 'Yoga', practiceShort: 'YOGA', scriptureEnabled: false });
    expect(getFaithConfig({ faithTradition: 'meditation', faithScriptureEnabled: true }).scriptureEnabled).toBe(true);
    expect(getFaithConfig({ faithTradition: 'islam', faithPracticeName: 'Yoga', faithScriptureEnabled: false }))
      .toMatchObject({ practiceName: 'Prayers', scriptureEnabled: true });
  });

  it('scripture target always uses the legacy quranPagesPerDay field', () => {
    expect(getFaithConfig({ faithTradition: 'christianity', quranPagesPerDay: 4 }).scriptureTarget).toBe(4);
  });
});

describe('PER completion follows the faith config', () => {
  it('Islam still needs 5 prayers and the scripture target', () => {
    const s = base();
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 5, quranPages: 2 }, s)).toBe(true);
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 4, quranPages: 2 }, s)).toBe(false);
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 5, quranPages: 1 }, s)).toBe(false);
  });

  it('Judaism needs 3 prayers, not 5', () => {
    const s = base({ faithTradition: 'judaism' });
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 3, quranPages: 2 }, s)).toBe(true);
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 2, quranPages: 2 }, s)).toBe(false);
  });

  it('meditation is complete with reading + one session, no scripture needed', () => {
    const s = base({ faithTradition: 'meditation' });
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 1, quranPages: 0 }, s)).toBe(true);
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 0, quranPages: 0 }, s)).toBe(false);
    // re-enabling the reading makes it required again
    expect(isPerComplete({ readingMinutes: 5, prayersCount: 1, quranPages: 0 }, base({ faithTradition: 'meditation', faithScriptureEnabled: true }))).toBe(false);
  });

  it('spirituality off is unaffected by tradition', () => {
    expect(isPerComplete({ readingMinutes: 5 }, base({ enableSpirituality: false, faithTradition: 'judaism' }))).toBe(true);
  });

  it('domain progress defaults to 5 prayers and scales with a custom target', () => {
    expect(computePerDomainProgress(true, 5, 5, 5, 2, 2)).toBe(1);
    expect(computePerDomainProgress(true, 5, 5, 3, 2, 2)).toBeCloseTo((1 + 3 / 5 + 1) / 3);
    expect(computePerDomainProgress(true, 5, 5, 3, 2, 2, 3)).toBe(1);
    // scripture off: average over reading + practice only
    expect(computePerDomainProgress(true, 5, 5, 1, 0, 2, 1, false)).toBe(1);
    expect(computePerDomainProgress(true, 5, 5, 0, 0, 2, 1, false)).toBe(0.5);
  });
});
