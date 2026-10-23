// Configuration editors (PLAN.md §7.6 #5). Six catalogs share one list + form shape, and the hospital
// settings row is edited in two groups. Each editor is described by FieldDefs; buildPayload() validates
// the form values (all strings / booleans) and returns the row to write. Pure and unit-tested.
import { blankToNull, joinList, splitList } from './format';

export type FieldKind =
  'text' | 'multiline' | 'int' | 'decimal' | 'bool' | 'list' | 'intlist' | 'select' | 'json';

export interface FieldDef {
  key: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  /** select: the allowed values. */
  options?: readonly string[];
  /** select: '' is allowed and stored as null. */
  allowEmpty?: boolean;
  /** select: store the choice as a number. */
  numeric?: boolean;
  /** text: pattern the (normalised) value must match, with the i18n key of the message. */
  pattern?: { re: RegExp; message: string };
  /** text: upper / lower-case the value before saving. */
  caseMode?: 'upper' | 'lower';
  /** Primary key: only editable when creating. */
  createOnly?: boolean;
}

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;
export type Row = Record<string, unknown>;

export type ConfigKey =
  | 'visit_templates'
  | 'lab_tests'
  | 'drug_catalog'
  | 'curated_guidance'
  | 'week_content'
  | 'milestones';
export type SingleConfigKey = 'hospital' | 'booking';

export interface ConfigTable {
  key: ConfigKey;
  table: ConfigKey;
  /** Primary key column; 'id' tables use a generated uuid. */
  pk: string;
  orderBy: readonly string[];
  icon: string;
  fields: readonly FieldDef[];
  /** Cross-field checks on the built payload: field key -> message key. */
  validate?: (payload: Row) => Record<string, string>;
  titleOf: (row: Row) => string;
  subtitleOf: (row: Row) => string | undefined;
  activeKey?: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

export const SCHEDULES = ['standard', 'high_risk'] as const;
export const GUIDANCE_KINDS = [
  'food_recommend',
  'food_avoid',
  'med_avoid',
  'warning_sign',
] as const;
export const MILESTONE_CATEGORIES = ['scan', 'test', 'vaccine', 'education', 'trimester'] as const;
export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Dubai',
  'UTC',
] as const;

const required = { required: true } as const;

