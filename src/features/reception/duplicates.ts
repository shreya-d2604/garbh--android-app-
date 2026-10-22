// Duplicate check before saving a walk-in (PLAN.md §7.5 #1): phone, email, or name + date of birth.
// The app fetches loose candidates from `patients`; the matching rules live here so they are tested.

export interface DuplicateInput {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
}

export interface DuplicateCandidate {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  mrn: string | null;
}

export type DuplicateReason = 'phone' | 'email' | 'name_dob';

export interface DuplicateMatch {
  candidate: DuplicateCandidate;
  reasons: DuplicateReason[];
}

/** Digits only, compared by the last 10 digits so "+91 98000 00001" equals "9800000001". */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Lower-case, no punctuation, words in alphabetical order ("Sharma, Priya" == "priya sharma"). */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Candidates that look like the same person, strongest match first. */
export function matchDuplicates(
  input: DuplicateInput,
  candidates: readonly DuplicateCandidate[],
): DuplicateMatch[] {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.full_name);
  const matches: DuplicateMatch[] = [];
  for (const c of candidates) {
    const reasons: DuplicateReason[] = [];
    if (phone && normalizePhone(c.phone) === phone) reasons.push('phone');
    if (email && normalizeEmail(c.email) === email) reasons.push('email');
    if (name && input.dob && c.dob === input.dob && normalizeName(c.full_name) === name) {
      reasons.push('name_dob');
    }
    if (reasons.length > 0) matches.push({ candidate: c, reasons });
  }
  return matches.sort((a, b) => b.reasons.length - a.reasons.length);
}

/** Strips characters that would break a PostgREST `or=(...)` filter or act as wildcards. */
export function sanitizeFilterValue(value: string): string {
  return value
    .replace(/[,()*%\\"':;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PostgREST `or` filter that fetches loose duplicate candidates: a phone containing the same last 4 digits, same email,
 * or same date of birth (the name comparison is done locally by matchDuplicates).
 * Returns null when there is nothing to look up.
 */
export function buildDuplicateOrFilter(input: DuplicateInput): string | null {
  const parts: string[] = [];
  const phone = normalizePhone(input.phone);
  // Phones are stored as typed ("+91 98000 00001"), so look for the last 4 digits and compare exactly locally.
  if (phone) parts.push(`phone.ilike.%${phone.slice(-4)}%`);
  const email = sanitizeFilterValue(normalizeEmail(input.email));
  if (email) parts.push(`email.ilike.${email}`);
  if (input.dob && /^\d{4}-\d{2}-\d{2}$/.test(input.dob)) parts.push(`dob.eq.${input.dob}`);
  return parts.length > 0 ? parts.join(',') : null;
}

/** Filter for the patient picker: name, MRN or phone contains the typed text. */
export function buildSearchOrFilter(term: string): string | null {
  const t = sanitizeFilterValue(term);
  if (t.length < 2) return null;
  return `full_name.ilike.%${t}%,mrn.ilike.%${t}%,phone.ilike.%${t}%`;
}
