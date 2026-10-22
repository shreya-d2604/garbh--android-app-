// Small display helpers shared by the doctor screens (pure, unit-tested).
import {
  diffDays,
  gestationalAge,
  isISODate,
  type GestationalAge,
  type ISODate,
} from '@/domain/pregnancy-math';

import type { PregnancyRow } from './types';

/** "24w 3d" */
export function formatGa(ga: Pick<GestationalAge, 'weeks' | 'days'>): string {
  return `${ga.weeks}w ${ga.days}d`;
}

/** GA from a pregnancy's due date, or null when it has none yet. */
export function gaFromEdd(edd: string | null | undefined, today: ISODate): GestationalAge | null {
  return edd && isISODate(edd) ? gestationalAge(edd, today) : null;
}

/** Whole years between dob and today; null for a missing or invalid dob. */
export function ageInYears(dob: string | null | undefined, today: ISODate): number | null {
  if (!dob || !isISODate(dob)) return null;
  const days = diffDays(today, dob);
  if (days < 0) return null;
  const [dy, dm, dd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let years = (ty ?? 0) - (dy ?? 0);
  if ((tm ?? 0) < (dm ?? 0) || ((tm ?? 0) === (dm ?? 0) && (td ?? 0) < (dd ?? 0))) years -= 1;
  return years;
}

/** "G2 P1 A0 L1"; unknown values are shown as a dash. */
export function formatGpal(p: Pick<PregnancyRow, 'gravida' | 'para' | 'abortus' | 'living'>): string {
  const v = (n: number | null) => (n == null ? '-' : String(n));
  return `G${v(p.gravida)} P${v(p.para)} A${v(p.abortus)} L${v(p.living)}`;
}

/** Splits "a, b\nc" into trimmed, de-duplicated, non-empty items (allergies, tests, factors). */
export function parseList(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const item = part.trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function joinList(items: readonly string[] | null | undefined): string {
  return (items ?? []).join(', ');
}

/** Empty or whitespace-only text becomes null (for nullable text columns). */
export function textOrNull(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  return t === '' ? null : t;
}
