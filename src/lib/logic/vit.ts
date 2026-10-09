import { db } from '@/lib/db';
import type { PostureExercise, UserSettings } from '@/types';

/** Minimum daily posture block, in minutes. The routine below is sized to this. */
export const POSTURE_MIN_MINUTES = 5;

/** Default ~5 minute desk-posture routine. Users can edit/replace it in the VIT page. */
export const DEFAULT_POSTURE_ROUTINE: PostureExercise[] = [
  { id: 'cat-cow', name: 'Cat–cow', duration: '1 min', tip: 'On hands and knees, slowly arch and round your spine with your breath.' },
  { id: 'chin-tucks', name: 'Chin tucks', duration: '10 reps', tip: 'Pull your head straight back as if making a double chin. Hold 3 seconds.' },
  { id: 'wall-angels', name: 'Wall angels', duration: '1 min', tip: 'Back flat on a wall, slide your arms up and down like a snow angel.' },
  { id: 'thoracic-open-book', name: 'Thoracic open book', duration: '30 s / side', tip: 'Lie on your side, knees bent, and rotate your top arm open to the floor behind you.' },
  { id: 'hip-flexor', name: 'Hip flexor stretch', duration: '30 s / side', tip: 'Half-kneeling lunge, squeeze the glute of the back leg and shift forward.' },
];

/** Saved routine if the user has customised it, otherwise the defaults. */
export function getPostureRoutine(settings: Pick<UserSettings, 'vitPostureRoutine'> | null | undefined): PostureExercise[] {
  return settings?.vitPostureRoutine ?? DEFAULT_POSTURE_ROUTINE;
}

export interface VitInputs {
  sleepHours: number;
  proteinMet: boolean;
  postureMet: boolean;
}

/** A day is complete only when all three protocols are met. */
export function isVitComplete({ sleepHours, proteinMet, postureMet }: VitInputs): boolean {
  return sleepHours >= 7 && proteinMet && postureMet;
}

/** Upserts the single VitLog for `date`. Looks the row up by date rather than trusting
 *  caller state, so repeated calls never create duplicate rows. */
export async function saveVitLog(date: string, inputs: VitInputs): Promise<void> {
  const fields = {
    sleepHours: inputs.sleepHours,
    proteinGoalMet: inputs.proteinMet,
    postureMobilityMet: inputs.postureMet,
    completed: isVitComplete(inputs),
  };
  const existing = await db.vitLogs.where('date').equals(date).first();
  if (existing?.id) {
    await db.vitLogs.update(existing.id, fields);
  } else {
    await db.vitLogs.add({ date, ...fields, createdAt: Date.now() });
  }
}
