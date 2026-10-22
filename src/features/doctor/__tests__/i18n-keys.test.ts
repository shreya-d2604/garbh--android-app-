// Every translation key the doctor area uses must exist in doctor.json (or common.json for `common:` keys).
import common from '@/i18n/en/common.json';
import doctor from '@/i18n/en/doctor.json';

import { VITAL_RANGES } from '../consultation';
import { QUEUE_GROUP_ORDER } from '../queue';
import { REPORT_TYPES } from '../report-upload';

// No @types/node in this project: type the two Node modules this test needs.
const { readdirSync, readFileSync, statSync } = jest.requireActual<{
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

// Jest runs from the repository root.
const ROOT = process.cwd();

function lookup(tree: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      tree,
    );
}
const has = (ns: 'doctor' | 'common', key: string) => {
  const tree = ns === 'doctor' ? doctor : common;
  // Plural keys (`count`) are stored as key_one / key_other.
  return typeof lookup(tree, key) === 'string' || typeof lookup(tree, `${key}_other`) === 'string';
};
const hasPrefix = (ns: 'doctor' | 'common', prefix: string) => {
  const node = lookup(ns === 'doctor' ? doctor : common, prefix);
  return node !== null && typeof node === 'object';
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = [...walk(join(ROOT, 'src/features/doctor')), ...walk(join(ROOT, 'app/doctor'))];
const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');

function split(raw: string): { ns: 'doctor' | 'common'; key: string } {
  if (raw.startsWith('common:')) return { ns: 'common', key: raw.slice(7) };
  if (raw.startsWith('doctor:')) return { ns: 'doctor', key: raw.slice(7) };
  return { ns: 'doctor', key: raw };
}

describe('doctor translations', () => {
  it('has every literal key used in t(...) calls', () => {
    const missing: string[] = [];
    for (const m of source.matchAll(/\bt\(\s*'([A-Za-z0-9_.:]+)'/g)) {
      const { ns, key } = split(m[1] as string);
      if (!has(ns, key)) missing.push(m[1] as string);
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('has a group for every template key t(`prefix.${...}`)', () => {
    const missing: string[] = [];
    for (const m of source.matchAll(/\bt\(\s*`([A-Za-z0-9_.:]+)\.\$\{/g)) {
      const { ns, key } = split(m[1] as string);
      if (!hasPrefix(ns, key)) missing.push(m[1] as string);
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('has the namespaced keys used in zod messages and data tables', () => {
    const missing: string[] = [];
    for (const m of source.matchAll(/'(doctor:[A-Za-z0-9_.]+)'/g)) {
      const { key } = split(m[1] as string);
      if (!has('doctor', key)) missing.push(m[1] as string);
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('has keys that pure modules return (issue lists, validation, errors)', () => {
    const keys = [
      ...Object.keys(VITAL_RANGES).map((k) => `validation.range.${k}`),
      'validation.drugRequired',
      'validation.frequency',
      'validation.duration',
      'validation.date',
      'validation.bpOrder',
      'validation.nextVisit',
      'validation.time',
      'validation.timeOrder',
      'validation.slot',
      'validation.timeOffOrder',
      'validation.week',
      'validation.count',
      'validation.multiple',
      'validation.needDates',
      'validation.lmpFuture',
      'validation.lmpOld',
      'validation.eddRange',
      'publish.fixErrors',
      'publish.needContent',
      'report.errors.noFiles',
      'report.errors.tooManyPages',
      'report.errors.badType',
      'report.errors.tooBig',
      'ai.issues.headline',
      'ai.issues.summary',
      'ai.issues.invalid',
      ...[
        'RATE_LIMITED',
        'NOT_FOUND',
        'NOT_ON_CARE_TEAM',
        'AI_FAILED',
        'NOT_IMPLEMENTED',
        'GENERIC',
      ].map((c) => `ai.errors.${c}`),
      ...QUEUE_GROUP_ORDER.map((g) => `today.group.${g}`),
      ...REPORT_TYPES.map((r) => `report.type.${r}`),
      ...['pending', 'processing', 'done', 'failed', 'skipped'].map(
        (s) => `reports.extraction.${s}`,
      ),
      ...['low', 'moderate', 'high'].map((r) => `chart.risk.${r}`),
      ...['delivered', 'miscarriage', 'terminated', 'transferred', 'closed'].map(
        (s) => `chart.outcome.${s}`,
      ),
      ...['timeline', 'vitals', 'reports', 'prescriptions', 'plan', 'summaries'].map(
        (k) => `chart.tabs.${k}`,
      ),
      ...[
        'completed',
        'scheduled',
        'skipped',
        'cancelled',
        'missed',
        'overdue',
        'due',
        'upcoming',
      ].map((s) => `visit.state.${s}`),
      ...['low', 'normal', 'high', 'abnormal'].map((f) => `labs.flag.${f}`),
      ...['ai_extracted', 'manual'].map((s) => `labs.source.${s}`),
      ...['generating', 'draft', 'approved', 'published', 'rejected', 'failed'].map(
        (s) => `inbox.status.${s}`,
      ),
      ...['report', 'consultation', 'cumulative'].map((s) => `inbox.source.${s}`),
      ...['review', 'done', 'issues'].flatMap((k) => [
        `inbox.tab.${k}`,
        `inbox.empty.${k}.title`,
        `inbox.empty.${k}.message`,
      ]),
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => `schedule.weekday.${d}`),
      ...['primary', 'backup'].flatMap((r) => [`team.role.${r}`, `patients.role.${r}`]),
      'patients.role.all',
      ...['bp_high', 'bp_low', 'fever', 'spo2_low', 'fhr_abnormal', 'pulse_abnormal'].map(
        (w) => `consult.warning.${w}`,
      ),
      ...['idle', 'saving', 'saved', 'error'].map((s) => `consult.save.${s}`),
      ...['normal', 'attention', 'urgent'].map((s) => `ai.status.${s}`),
    ];
    expect(keys.filter((k) => !has('doctor', k))).toEqual([]);
  });

  it('uses common status labels that exist', () => {
    for (const s of [
      'booked',
      'confirmed',
      'checked_in',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
    ]) {
      expect(has('common', `status.${s}`)).toBe(true);
    }
  });
});
