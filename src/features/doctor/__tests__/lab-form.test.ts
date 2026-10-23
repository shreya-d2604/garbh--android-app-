import {
  flagTone,
  labFields,
  labFlag,
  labFormFromRow,
  labFormSchema,
  labPatch,
  parseLabValue,
} from '../lab-form';

const hb = { unit: 'g/dL', ref_low: 11, ref_high: 15 };

describe('manual lab values', () => {
  it('needs a test and a value', () => {
    expect(labFormSchema.safeParse({ test_code: 'HB', value: '10.2', unit: '' }).success).toBe(
      true,
    );
    expect(labFormSchema.safeParse({ test_code: '', value: '10.2', unit: '' }).success).toBe(false);
    expect(labFormSchema.safeParse({ test_code: 'HB', value: '  ', unit: '' }).success).toBe(false);
  });

  it('keeps numbers numeric and everything else as text', () => {
    expect(parseLabValue('10.2')).toEqual({ num: 10.2, text: null });
    expect(parseLabValue('10,2')).toEqual({ num: 10.2, text: null });
    expect(parseLabValue(' Negative ')).toEqual({ num: null, text: 'Negative' });
    expect(parseLabValue('')).toEqual({ num: null, text: null });
  });

  it('flags against the reference range', () => {
    expect(labFlag(10.4, 11, 15)).toBe('low');
    expect(labFlag(16, 11, 15)).toBe('high');
    expect(labFlag(12, 11, 15)).toBe('normal');
    expect(labFlag(130, null, 120)).toBe('high');
    expect(labFlag(5, null, null)).toBeNull();
    expect(labFlag(null, 11, 15)).toBeNull();
  });

  it('takes unit and range from the catalog test unless a unit is typed', () => {
    expect(labFields({ test_code: 'HB', value: '10.4', unit: '' }, hb)).toEqual({
      test_code: 'HB',
      value_num: 10.4,
      value_text: null,
      unit: 'g/dL',
      ref_low: 11,
      ref_high: 15,
      flag: 'low',
    });
    expect(
      labFields(
        { test_code: 'HIV', value: 'Negative', unit: '' },
        { unit: null, ref_low: null, ref_high: null },
      ),
    ).toMatchObject({
      value_num: null,
      value_text: 'Negative',
      unit: null,
      flag: null,
    });
    expect(labFields({ test_code: 'HB', value: '12', unit: 'g/L' }, hb).unit).toBe('g/L');
    expect(labPatch({ test_code: 'HB', value: '12', unit: '' }, undefined)).toMatchObject({
      value_num: 12,
      ref_low: null,
      flag: null,
    });
  });

  it('round-trips a row into the form and maps flags to tones', () => {
    expect(
      labFormFromRow({ test_code: 'HB', value_num: 10.4, value_text: null, unit: 'g/dL' }),
    ).toEqual({ test_code: 'HB', value: '10.4', unit: 'g/dL' });
    expect(
      labFormFromRow({ test_code: null, value_num: null, value_text: 'Reactive', unit: null }),
    ).toEqual({ test_code: '', value: 'Reactive', unit: '' });
    expect(flagTone('normal')).toBe('success');
    expect(flagTone('low')).toBe('warning');
    expect(flagTone('abnormal')).toBe('danger');
    expect(flagTone(null)).toBe('neutral');
  });
});
