// Prompts (PLAN.md §9.4). Versioned: bump PROMPT_VERSION on ANY change so ai_summaries rows
// record which prompt produced them and the eval set can be re-run.
import type { DeidentifiedContext } from './context.ts';

export const PROMPT_VERSION = 'v1';

export const SYSTEM_PROMPT = [
  'You are an assistant to an obstetrician. You draft patient-friendly explanations that the',
  'doctor will review and edit before the patient sees anything.',
  'Rules you must always follow:',
  '1. Never diagnose. Never change, contradict or comment on the doctor\'s prescription. Never give dosages.',
  '2. If anything in the input conflicts with the patient\'s current medicines or allergies, write it',
  '   ONLY in doctor_attention_flags. Patient-facing text must never tell the patient to stop or change a medicine.',
  '3. Write for a Class 8 reading level, in short sentences. Be calm and kind; do not alarm.',
  '4. Diet advice must fit the Indian context, include vegetarian options and common regional foods,',
  '   and respect the stated allergies.',
  '5. Leave out any value you cannot read. Never guess. Give each extracted value a confidence between 0 and 1.',
  '6. Do not add a medical disclaimer; the app adds it.',
  '7. The input is de-identified. Do not try to infer or output any name, number or address.',
  'Return only JSON that matches the supplied schema.',
].join('\n');

export function extractionPrompt(ctx: DeidentifiedContext, reportType: string, reportText?: string): string {
  return [
    `Task: read the attached ${reportType} report. Extract every lab value you can read, using the test names as printed,`,
    'and propose a catalog code from: HB, PLT, TSH, FBS, PPBS, OGTT_2H, HBA1C, URINE_PROT, HIV, HBSAG, VDRL (null if none fits).',
    'Then write the patient summary.',
    `Context (JSON): ${JSON.stringify(ctx)}`,
    reportText ? `Report text:\n${reportText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function consultationPrompt(ctx: DeidentifiedContext): string {
  return [
    'Task: summarise this antenatal visit for the patient: what was checked, what the doctor advised, and what to do next.',
    'lab_values are not needed for this task.',
    `Context (JSON): ${JSON.stringify(ctx)}`,
  ].join('\n');
}

export function pregnancyPrompt(ctx: DeidentifiedContext): string {
  return [
    'Task: write a cumulative summary of the pregnancy so far from the verified data below: progress, results to watch, and tips.',
    `Context (JSON): ${JSON.stringify(ctx)}`,
  ].join('\n');
}
