// Prescriptions (PLAN.md §7.2 #7, #1): today's medicines and history per published consultation.
import type { ISODate } from '@/domain/pregnancy-math';

import type { Consultation, PrescriptionItem } from './types';

type DatedItem = Pick<PrescriptionItem, 'is_active' | 'stopped_at' | 'start_date' | 'end_date'>;

/** Active (not stopped) and `today` falls inside start_date..end_date (open-ended when unset). */
export function isActiveOn(item: DatedItem, today: ISODate): boolean {
  if (item.is_active === false || item.stopped_at) return false;
  if (item.start_date && item.start_date > today) return false;
  if (item.end_date && item.end_date < today) return false;
  return true;
}

export function todaysMedicines<T extends DatedItem>(items: T[], today: ISODate): T[] {
  return items.filter((i) => isActiveOn(i, today));
}

export type DaySlot = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Reads a "1-0-1" style frequency as times of day (morning-afternoon-night, or four parts with
 * evening). Anything else returns null: the doctor's text is always shown as written.
 */
export function frequencyHint(frequency: string | null | undefined): DaySlot[] | null {
  const parts = frequency?.trim().split('-');
  if (!parts || (parts.length !== 3 && parts.length !== 4)) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const names: DaySlot[] =
    parts.length === 3
      ? ['morning', 'afternoon', 'night']
      : ['morning', 'afternoon', 'evening', 'night'];
  const slots = names.filter((_, i) => Number(parts[i]) > 0);
  return slots.length > 0 ? slots : null;
}

export interface PrescriptionGroup {
  consultation: Consultation;
  items: PrescriptionItem[];
}

/** One group per published consultation (newest first) with its medicines. */
export function groupPrescriptions(
  consultations: Consultation[],
  items: PrescriptionItem[],
): PrescriptionGroup[] {
  const stamp = (c: Consultation) => c.published_at ?? c.created_at;
  return consultations
    .filter((c) => c.published_at != null)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .map((consultation) => ({
      consultation,
      items: items
        .filter((i) => i.consultation_id === consultation.id)
        .sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) || a.drug_name.localeCompare(b.drug_name),
        ),
    }))
    .filter((g) => g.items.length > 0 || g.consultation.advice || g.consultation.diet_advice);
}
