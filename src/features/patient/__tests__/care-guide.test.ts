import {
  applicableGuidance,
  mergeCareGuide,
  normalizeText,
  patientConditionTags,
} from '../care-guide';
import type { PatientSummary } from '../summary';
import { guidance } from '../test-fixtures';

const summary = (over: Partial<PatientSummary> = {}): PatientSummary => ({
  headline: 'h',
  plain_language_summary: 'p',
  key_findings: [],
  foods_to_eat: [],
  foods_to_avoid: [],
  medicines_to_avoid: [],
  lifestyle_tips: [],
  questions_for_doctor: [],
  ...over,
});

describe('patientConditionTags', () => {
  it('maps spellings and risk factors to guidance condition tags', () => {
    const tags = patientConditionTags(['anemia'], ['GDM', 'Age > 35', 'Gestational diabetes']);
    expect(tags.has('anemia')).toBe(true);
    expect(tags.has('gdm')).toBe(true);
    expect(tags.has('hypertension')).toBe(false);
  });
  it('understands British spellings and whole words only', () => {
    expect(patientConditionTags([], ['Anaemia']).has('anemia')).toBe(true);
    expect(patientConditionTags([], ['High BP']).has('hypertension')).toBe(true);
    expect(patientConditionTags([], ['Biphasic']).has('hypertension')).toBe(false);
  });
});

describe('applicableGuidance', () => {
  const rows = [
    guidance({ id: 'all' }),
    guidance({ id: 't3', trimester: 3 }),
    guidance({ id: 't2', trimester: 2 }),
    guidance({ id: 'gdm', condition: 'gdm' }),
    guidance({ id: 'anemia', condition: 'anemia' }),
    guidance({ id: 'warn-t3', kind: 'warning_sign', trimester: 3, condition: 'gdm' }),
  ];
  it('filters by trimester and the patient conditions', () => {
    const ids = applicableGuidance(rows, 2, new Set(['anemia'])).map((r) => r.id);
    expect(ids).toEqual(['all', 't2', 'anemia', 'warn-t3']);
  });
  it('never filters warning signs out', () => {
    expect(applicableGuidance(rows, 1, new Set()).map((r) => r.id)).toContain('warn-t3');
  });
});

describe('mergeCareGuide', () => {
  const base = { trimester: 2, tags: new Set<string>() };

  it('labels doctor-advised items and general guidance, doctor first', () => {
    const g = mergeCareGuide({
      ...base,
      curated: [
        guidance({
          id: 'c1',
          text: 'Raw papaya and unpasteurised milk',
          kind: 'food_avoid',
          reason: 'Can be unsafe',
        }),
      ],
      summary: summary({
        foods_to_avoid: [{ item: 'Tea/coffee with meals', why: 'Reduces iron absorption' }],
      }),
    });
    expect(g.food_avoid.map((i) => `${i.source}:${i.text}`)).toEqual([
      'doctor:Tea/coffee with meals',
      'general:Raw papaya and unpasteurised milk',
    ]);
    expect(g.food_avoid[0]?.reason).toBe('Reduces iron absorption');
  });

  it('removes duplicates, keeping the doctor wording and borrowing the curated reason', () => {
    const g = mergeCareGuide({
      ...base,
      curated: [
        guidance({
          id: 'c1',
          text: 'Green leafy vegetables, dal, eggs or paneer daily',
          reason: 'Protein, iron and folate',
        }),
      ],
      summary: summary({ foods_to_eat: [{ item: 'Green leafy vegetables', why: '' }] }),
    });
    expect(g.food_recommend).toHaveLength(1);
    expect(g.food_recommend[0]).toMatchObject({
      source: 'doctor',
      text: 'Green leafy vegetables',
      reason: 'Protein, iron and folate',
    });
  });

  it('removes duplicate curated rows that differ only in punctuation and case', () => {
    const g = mergeCareGuide({
      ...base,
      curated: [
        guidance({ id: 'a', text: 'Avoid raw papaya.' }),
        guidance({ id: 'b', text: 'avoid raw   papaya' }),
      ],
      summary: null,
    });
    expect(g.food_recommend).toHaveLength(1);
  });

  it('always includes every warning sign and honours conditions for the rest', () => {
    const g = mergeCareGuide({
      trimester: 2,
      tags: new Set(['anemia']),
      curated: [
        guidance({ id: 'w1', kind: 'warning_sign', text: 'Bleeding', trimester: null }),
        guidance({ id: 'w2', kind: 'warning_sign', text: 'Baby moving less', trimester: 3 }),
        guidance({ id: 'f1', text: 'Jaggery, dates', condition: 'anemia' }),
        guidance({ id: 'f2', text: 'Avoid sweets', kind: 'food_avoid', condition: 'gdm' }),
      ],
      summary: null,
    });
    expect(g.warning_sign.map((i) => i.text)).toEqual(['Bleeding', 'Baby moving less']);
    expect(g.food_recommend.map((i) => i.text)).toEqual(['Jaggery, dates']);
    expect(g.food_avoid).toEqual([]);
  });

  it('ignores unknown kinds and blank doctor items', () => {
    const g = mergeCareGuide({
      ...base,
      curated: [guidance({ id: 'x', kind: 'something_new', text: 'Hmm' })],
      summary: summary({
        medicines_to_avoid: [
          { item: '  ', why: '' },
          { item: 'Ibuprofen', why: 'NSAID' },
        ],
      }),
    });
    expect(g.med_avoid.map((i) => i.text)).toEqual(['Ibuprofen']);
  });
});

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText('  Dal, Eggs & Paneer!  ')).toBe('dal eggs paneer');
  });
});
