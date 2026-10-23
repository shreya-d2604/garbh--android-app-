// Manual prescription entry (PLAN.md §5.2 prescription_items, §7.4 #4). Pure helpers.
import { addDays, isISODate, type ISODate } from '@/domain/pregnancy-math';
import type { TablesInsert } from '@/types/database';

import { textOrNull } from './format';
import type { ConsultationRow, DrugRow, PrescriptionItemRow } from './types';

/** Values stored exactly as written on the prescription (clinical data, not UI chrome). */
export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Drops',
  'Cream',
  'Powder',
] as const;
export const ROUTES = ['Oral', 'IV', 'IM', 'Topical', 'Vaginal', 'Sublingual'] as const;
export const TIMING_OPTIONS = [
  'Before food',
  'After food',
  'With food',
  'At bedtime',
  'Any time',
] as const;
export const FREQUENCY_PRESETS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', 'SOS'] as const;

export interface PrescriptionFormRow {
  /** Stable React key; never sent to the database. */
  key: string;
  /** Database id once saved, null for a new row. */
  id: string | null;
  drug_name: string;
  strength: string;
  dosage_form: string;
  dose: string;
  frequency: string;
  timing: string;
  route: string;
  duration_days: string;
  start_date: string;
  instructions: string;
}

export function newPrescriptionRow(key: string, today: ISODate): PrescriptionFormRow {
  return {
    key,
    id: null,
    drug_name: '',
    strength: '',
    dosage_form: 'Tablet',
    dose: '',
    frequency: '',
    timing: '',
    route: 'Oral',
    duration_days: '',
    start_date: today,
    instructions: '',
  };
}

export function rowFromItem(item: PrescriptionItemRow): PrescriptionFormRow {
  return {
    key: item.id,
    id: item.id,
    drug_name: item.drug_name,
    strength: item.strength ?? '',
    dosage_form: item.dosage_form ?? '',
    dose: item.dose ?? '',
    frequency: item.frequency ?? '',
    timing: item.timing ?? '',
    route: item.route ?? '',
    duration_days: item.duration_days == null ? '' : String(item.duration_days),
    start_date: item.start_date ?? '',
    instructions: item.instructions ?? '',
  };
}

/** A row with nothing worth saving (the doctor added it and left it empty). */
export function isRowBlank(row: PrescriptionFormRow): boolean {
  return (
    row.drug_name.trim() === '' &&
    row.strength.trim() === '' &&
    row.dose.trim() === '' &&
    row.frequency.trim() === '' &&
    row.duration_days.trim() === '' &&
    row.instructions.trim() === ''
  );
}

const FREQ_NUMERIC = /^\d+(\.\d+)?(-\d+(\.\d+)?){1,3}$/;
const FREQ_ABBREV = /^(sos|prn|stat|od|bd|bid|tds|tid|qid|hs)$/i;

export function isValidFrequency(value: string): boolean {
  const v = value.trim();
  return v === '' || FREQ_NUMERIC.test(v) || FREQ_ABBREV.test(v);
}

export function parseDuration(value: string): number | null {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 365 ? n : null;
}

/** Mirrors the generated column: end_date = start_date + (duration_days - 1). */
export function endDate(start: string, duration: string): ISODate | null {
  const days = parseDuration(duration);
  return days !== null && isISODate(start) ? addDays(start, days - 1) : null;
}

export type RowErrorField = 'drug_name' | 'frequency' | 'duration_days' | 'start_date';

/** Field -> i18n key (namespace doctor). Blank rows have no errors (they are dropped on save). */
export function validateRow(row: PrescriptionFormRow): Partial<Record<RowErrorField, string>> {
  if (isRowBlank(row)) return {};
  const errors: Partial<Record<RowErrorField, string>> = {};
  if (row.drug_name.trim() === '') errors.drug_name = 'validation.drugRequired';
  if (!isValidFrequency(row.frequency)) errors.frequency = 'validation.frequency';
  if (row.duration_days.trim() !== '' && parseDuration(row.duration_days) === null)
    errors.duration_days = 'validation.duration';
  if (row.start_date.trim() !== '' && !isISODate(row.start_date))
    errors.start_date = 'validation.date';
  return errors;
}

export function toItemInsert(
  row: PrescriptionFormRow,
  consultationId: string,
  pregnancyId: string,
): TablesInsert<'prescription_items'> {
  const id = row.id ?? row.key;
  return {
    id,
    consultation_id: consultationId,
    pregnancy_id: pregnancyId,
    drug_name: row.drug_name.trim(),
    strength: textOrNull(row.strength),
    dosage_form: textOrNull(row.dosage_form),
    dose: textOrNull(row.dose),
    frequency: textOrNull(row.frequency),
    timing: textOrNull(row.timing),
    route: textOrNull(row.route),
    duration_days: parseDuration(row.duration_days),
    start_date: isISODate(row.start_date) ? row.start_date : null,
    instructions: textOrNull(row.instructions),
  };
}

/**
 * "Copy from last visit": new rows (no ids) for the previous prescription, starting today.
 * Rows that were stopped are not copied.
 */
export function copyFromPrevious(
  items: readonly PrescriptionItemRow[],
  today: ISODate,
  newKey: () => string,
): PrescriptionFormRow[] {
  return items
    .filter((i) => i.stopped_at === null)
    .map((i) => ({ ...rowFromItem(i), key: newKey(), id: null, start_date: today }));
}

/** Items of the most recent consultation (other than `excludeConsultationId`) that has any. */
export function pickLastPrescription(
  items: readonly PrescriptionItemRow[],
  consultations: readonly Pick<ConsultationRow, 'id' | 'created_at'>[],
  excludeConsultationId: string | null,
): PrescriptionItemRow[] {
  const withItems = consultations
    .filter((c) => c.id !== excludeConsultationId && items.some((i) => i.consultation_id === c.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last = withItems[0];
  return last ? items.filter((i) => i.consultation_id === last.id) : [];
}

/** Active today: not stopped and today falls between start and end date. */
export function isActiveToday(
  item: Pick<PrescriptionItemRow, 'stopped_at' | 'start_date' | 'end_date'>,
  today: ISODate,
): boolean {
  if (item.stopped_at) return false;
  if (item.start_date && item.start_date > today) return false;
  if (item.end_date && item.end_date < today) return false;
  return true;
}

/** Autocomplete from the drug catalog: name or generic contains the text, best matches first. */
export function suggestDrugs(catalog: readonly DrugRow[], text: string, limit = 5): DrugRow[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return catalog
    .filter((d) => d.is_active)
    .map((d) => {
      const name = d.name.toLowerCase();
      const generic = (d.generic ?? '').toLowerCase();
      const rank = name.startsWith(q)
        ? 0
        : generic.startsWith(q)
          ? 1
          : name.includes(q) || generic.includes(q)
            ? 2
            : 3;
      return { d, rank };
    })
    .filter((x) => x.rank < 3 && x.d.name.toLowerCase() !== q)
    .sort((a, b) => a.rank - b.rank || a.d.name.localeCompare(b.d.name))
    .slice(0, limit)
    .map((x) => x.d);
}
