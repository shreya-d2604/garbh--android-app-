// Small text helpers shared by patient screens.
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { GestationalAge } from '@/domain/pregnancy-math';

/**
 * Plural-aware translation without relying on Intl.PluralRules: looks up `<key>_one` for 1 and
 * `<key>_other` otherwise, both receiving `{{n}}`.
 */
export function usePlural() {
  const { t } = useTranslation('patient');
  return useCallback(
    (key: string, n: number, options: Record<string, unknown> = {}) =>
      t(n === 1 ? `${key}_one` : `${key}_other`, { ...options, n }),
    [t],
  );
}

/** Ordinal trimester key suffix: 1 -> "1" (translated as "1st Trimester", ...). */
export function trimesterKey(ga: Pick<GestationalAge, 'trimester'>): string {
  return `trimester.${ga.trimester}`;
}

/** "papaya" -> "a papaya", "Avocado" -> "an avocado". */
export function withArticle(noun: string): string {
  const word = noun.trim().toLowerCase();
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}

/** "Week 22 + 3 days" / "Week 22" (no days). */
export function useGaLabel() {
  const { t } = useTranslation('patient');
  const plural = usePlural();
  return useCallback(
    (weeks: number, days: number) =>
      days === 0 ? t('journey.weekOnly', { weeks }) : plural('journey.weekDays', days, { weeks }),
    [t, plural],
  );
}