export const CONFIG_TABLES: Record<ConfigKey, ConfigTable> = {
  visit_templates: {
    key: 'visit_templates',
    table: 'visit_templates',
    pk: 'id',
    orderBy: ['schedule', 'seq'],
    icon: 'calendar-check-outline',
    activeKey: 'is_active',
    fields: [
      { key: 'schedule', kind: 'select', options: SCHEDULES, ...required },
      { key: 'seq', kind: 'int', min: 1, max: 99, ...required },
      { key: 'title', kind: 'text', maxLength: 100, ...required },
      { key: 'target_week', kind: 'int', min: 4, max: 42, ...required },
      { key: 'window_start_week', kind: 'int', min: 4, max: 42, ...required },
      { key: 'window_end_week', kind: 'int', min: 4, max: 42, ...required },
      { key: 'purpose', kind: 'multiline', maxLength: 300 },
      { key: 'recommended_tests', kind: 'list' },
      { key: 'is_active', kind: 'bool' },
    ],
    validate: (p) => {
      const errors: Record<string, string> = {};
      const start = num(p.window_start_week);
      const target = num(p.target_week);
      const end = num(p.window_end_week);
      if (start !== undefined && target !== undefined && start > target)
        errors.window_start_week = 'admin:validation.windowOrder';
      if (target !== undefined && end !== undefined && target > end)
        errors.window_end_week = 'admin:validation.windowOrder';
      return errors;
    },
    titleOf: (r) => `#${str(r.seq)} ${str(r.title)}`,
    subtitleOf: (r) =>
      `${str(r.schedule).replace('_', ' ')} · week ${str(r.target_week)} (${str(r.window_start_week)}-${str(r.window_end_week)})`,
  },
  lab_tests: {
    key: 'lab_tests',
    table: 'lab_tests',
    pk: 'code',
    orderBy: ['code'],
    icon: 'flask-outline',
    activeKey: 'is_active',
    fields: [
      {
        key: 'code',
        kind: 'text',
        maxLength: 20,
        caseMode: 'upper',
        createOnly: true,
        pattern: { re: /^[A-Z0-9_]+$/, message: 'admin:validation.code' },
        ...required,
      },
      { key: 'name', kind: 'text', maxLength: 100, ...required },
      { key: 'unit', kind: 'text', maxLength: 20 },
      { key: 'ref_low', kind: 'decimal' },
      { key: 'ref_high', kind: 'decimal' },
      { key: 'trimester_ref', kind: 'json' },
      { key: 'is_active', kind: 'bool' },
    ],
    validate: (p) => {
      const errors: Record<string, string> = {};
      const lo = num(p.ref_low);
      const hi = num(p.ref_high);
      if (lo !== undefined && hi !== undefined && lo > hi)
        errors.ref_high = 'admin:validation.rangeOrder';
      return errors;
    },
    titleOf: (r) => `${str(r.code)} · ${str(r.name)}`,
    subtitleOf: (r) => {
      const lo = r.ref_low;
      const hi = r.ref_high;
      const range =
        lo != null || hi != null
          ? `${str(lo) || '…'} - ${str(hi) || '…'} ${str(r.unit)}`.trim()
          : '';
      return range || undefined;
    },
  },
  drug_catalog: {
    key: 'drug_catalog',
    table: 'drug_catalog',
    pk: 'id',
    orderBy: ['name'],
    icon: 'pill',
    activeKey: 'is_active',
    fields: [
      { key: 'name', kind: 'text', maxLength: 100, ...required },
      { key: 'generic', kind: 'text', maxLength: 100 },
      { key: 'common_strengths', kind: 'list' },
      { key: 'pregnancy_caution_note', kind: 'multiline', maxLength: 300 },
      { key: 'is_active', kind: 'bool' },
    ],
    titleOf: (r) => str(r.name),
    subtitleOf: (r) => blankToNull(str(r.generic)) ?? undefined,
  },
  curated_guidance: {
    key: 'curated_guidance',
    table: 'curated_guidance',
    pk: 'id',
    orderBy: ['kind', 'trimester'],
    icon: 'clipboard-text-outline',
    activeKey: 'is_active',
    fields: [
      { key: 'kind', kind: 'select', options: GUIDANCE_KINDS, ...required },
      { key: 'text', kind: 'multiline', maxLength: 300, ...required },
      { key: 'reason', kind: 'multiline', maxLength: 300 },
      {
        key: 'trimester',
        kind: 'select',
        options: ['1', '2', '3'],
        allowEmpty: true,
        numeric: true,
      },
      { key: 'condition', kind: 'text', maxLength: 50, caseMode: 'lower' },
      { key: 'is_active', kind: 'bool' },
    ],
    titleOf: (r) => str(r.text),
    subtitleOf: (r) => {
      const parts = [str(r.kind).replace('_', ' ')];
      if (r.trimester != null) parts.push(`trimester ${str(r.trimester)}`);
      if (r.condition) parts.push(str(r.condition));
      return parts.join(' · ');
    },
  },
  week_content: {
    key: 'week_content',
    table: 'week_content',
    pk: 'week',
    orderBy: ['week'],
    icon: 'baby-face-outline',
    fields: [
      { key: 'week', kind: 'int', min: 4, max: 42, createOnly: true, ...required },
      { key: 'baby_size_label', kind: 'text', maxLength: 50 },
      { key: 'baby_length_cm', kind: 'decimal', min: 0, max: 999 },
      { key: 'baby_weight_g', kind: 'decimal', min: 0, max: 99999 },
      { key: 'baby_development', kind: 'multiline', maxLength: 500 },
      { key: 'mother_changes', kind: 'multiline', maxLength: 500 },
      { key: 'tips', kind: 'multiline', maxLength: 500 },
    ],
    titleOf: (r) => `Week ${str(r.week)}`,
    subtitleOf: (r) => blankToNull(str(r.baby_size_label)) ?? undefined,
  },
  milestones: {
    key: 'milestones',
    table: 'milestones',
    pk: 'key',
    orderBy: ['week_from', 'key'],
    icon: 'flag-checkered',
    fields: [
      {
        key: 'key',
        kind: 'text',
        maxLength: 40,
        caseMode: 'lower',
        createOnly: true,
        pattern: { re: /^[a-z0-9_]+$/, message: 'admin:validation.code' },
        ...required,
      },
      { key: 'title', kind: 'text', maxLength: 100, ...required },
      { key: 'category', kind: 'select', options: MILESTONE_CATEGORIES, ...required },
      { key: 'week_from', kind: 'int', min: 0, max: 42, ...required },
      { key: 'week_to', kind: 'int', min: 0, max: 42, ...required },
      { key: 'description', kind: 'multiline', maxLength: 300 },
    ],
    validate: (p) => {
      const errors: Record<string, string> = {};
      const from = num(p.week_from);
      const to = num(p.week_to);
      if (from !== undefined && to !== undefined && from > to)
        errors.week_to = 'admin:validation.windowOrder';
      return errors;
    },
    titleOf: (r) => str(r.title),
    subtitleOf: (r) =>
      `${str(r.category)} · weeks ${str(r.week_from)}${r.week_to !== r.week_from ? `-${str(r.week_to)}` : ''}`,
  },
};

