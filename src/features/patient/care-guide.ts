// Care guide (PLAN.md §7.2 #6): curated guidance filtered for the patient and merged with the
// latest doctor-approved summary. Deduplicated; every item says who advised it.
import type { PatientSummary } from './summary';
import type { GuidanceRow } from './types';

export type GuideKind = 'food_recommend' | 'food_avoid' | 'med_avoid' | 'warning_sign';
export const GUIDE_KINDS: readonly GuideKind[] = [
  'warning_sign',
  'food_recommend',
  'food_avoid',
  'med_avoid',
];

export interface GuideItem {
  key: string;
  text: string;
  reason: string | null;
  /** 'doctor' = from the approved summary ("Advised by Dr. X"), 'general' = curated guidance. */
  source: 'doctor' | 'general';
}

export type CareGuide = Record<GuideKind, GuideItem[]>;

/** Condition tags used by `curated_guidance.condition`, with the free-text spellings we map to them. */
const CONDITION_ALIASES: Record<string, string[]> = {
  gdm: ['gdm', 'gestational diabetes', 'diabetes', 'diabetic'],
  anemia: ['anemia', 'anaemia', 'low hb', 'low haemoglobin', 'low hemoglobin'],
  hypertension: [
    'hypertension',
    'high bp',
    'high blood pressure',
    'pre-eclampsia',
    'preeclampsia',
    'pih',
  ],
  thyroid: ['thyroid', 'hypothyroid', 'hyperthyroid'],
};

/** Tags (e.g. 'gdm', 'anemia') implied by the patient's recorded conditions and risk factors. */
export function patientConditionTags(
  chronicConditions: string[],
  riskFactors: string[],
): Set<string> {
  const tags = new Set<string>();
  for (const raw of [...chronicConditions, ...riskFactors]) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    tags.add(value);
    // Whole-word match, so a short alias like "pih" never matches inside another word.
    const words = ` ${value.replace(/[^a-z0-9]+/g, ' ').trim()} `;
    for (const [tag, aliases] of Object.entries(CONDITION_ALIASES)) {
      if (aliases.some((a) => words.includes(` ${a.replace(/[^a-z0-9]+/g, ' ').trim()} `))) {
        tags.add(tag);
      }
    }
  }
  return tags;
}

/** Normalised form used to spot the same advice written twice. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameAdvice(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // One is a clear subset of the other ("Green leafy vegetables" vs "Green leafy vegetables, dal, eggs").
  return short.length >= 8 && long.includes(short);
}

export interface GuideInput {
  curated: GuidanceRow[];
  summary: PatientSummary | null;
  trimester: number;
  tags: Set<string>;
}

/** Curated rows that apply to this trimester and these conditions (warning signs are never filtered). */
export function applicableGuidance(
  rows: GuidanceRow[],
  trimester: number,
  tags: Set<string>,
): GuidanceRow[] {
  return rows.filter((r) => {
    if (r.kind === 'warning_sign') return true;
    if (r.trimester != null && r.trimester !== trimester) return false;
    if (r.condition != null && !tags.has(r.condition.toLowerCase())) return false;
    return true;
  });
}

export function mergeCareGuide({ curated, summary, trimester, tags }: GuideInput): CareGuide {
  const guide: CareGuide = { food_recommend: [], food_avoid: [], med_avoid: [], warning_sign: [] };

  // Doctor-advised first: the summary is personal to this patient.
  const fromSummary: [GuideKind, { item: string; why: string }[]][] = summary
    ? [
        ['food_recommend', summary.foods_to_eat],
        ['food_avoid', summary.foods_to_avoid],
        ['med_avoid', summary.medicines_to_avoid],
      ]
    : [];
  for (const [kind, items] of fromSummary) {
    for (const [i, it] of items.entries()) {
      if (!it.item.trim()) continue;
      guide[kind].push({
        key: `doctor:${kind}:${i}`,
        text: it.item.trim(),
        reason: it.why.trim() || null,
        source: 'doctor',
      });
    }
  }

  for (const row of applicableGuidance(curated, trimester, tags)) {
    const kind = row.kind as GuideKind;
    if (!(kind in guide)) continue;
    const list = guide[kind];
    const norm = normalizeText(row.text);
    const existing = list.find((g) => sameAdvice(normalizeText(g.text), norm));
    if (existing) {
      // Same advice from both sources: keep the doctor's wording, borrow the curated reason.
      if (!existing.reason && row.reason) existing.reason = row.reason;
      continue;
    }
    list.push({ key: `general:${row.id}`, text: row.text, reason: row.reason, source: 'general' });
  }
  return guide;
}
