/// <reference types="node" />
// Every translation key used by the patient area must exist. There is no device to catch a
// missing key (the UI would show the raw key), so this test reads the source files.
import fs from 'fs';
import path from 'path';

import common from '@/i18n/en/common.json';
import patient from '@/i18n/en/patient.json';

type Ns = 'patient' | 'common';
const bundles: Record<Ns, unknown> = { patient, common };

function has(ns: Ns, key: string): boolean {
  let node: unknown = bundles[ns];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

const ROOT = path.resolve(__dirname, '../../../..');
const REPORT_TYPES = [
  'blood',
  'urine',
  'ultrasound',
  'nt_scan',
  'anomaly_scan',
  'growth_scan',
  'doppler',
  'gtt',
  'thyroid',
  'ecg',
  'other',
];
const APPT = [
  'booked',
  'confirmed',
  'checked_in',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
];

/** Keys built with a template literal: `prefix.${x}` -> the values x can take. */
const DYNAMIC: Record<string, { ns: Ns; values: string[] }> = {
  'careGuide.': { ns: 'patient', values: ['food_recommend', 'food_avoid', 'med_avoid'] },
  'careGuide.defaultWarning.': {
    ns: 'patient',
    values: ['bleeding', 'headache', 'movement', 'fluid', 'pain', 'fever'],
  },
  'journey.state.': {
    ns: 'patient',
    values: ['done', 'booked', 'current', 'upcoming', 'overdue', 'missed', 'skipped'],
  },
  'medicines.slot.': { ns: 'patient', values: ['morning', 'afternoon', 'evening', 'night'] },
  'reports.flag.': { ns: 'patient', values: ['low', 'high', 'normal', 'abnormal'] },
  'reports.range.': { ns: 'patient', values: ['between', 'upTo', 'from'] },
  'reports.trimesterGroup.': { ns: 'patient', values: ['1', '2', '3'] },
  'reportTypes.': { ns: 'patient', values: REPORT_TYPES },
  'summary.source.': { ns: 'patient', values: ['report', 'consultation', 'cumulative'] },
  'summary.status.': { ns: 'patient', values: ['normal', 'attention', 'urgent'] },
  'timeline.': { ns: 'patient', values: ['t1', 't2', 't3', 'delivery'] },
  'trimester.': { ns: 'patient', values: ['1', '2', '3'] },
  'status.': { ns: 'common', values: APPT },
  'errors.': {
    ns: 'common',
    values: [
      'GENERIC',
      'SLOT_TAKEN',
      'NOT_IMPLEMENTED',
      'CANCEL_CUTOFF',
      'MAX_UPCOMING',
      'NOT_ON_CARE_TEAM',
      'DOCTOR_NOT_ACCEPTING',
      'TOO_SOON',
      'TOO_FAR_AHEAD',
      'NOT_ALLOWED',
      'NOT_FOUND',
      'INVALID_INPUT',
      'OUTSIDE_AVAILABILITY',
      'DOCTOR_UNAVAILABLE',
      'INVALID_STATUS_CHANGE',
    ],
  },
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory())
      return e.name === '__tests__' || e.name === 'companions' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !e.name.includes('test-fixtures') ? [p] : [];
  });
}

/** Text of the first argument of the call whose "(" is at `open`. */
function firstArg(src: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i] as string;
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return src.slice(open + 1, i);
      depth--;
    } else if (c === ',' && depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

interface Use {
  file: string;
  ns: Ns;
  key: string;
}

function collect(): { statics: Use[]; templates: Use[]; plurals: Use[] } {
  const statics: Use[] = [];
  const templates: Use[] = [];
  const plurals: Use[] = [];
  const files = [
    ...sourceFiles(path.join(ROOT, 'app/patient')),
    ...sourceFiles(path.join(ROOT, 'src/features/patient')),
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Which namespace each translation function name is bound to in this file.
    const names = new Map<string, Ns>();
    for (const m of src.matchAll(/const \{ t(?:: (\w+))? \} = useTranslation\((?:'(\w+)')?\)/g)) {
      names.set(m[1] ?? 't', m[2] === 'patient' ? 'patient' : 'common');
    }
    for (const [name, defNs] of names) {
      for (const m of src.matchAll(new RegExp(`(?<![\\w.])${name}\\(`, 'g'))) {
        const arg = firstArg(src, (m.index as number) + m[0].length - 1);
        for (const lit of arg.matchAll(/'([^']*)'/g)) {
          const raw = lit[1] as string;
          if (!/^([a-z]+:)?[a-z][A-Za-z]*(\.[A-Za-z0-9_]+)+$/.test(raw)) continue;
          const [prefix, rest] = raw.includes(':') ? raw.split(':') : [null, raw];
          statics.push({ file, ns: (prefix as Ns | null) ?? defNs, key: rest as string });
        }
        for (const lit of arg.matchAll(/`([^`$]*)\$\{/g)) {
          templates.push({ file, ns: defNs, key: lit[1] as string });
        }
      }
    }
    for (const m of src.matchAll(/plural\(\s*'([^']+)'/g)) {
      plurals.push({ file, ns: 'patient', key: m[1] as string });
    }
  }
  return { statics, templates, plurals };
}

describe('patient i18n keys', () => {
  const { statics, templates, plurals } = collect();

  it('finds the keys used by the screens (guards against a broken scanner)', () => {
    expect(statics.length).toBeGreaterThan(100);
    expect(templates.length).toBeGreaterThan(5);
  });

  it('defines every static key', () => {
    const missing = statics
      .filter((u) => !has(u.ns, u.key))
      .map((u) => `${u.ns}:${u.key} (${path.relative(ROOT, u.file)})`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('registers every template-literal key and defines all its values', () => {
    const problems: string[] = [];
    // `${key}_one` inside usePlural has no fixed prefix; plural keys are checked below.
    for (const u of templates.filter((x) => x.key !== '')) {
      if (!DYNAMIC[u.key])
        problems.push(
          `unregistered dynamic key "${u.key}\${...}" in ${path.relative(ROOT, u.file)}`,
        );
    }
    for (const [prefix, spec] of Object.entries(DYNAMIC)) {
      for (const v of spec.values)
        if (!has(spec.ns, `${prefix}${v}`)) problems.push(`${spec.ns}:${prefix}${v}`);
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('defines _one and _other for every plural key', () => {
    const missing = plurals
      .flatMap((u) => [`${u.key}_one`, `${u.key}_other`])
      .filter((k) => !has('patient', k));
    expect([...new Set(missing)]).toEqual([]);
  });
});
