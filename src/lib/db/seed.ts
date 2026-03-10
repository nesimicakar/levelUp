import { db, getCourseProgress } from './index';

export async function seedIfNeeded(): Promise<void> {
  // Ensure course progress baseline exists
  await getCourseProgress('real-estate');
  await getCourseProgress('stage-academy');

  // Ensure settings exist
  const settings = await db.settings.toCollection().first();
  if (!settings) {
    await db.settings.add({
      readingPagesPerDay: 20,
      learningMinutesPerDay: 20,
      courseUnitsPerDay: 4,
      lessonsPerDay: 2,
      quranPagesPerDay: 1,
      proteinGoalGrams: 130,
      hydrationGoalLiters: 2.0,
      agiActivityType: 'Rowing',
      agiMinMinutes: 10,
      strUpperIncrement: 5,
      strLowerIncrement: 10,
      hasOnboarded: false,
      enableSpirituality: false,
      exerciseNames: {},
    });
  }
}
