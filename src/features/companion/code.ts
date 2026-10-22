// Invite-code helpers. The SQL side (create_companion_invite / redeem_companion_code) uses the
// same alphabet and normalisation; PLAN.md §8.1.

/** 31 symbols, no 0 O 1 I L. 31^6 = 887,503,681 codes. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** Strip spaces and dashes, upper-case. Same normalisation as redeem_companion_code. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** 'abcdef' -> 'ABC-DEF'. Partial input is formatted as far as it goes ('abcd' -> 'ABC-D'). */
export function formatCode(input: string): string {
  const code = normalizeCode(input);
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** What the text field should show after each keystroke: normalised, capped, dashed. */
export function formatCodeInput(raw: string): string {
  return formatCode(normalizeCode(raw).slice(0, CODE_LENGTH));
}

export function isCompleteCode(input: string): boolean {
  const code = normalizeCode(input);
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export interface CountdownParts {
  hours: number;
  minutes: number;
}

/** Time left until `expiresAt`, rounded up to whole minutes; null once it has passed. */
export function countdownParts(expiresAt: string, now: Date = new Date()): CountdownParts | null {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const totalMinutes = Math.ceil(ms / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
