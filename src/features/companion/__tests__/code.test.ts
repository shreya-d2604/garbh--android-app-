import {
  CODE_ALPHABET,
  countdownParts,
  formatCode,
  formatCodeInput,
  isCompleteCode,
  normalizeCode,
} from '../code';

describe('invite code helpers', () => {
  it('alphabet has 31 symbols and none of the look-alikes', () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    for (const c of '01OIL') expect(CODE_ALPHABET).not.toContain(c);
  });

  it('normalises case, spaces and dashes (same as the SQL side)', () => {
    expect(normalizeCode(' k7m-q2p ')).toBe('K7MQ2P');
    expect(normalizeCode('k7m q2p')).toBe('K7MQ2P');
    expect(normalizeCode('K7M\n-Q2P')).toBe('K7MQ2P');
  });

  it('formats as XXX-XXX, including partial input', () => {
    expect(formatCode('k7mq2p')).toBe('K7M-Q2P');
    expect(formatCode('k7m')).toBe('K7M');
    expect(formatCode('k7mq')).toBe('K7M-Q');
    expect(formatCode('')).toBe('');
  });

  it('formats keystrokes: caps at 6 symbols, adds the dash after the third', () => {
    expect(formatCodeInput('k7mq2pxyz')).toBe('K7M-Q2P');
    expect(formatCodeInput('K7M-')).toBe('K7M');
    expect(formatCodeInput('k7 mq')).toBe('K7M-Q');
  });

  it('accepts only complete codes made of the alphabet', () => {
    expect(isCompleteCode('K7M-Q2P')).toBe(true);
    expect(isCompleteCode('k7mq2p')).toBe(true);
    expect(isCompleteCode('K7M-Q2')).toBe(false);
    expect(isCompleteCode('K7M-Q2P9')).toBe(false);
    expect(isCompleteCode('K7M-Q20')).toBe(false); // zero is not in the alphabet
    expect(isCompleteCode('')).toBe(false);
  });
});

describe('countdownParts', () => {
  const now = new Date('2026-10-23T10:00:00Z');
  it('rounds up to whole minutes and splits hours', () => {
    expect(countdownParts('2026-10-24T09:59:30Z', now)).toEqual({ hours: 24, minutes: 0 });
    expect(countdownParts('2026-10-23T11:30:00Z', now)).toEqual({ hours: 1, minutes: 30 });
    expect(countdownParts('2026-10-23T10:00:10Z', now)).toEqual({ hours: 0, minutes: 1 });
  });
  it('is null once expired', () => {
    expect(countdownParts('2026-10-23T10:00:00Z', now)).toBeNull();
    expect(countdownParts('2026-10-22T10:00:00Z', now)).toBeNull();
    expect(countdownParts('not a date', now)).toBeNull();
  });
});
