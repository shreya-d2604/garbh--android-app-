// Guards the admin copy: every key used in the code exists in admin.json (or common.json), and the
// keys built at run time (rules, statuses, fields...) exist for every value they can take.
import admin from '@/i18n/en/admin.json';
import common from '@/i18n/en/common.json';

import { AUDIT_ACTIONS } from '../audit';
import { CONFIG_TABLES, SINGLE_CONFIGS } from '../config';
import { DQ_RULES, VITAL_LIMITS } from '../data-quality';
import { PREGNANCY_STATUSES, RISK_LEVELS } from '../schemas';

// The project has no Node typings, so the few Node APIs needed here are typed by hand.
interface Dirent {
  name: string;
  isDirectory(): boolean;
}
interface FsLike {
  readdirSync(dir: string, options: { withFileTypes: true }): Dirent[];
  readFileSync(file: string, encoding: 'utf8'): string;
}
const fs = jest.requireActual<FsLike>('fs');
const ROOT = jest.requireActual<{ cwd(): string }>('process').cwd(); // Jest runs from the repo root
const join = (...parts: string[]) => parts.join('/');
const relative = (file: string) => file.slice(ROOT.length + 1);

function lookup(tree: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}
const inAdmin = (key: string) => typeof lookup(admin, key) === 'string';
const inCommon = (key: string) => typeof lookup(common, key) === 'string';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const files = [
  ...sourceFiles(join(ROOT, 'app/admin')),
  join(ROOT, 'app/profile.tsx'),
  ...sourceFiles(join(ROOT, 'src/features/admin')),
];

describe('admin copy', () => {
  it('every static t() key used in the code exists', () => {
    const missing: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      // useTranslation() without a namespace reads the shared 'common' strings.
      const defaultCommon =
        /useTranslation\(\)/.test(text) && !/useTranslation\('admin'\)/.test(text);
      for (const m of text.matchAll(/\bt\(\s*'([^'$]+)'(,\s*\{[^)]*\})?/g)) {
        const key = m[1] ?? '';
        const opts = m[2] ?? '';
        const common_ =
          key.startsWith('common:') ||
          opts.includes("ns: 'common'") ||
          (defaultCommon && !key.startsWith('admin:'));
        const bare = key.replace(/^(common|admin):/, '');
        const ok = common_ ? inCommon(bare) : inAdmin(bare);
        if (!ok) missing.push(`${relative(file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every namespaced message key returned by schemas, config and errors exists', () => {
    const missing: string[] = [];
    for (const file of ['schemas.ts', 'config.ts', 'errors.ts', 'data-quality.ts'].map((f) =>
      join(ROOT, 'src/features/admin', f),
    )) {
      for (const m of fs
        .readFileSync(file, 'utf8')
        .matchAll(/'(admin|common):([A-Za-z0-9_.]+)'/g)) {
        const ok = m[1] === 'admin' ? inAdmin(m[2] ?? '') : inCommon(m[2] ?? '');
        if (!ok) missing.push(`${file.split('/').pop()}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('data-quality rules have a title, a hint and a message', () => {
    for (const rule of DQ_RULES) {
      for (const part of ['title', 'hint', 'detail'])
        expect(inAdmin(`dq.rules.${rule}.${part}`)).toBe(true);
    }
    for (const sev of ['high', 'medium', 'low']) expect(inAdmin(`dq.severity.${sev}`)).toBe(true);
    for (const k of Object.keys(VITAL_LIMITS)) expect(inAdmin(`dq.fix.vital.${k}`)).toBe(true);
    for (const o of ['no_show', 'completed', 'cancelled'])
      expect(inAdmin(`dq.fix.confirm.${o}`)).toBe(true);
    for (const s of ['report', 'consultation', 'cumulative'])
      expect(inAdmin(`dq.fix.sources.${s}`)).toBe(true);
  });

  it('pregnancy, audit, request and dashboard labels exist', () => {
    for (const s of PREGNANCY_STATUSES) expect(inAdmin(`pregnancy.status.${s}`)).toBe(true);
    for (const r of RISK_LEVELS) expect(inAdmin(`pregnancy.risk.${r}`)).toBe(true);
    for (const s of ['patient_reported', 'clinician'])
      expect(inAdmin(`pregnancy.sources.${s}`)).toBe(true);
    for (const a of AUDIT_ACTIONS) expect(inAdmin(`audit.actions.${a}`)).toBe(true);
    for (const e of [
      'soft_delete',
      'restore',
      'hard_delete',
      'fix_dates',
      'staff_create',
      'staff_update',
      'staff_set_role',
      'staff_set_active',
      'deidentify_account',
      'dpdp_export',
    ])
      expect(inAdmin(`audit.events.${e}`)).toBe(true);
    for (const k of ['deletion', 'export']) {
      expect(inAdmin(`requests.kind.${k}`)).toBe(true);
      expect(inAdmin(`profile.kind.${k}`)).toBe(true);
    }
    for (const s of ['open', 'in_progress', 'done', 'rejected'])
      expect(inAdmin(`requests.status.${s}`)).toBe(true);
    for (const k of [
      'openIssues',
      'unverifiedPatients',
      'aiPending',
      'unverifiedValues',
      'missedVisits',
    ]) {
      expect(inAdmin(`dashboard.items.${k}`)).toBe(true);
    }
    for (const f of ['all', 'unverified', 'deleted'])
      expect(inAdmin(`patients.filter.${f}`)).toBe(true);
    for (const r of ['admin', 'doctor', 'receptionist']) expect(inAdmin(`roles.${r}`)).toBe(true);
    for (const s of [
      'booked',
      'confirmed',
      'checked_in',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
    ]) {
      expect(inCommon(`status.${s}`)).toBe(true);
    }
  });

  it('every configuration editor, field and option is labelled', () => {
    for (const def of Object.values(CONFIG_TABLES)) {
      for (const part of ['title', 'summary', 'hint'])
        expect(inAdmin(`config.tables.${def.key}.${part}`)).toBe(true);
      for (const f of def.fields) {
        expect(inAdmin(`config.fields.${def.key}.${f.key}`)).toBe(true);
        for (const o of f.options ?? []) {
          if (['schedule', 'kind', 'category'].includes(f.key))
            expect(inAdmin(`config.options.${f.key}.${o}`)).toBe(true);
        }
      }
    }
    for (const [group, def] of Object.entries(SINGLE_CONFIGS)) {
      expect(inAdmin(`config.single.${group}`)).toBe(true);
      expect(inAdmin(`config.singleHint.${group}`)).toBe(true);
      for (const f of def.fields) expect(inAdmin(`config.fields.${group}.${f.key}`)).toBe(true);
    }
  });
});