export const CONFIG_KEYS = Object.keys(CONFIG_TABLES) as ConfigKey[];

export function isConfigKey(value: string | null | undefined): value is ConfigKey {
  return !!value && (CONFIG_KEYS as readonly string[]).includes(value);
}

/** hospital_settings is a single row (id = 1), edited in two groups. */
export const SINGLE_CONFIGS: Record<
  SingleConfigKey,
  { fields: readonly FieldDef[]; icon: string }
> = {
  hospital: {
    icon: 'hospital-building',
    fields: [
      { key: 'name', kind: 'text', maxLength: 100, ...required },
      { key: 'address', kind: 'multiline', maxLength: 300 },
      { key: 'phone', kind: 'text', maxLength: 30 },
      { key: 'timezone', kind: 'select', options: TIMEZONES, ...required },
      { key: 'default_slot_minutes', kind: 'int', min: 5, max: 120, ...required },
      { key: 'reminder_lead_hours', kind: 'intlist', min: 1, max: 720 },
    ],
  },
  booking: {
    icon: 'calendar-lock-outline',
    fields: [
      { key: 'min_lead_hours', kind: 'int', min: 0, max: 720, ...required },
      { key: 'max_advance_days', kind: 'int', min: 1, max: 365, ...required },
      { key: 'patient_cancel_cutoff_hours', kind: 'int', min: 0, max: 168, ...required },
      { key: 'unverified_max_upcoming', kind: 'int', min: 0, max: 20, ...required },
      { key: 'verified_max_upcoming', kind: 'int', min: 0, max: 50, ...required },
    ],
  },
};

export function isSingleConfigKey(value: string | null | undefined): value is SingleConfigKey {
  return value === 'hospital' || value === 'booking';
}

// ---------------------------------------------------------------- form values <-> row
/** Row -> form values (strings and booleans). A missing row gives empty values with is_active on. */
export function valuesFromRow(fields: readonly FieldDef[], row?: Row | null): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const v = row?.[f.key];
    switch (f.kind) {
      case 'bool':
        out[f.key] = row ? v === true : f.key === 'is_active';
        break;
      case 'list':
        out[f.key] = joinList(Array.isArray(v) ? (v as string[]) : []);
        break;
      case 'intlist':
        out[f.key] = Array.isArray(v) ? (v as number[]).join(', ') : '';
        break;
      case 'json':
        out[f.key] = v == null ? '' : JSON.stringify(v, null, 2);
        break;
      default:
        out[f.key] = v == null ? '' : String(v);
    }
  }
  return out;
}

