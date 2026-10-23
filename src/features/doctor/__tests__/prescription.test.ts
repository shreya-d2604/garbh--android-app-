import {
  copyFromPrevious,
  endDate,
  isActiveToday,
  isRowBlank,
  isValidFrequency,
  newPrescriptionRow,
  parseDuration,
  pickLastPrescription,
  rowFromItem,
  suggestDrugs,
  toItemInsert,
  validateRow,
} from '../prescription';
import type { DrugRow, PrescriptionItemRow } from '../types';

const TODAY = '2026-09-20';

const item = (over: Partial<PrescriptionItemRow>): PrescriptionItemRow => ({
  id: 'i1',
  consultation_id: 'c1',
  pregnancy_id: 'p1',
  drug_name: 'Ferrous ascorbate',
  strength: '100 mg',
  dosage_form: 'Tablet',
  dose: '1 tablet',
  frequency: '0-1-0',
  timing: 'After food',
  route: 'Oral',
  duration_days: 30,
  start_date: '2026-08-01',
  end_date: '2026-08-30',
  instructions: null,
  stopped_at: null,
  is_active: true,
  created_at: '2026-08-01T10:00:00Z',
  ...over,
});

const drug = (name: string, generic: string | null = null, active = true): DrugRow => ({
  id: name,
  name,
  generic,
  common_strengths: ['500 mg'],
  pregnancy_caution_note: null,
  is_active: active,
});

