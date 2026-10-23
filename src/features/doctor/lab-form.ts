// Manual lab value entry and editing (PLAN.md §5.2 lab_results, §7.4 #5). Pure.
import { z } from 'zod';

import type { TablesInsert, TablesUpdate } from '@/types/database';

import { textOrNull } from './format';
import type { LabResultRow, LabTestRow } from './types';

export interface LabFormValues {
  test_code: string;
  value: string;
  unit: string;
}

export const labFormSchema = z.object({
  test_code: z.string().min(1, { error: 'validation.required' }),
  value: z.string().trim().min(1, { error: 'validation.required' }),
  unit: z.string(),
});

/** "10.2" -> number; anything else ("Negative", "Reactive") is kept as text. */
export function parseLabValue(text: string): { num: number | null; text: string | null } {
  const t = text.trim();
  if (/^-?\d+([.,]\d+)?$/.test(t)) return { num: Number(t.replace(',', '.')), text: null };
  return { num: null, text: t === '' ? null : t };
}

/** Flag against the reference range; null when the value is not numeric or there is no range. */
export function labFlag(
  value: number | null,
  low: number | null,
  high: number | null,
): LabResultRow['flag'] {
  if (value === null) return null;
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  return low !== null || high !== null ? 'normal' : null;
}

type LabFields = Pick<
  TablesInsert<'lab_results'>,
  'test_code' | 'value_num' | 'value_text' | 'unit' | 'ref_low' | 'ref_high' | 'flag'
>;

/** Fields for a manual value, taking unit and reference range from the catalog test. */
export function labFields(
  values: LabFormValues,
  test: Pick<LabTestRow, 'unit' | 'ref_low' | 'ref_high'> | undefined,
): LabFields {
  const v = parseLabValue(values.value);
  const low = test?.ref_low ?? null;
  const high = test?.ref_high ?? null;
  return {
    test_code: values.test_code,
    value_num: v.num,
    value_text: v.text,
    unit: textOrNull(values.unit) ?? test?.unit ?? null,
    ref_low: low,
    ref_high: high,
    flag: labFlag(v.num, low, high),
  };
}

export function labPatch(
  values: LabFormValues,
  test: Pick<LabTestRow, 'unit' | 'ref_low' | 'ref_high'> | undefined,
): TablesUpdate<'lab_results'> {
  return labFields(values, test);
}

export function labFormFromRow(
  r: Pick<LabResultRow, 'test_code' | 'value_num' | 'value_text' | 'unit'>,
): LabFormValues {
  return {
    test_code: r.test_code ?? '',
    value: r.value_num != null ? String(r.value_num) : (r.value_text ?? ''),
    unit: r.unit ?? '',
  };
}

export type LabTone = 'success' | 'warning' | 'danger' | 'neutral';

export function flagTone(flag: LabResultRow['flag']): LabTone {
  switch (flag) {
    case 'normal':
      return 'success';
    case 'low':
    case 'high':
      return 'warning';
    case 'abnormal':
      return 'danger';
    default:
      return 'neutral';
  }
}