export type BuildResult =
  { ok: true; payload: Row } | { ok: false; errors: Record<string, string> };

const INT_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Valid shape of lab_tests.trimester_ref: {"1": {"low": n, "high": n}, "2": ..., "3": ...}. */
export function isTrimesterRef(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([k, v]) => {
    if (!['1', '2', '3'].includes(k) || !v || typeof v !== 'object' || Array.isArray(v))
      return false;
    const { low, high, ...rest } = v as Record<string, unknown>;
    return (
      Object.keys(rest).length === 0 &&
      (low === undefined || typeof low === 'number') &&
      (high === undefined || typeof high === 'number')
    );
  });
}

function inRange(n: number, f: FieldDef): boolean {
  return (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max);
}

/** Validates form values and builds the row to write. Messages are fully namespaced i18n keys. */
export function buildPayload(
  fields: readonly FieldDef[],
  values: FormValues,
  extra?: (payload: Row) => Record<string, string>,
): BuildResult {
  const errors: Record<string, string> = {};
  const payload: Row = {};

  for (const f of fields) {
    const raw = values[f.key];
    if (f.kind === 'bool') {
      payload[f.key] = raw === true;
      continue;
    }
    let s = typeof raw === 'string' ? raw.trim() : '';
    if (f.caseMode === 'upper') s = s.toUpperCase();
    if (f.caseMode === 'lower') s = s.toLowerCase();

    if (s === '' && f.kind !== 'list' && f.kind !== 'intlist') {
      if (f.required) errors[f.key] = 'common:validation.required';
      payload[f.key] = null;
      continue;
    }
    if (f.maxLength && s.length > f.maxLength) {
      errors[f.key] = 'admin:validation.tooLong';
      continue;
    }

    switch (f.kind) {
      case 'text':
      case 'multiline':
        if (f.pattern && !f.pattern.re.test(s)) errors[f.key] = f.pattern.message;
        payload[f.key] = s;
        break;
      case 'int': {
        if (!INT_RE.test(s) || !inRange(Number(s), f)) errors[f.key] = 'admin:validation.integer';
        payload[f.key] = Number(s);
        break;
      }
      case 'decimal': {
        if (!DECIMAL_RE.test(s) || !inRange(Number(s), f))
          errors[f.key] = 'admin:validation.number';
        payload[f.key] = Number(s);
        break;
      }
      case 'list':
        payload[f.key] = splitList(s);
        break;
      case 'intlist': {
        const parts = splitList(s);
        if (parts.some((p) => !INT_RE.test(p) || !inRange(Number(p), f)))
          errors[f.key] = 'admin:validation.integer';
        payload[f.key] = parts.map(Number);
        break;
      }
      case 'select':
        if (!f.options?.includes(s)) errors[f.key] = 'admin:validation.choice';
        payload[f.key] = f.numeric ? Number(s) : s;
        break;
      case 'json': {
        try {
          const parsed: unknown = JSON.parse(s);
          if (!isTrimesterRef(parsed)) errors[f.key] = 'admin:validation.json';
          payload[f.key] = parsed;
        } catch {
          errors[f.key] = 'admin:validation.json';
        }
        break;
      }
    }
  }

  if (Object.keys(errors).length === 0 && extra) Object.assign(errors, extra(payload));
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload };
}

/** buildPayload for a catalog table (adds its cross-field checks). */
export function buildTablePayload(
  def: ConfigTable,
  values: FormValues,
  editing: boolean,
): BuildResult {
  // The primary key of an existing row is not editable: leave it out of the write.
  const fields = editing ? def.fields.filter((f) => !f.createOnly) : def.fields;
  return buildPayload(fields, values, def.validate);
}