describe('prescription rows', () => {
  it('starts with sensible defaults', () => {
    expect(newPrescriptionRow('k1', TODAY)).toMatchObject({
      key: 'k1',
      id: null,
      drug_name: '',
      route: 'Oral',
      dosage_form: 'Tablet',
      start_date: TODAY,
    });
  });

  it('treats untouched rows as blank (dropped on save) but not rows with a drug name', () => {
    const row = newPrescriptionRow('k', TODAY);
    expect(isRowBlank(row)).toBe(true);
    expect(isRowBlank({ ...row, drug_name: 'Folic acid' })).toBe(false);
    expect(isRowBlank({ ...row, instructions: 'x' })).toBe(false);
  });

  it('computes end date like the generated column: start + duration - 1', () => {
    expect(endDate('2026-09-20', '30')).toBe('2026-10-19');
    expect(endDate('2026-09-20', '1')).toBe('2026-09-20');
    expect(endDate('2026-09-20', '')).toBeNull();
    expect(endDate('bad', '5')).toBeNull();
  });

  it('parses durations between 1 and 365 days', () => {
    expect(parseDuration('7')).toBe(7);
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('366')).toBeNull();
    expect(parseDuration('2.5')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('accepts 1-0-1 style frequencies and common abbreviations', () => {
    for (const ok of ['', '1-0-1', '0-1-0', '1-1-1-1', '0.5-0-0.5', 'SOS', 'bd', 'OD']) {
      expect(isValidFrequency(ok)).toBe(true);
    }
    for (const bad of ['1', 'twice', 'a-b-c', '1--1', '1-0-1-0-1']) {
      expect(isValidFrequency(bad)).toBe(false);
    }
  });

  it('validates a row only when it is not blank', () => {
    const row = newPrescriptionRow('k', TODAY);
    expect(validateRow(row)).toEqual({});
    expect(validateRow({ ...row, strength: '5 mg' })).toEqual({
      drug_name: 'validation.drugRequired',
    });
    expect(
      validateRow({
        ...row,
        drug_name: 'X',
        frequency: 'bad',
        duration_days: '0',
        start_date: 'nope',
      }),
    ).toEqual({
      frequency: 'validation.frequency',
      duration_days: 'validation.duration',
      start_date: 'validation.date',
    });
    expect(
      validateRow({ ...row, drug_name: 'X', frequency: '1-0-1', duration_days: '30' }),
    ).toEqual({});
  });

  it('maps a row to an insert payload with trimmed text and nulls for blanks', () => {
    const row = {
      ...newPrescriptionRow('k9', TODAY),
      drug_name: ' Folic acid ',
      strength: '5 mg',
      frequency: '1-0-0',
      duration_days: '30',
      instructions: '  ',
    };
    expect(toItemInsert(row, 'c1', 'p1')).toMatchObject({
      id: 'k9',
      consultation_id: 'c1',
      pregnancy_id: 'p1',
      drug_name: 'Folic acid',
      strength: '5 mg',
      duration_days: 30,
      start_date: TODAY,
      instructions: null,
      dose: null,
    });
    expect(toItemInsert({ ...row, id: 'db-id' }, 'c1', 'p1').id).toBe('db-id');
  });

  it('round-trips a database item into a form row', () => {
    expect(rowFromItem(item({ strength: null }))).toMatchObject({
      id: 'i1',
      key: 'i1',
      strength: '',
      duration_days: '30',
    });
  });
});

describe('copy from last visit', () => {
  it('copies rows as new, starting today, skipping stopped ones', () => {
    let n = 0;
    const rows = copyFromPrevious(
      [
        item({ id: 'a' }),
        item({ id: 'b', stopped_at: '2026-09-01T00:00:00Z' }),
        item({ id: 'c', drug_name: 'Calcium' }),
      ],
      TODAY,
      () => `new-${++n}`,
    );
    expect(rows.map((r) => [r.key, r.id, r.drug_name, r.start_date])).toEqual([
      ['new-1', null, 'Ferrous ascorbate', TODAY],
      ['new-2', null, 'Calcium', TODAY],
    ]);
    expect(rows[0]?.duration_days).toBe('30');
  });

  it('picks the most recent other consultation that has prescriptions', () => {
    const consultations = [
      { id: 'c1', created_at: '2026-07-01T00:00:00Z' },
      { id: 'c2', created_at: '2026-08-01T00:00:00Z' },
      { id: 'c3', created_at: '2026-09-01T00:00:00Z' }, // current, excluded
      { id: 'c4', created_at: '2026-08-15T00:00:00Z' }, // newer than c2 but no items
    ];
    const items = [
      item({ id: 'a', consultation_id: 'c1' }),
      item({ id: 'b', consultation_id: 'c2' }),
      item({ id: 'c', consultation_id: 'c2', drug_name: 'Calcium' }),
      item({ id: 'd', consultation_id: 'c3' }),
    ];
    expect(pickLastPrescription(items, consultations, 'c3').map((i) => i.id)).toEqual(['b', 'c']);
    expect(pickLastPrescription([], consultations, null)).toEqual([]);
  });

  it('knows what is active today', () => {
    expect(isActiveToday(item({ end_date: '2026-10-01' }), TODAY)).toBe(true);
    expect(isActiveToday(item({ end_date: '2026-09-19' }), TODAY)).toBe(false);
    expect(isActiveToday(item({ start_date: '2026-09-21', end_date: '2026-10-20' }), TODAY)).toBe(
      false,
    );
    expect(isActiveToday(item({ stopped_at: '2026-09-10T00:00:00Z' }), TODAY)).toBe(false);
  });
});

describe('drug autocomplete', () => {
  const catalog = [
    drug('Folic acid', 'Folic acid'),
    drug('Ferrous ascorbate'),
    drug('Calcium carbonate', 'Calcium + Vit D3'),
    drug('Paracetamol'),
    drug('Old drug', null, false),
  ];

  it('needs two characters and ranks prefix matches first', () => {
    expect(suggestDrugs(catalog, 'f')).toEqual([]);
    expect(suggestDrugs(catalog, 'fo').map((d) => d.name)).toEqual(['Folic acid']);
    expect(suggestDrugs(catalog, 'ca').map((d) => d.name)).toEqual(['Calcium carbonate']);
  });

  it('matches generic names, skips inactive drugs and exact matches', () => {
    expect(suggestDrugs(catalog, 'vit').map((d) => d.name)).toEqual(['Calcium carbonate']);
    expect(suggestDrugs(catalog, 'old')).toEqual([]);
    expect(suggestDrugs(catalog, 'paracetamol')).toEqual([]);
  });
});
