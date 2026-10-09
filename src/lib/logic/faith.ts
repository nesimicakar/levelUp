import type { UserSettings } from '@/types';

export type FaithTradition = NonNullable<UserSettings['faithTradition']>;

export const FAITH_TRADITIONS: { id: FaithTradition; label: string }[] = [
  { id: 'islam', label: 'ISLAM' },
  { id: 'christianity', label: 'CHRISTIANITY' },
  { id: 'judaism', label: 'JUDAISM' },
  { id: 'meditation', label: 'MEDITATION' },
  { id: 'custom', label: 'CUSTOM' },
];

// Starting points for non-Islam traditions. Everything here is editable in Settings,
// because practice varies a lot within each tradition.
interface Preset {
  prayersPerDay: number;
  practiceName: string;
  practiceShort: string;
  scriptureEnabled: boolean;
  scriptureName: string;
  scriptureUnit: string;
}

const PRESETS: Record<Exclude<FaithTradition, 'islam'>, Preset> = {
  christianity: { prayersPerDay: 1, practiceName: 'Prayers', practiceShort: 'PRAY', scriptureEnabled: true, scriptureName: 'Bible', scriptureUnit: 'chapters' },
  judaism: { prayersPerDay: 3, practiceName: 'Prayers', practiceShort: 'PRAY', scriptureEnabled: true, scriptureName: 'Torah', scriptureUnit: 'chapters' },
  // Meditation has no holy book: one session a day, reading off by default.
  meditation: { prayersPerDay: 1, practiceName: 'Meditation', practiceShort: 'MEDIT', scriptureEnabled: false, scriptureName: 'Reading', scriptureUnit: 'pages' },
  custom: { prayersPerDay: 1, practiceName: 'Prayers', practiceShort: 'PRAY', scriptureEnabled: true, scriptureName: 'Scripture', scriptureUnit: 'pages' },
};

export const MIN_PRAYERS_PER_DAY = 1;
export const MAX_PRAYERS_PER_DAY = 10;

export interface FaithConfig {
  tradition: FaithTradition;
  /** Name of the daily practice: "Prayers" (default) or e.g. "Meditation". */
  practiceName: string;
  /** Short form for compact labels, e.g. "PRAY". */
  practiceShort: string;
  /** Practice units (prayers / sessions) needed per day to count as met. */
  prayersPerDay: number;
  /** Whether the daily scripture/reading part is required and shown. */
  scriptureEnabled: boolean;
  /** e.g. "Quran", "Bible". */
  scriptureName: string;
  /** e.g. "pages", "chapters". */
  scriptureUnit: string;
  /** Short unit for compact steppers, e.g. "pg". */
  scriptureUnitShort: string;
  /** Daily scripture target, in `scriptureUnit`. Stored in the legacy `quranPagesPerDay` field. */
  scriptureTarget: number;
  /** Nafile (voluntary prayer) tracking is Islam-specific. */
  showNafile: boolean;
}

type FaithSettings = Pick<
  UserSettings,
  | 'faithTradition' | 'faithPrayersPerDay' | 'faithPracticeName' | 'faithScriptureEnabled'
  | 'faithScriptureName' | 'faithScriptureUnit' | 'quranPagesPerDay'
>;

/**
 * Single source of truth for the PER spirituality block.
 *
 * Islam is the original behaviour and is returned exactly as before: 5 prayers, Quran
 * pages, nafile on. An unset tradition means Islam, so existing users see no change.
 * Stored logs (`prayersCount`, `quranPages`) and their `completed` flags are never touched.
 */
export function getFaithConfig(settings: Partial<FaithSettings> | null | undefined): FaithConfig {
  const tradition = settings?.faithTradition ?? 'islam';
  const scriptureTarget = Math.max(1, settings?.quranPagesPerDay ?? 1);

  if (tradition === 'islam') {
    return {
      tradition,
      practiceName: 'Prayers',
      practiceShort: 'PRAY',
      prayersPerDay: 5,
      scriptureEnabled: true,
      scriptureName: 'Quran',
      scriptureUnit: 'pages',
      scriptureUnitShort: 'pg',
      scriptureTarget,
      showNafile: true,
    };
  }

  const preset = PRESETS[tradition];
  const name = settings?.faithScriptureName?.trim() || preset.scriptureName;
  const unit = settings?.faithScriptureUnit?.trim() || preset.scriptureUnit;
  const prayers = Math.round(settings?.faithPrayersPerDay ?? preset.prayersPerDay);
  const customPractice = settings?.faithPracticeName?.trim();
  return {
    tradition,
    practiceName: customPractice || preset.practiceName,
    practiceShort: customPractice ? customPractice.slice(0, 5).toUpperCase() : preset.practiceShort,
    scriptureEnabled: settings?.faithScriptureEnabled ?? preset.scriptureEnabled,
    prayersPerDay: Math.min(MAX_PRAYERS_PER_DAY, Math.max(MIN_PRAYERS_PER_DAY, prayers)),
    scriptureName: name,
    scriptureUnit: unit,
    scriptureUnitShort: unit.slice(0, 3).toLowerCase(),
    scriptureTarget,
    showNafile: false,
  };
}

/** "Quran Pages", "Bible Chapters" — for totals/labels. */
export function scriptureTitle(cfg: FaithConfig): string {
  const unit = cfg.scriptureUnit.charAt(0).toUpperCase() + cfg.scriptureUnit.slice(1);
  return `${cfg.scriptureName} ${unit}`;
}
