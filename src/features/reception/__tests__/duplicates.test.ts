import {
  buildDuplicateOrFilter,
  buildSearchOrFilter,
  matchDuplicates,
  normalizeName,
  normalizePhone,
  sanitizeFilterValue,
  type DuplicateCandidate,
} from '../duplicates';

const cand = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  id: 'c1', full_name: 'Priya Sharma', phone: '+919800000001', email: 'priya@garbh.test', dob: '1996-04-12', mrn: 'GH-0001', ...over,
});

describe('normalizers', () => {
  it('compares phones by their last 10 digits', () => {
    expect(normalizePhone('+91 98000 00001')).toBe('9800000001');
    expect(normalizePhone('09800000001')).toBe('9800000001');
    expect(normalizePhone('12345')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });

  it('ignores case, punctuation and word order in names', () => {
    expect(normalizeName('  Sharma,  PRIYA ')).toBe(normalizeName('priya sharma'));
    expect(normalizeName('Priya Sharma')).not.toBe(normalizeName('Priya Sharma Rao'));
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('matchDuplicates', () => {
  it('matches on phone, email, or name + date of birth', () => {
    const input = { full_name: 'Someone Else', phone: '98000 00001', email: null, dob: null };
    expect(matchDuplicates(input, [cand({})])[0]?.reasons).toEqual(['phone']);
    expect(matchDuplicates({ full_name: 'x', email: 'PRIYA@garbh.test' }, [cand({})])[0]?.reasons).toEqual(['email']);
    expect(
      matchDuplicates({ full_name: 'sharma priya', dob: '1996-04-12' }, [cand({})])[0]?.reasons,
    ).toEqual(['name_dob']);
  });

  it('does not match a same name with another date of birth, or a missing one', () => {
    expect(matchDuplicates({ full_name: 'Priya Sharma', dob: '1990-01-01' }, [cand({})])).toEqual([]);
    expect(matchDuplicates({ full_name: 'Priya Sharma' }, [cand({})])).toEqual([]);
  });

  it('does not treat empty phones/emails as equal', () => {
    expect(
      matchDuplicates({ full_name: 'A B', phone: '', email: '' }, [cand({ phone: null, email: null })]),
    ).toEqual([]);
  });

  it('puts the strongest match first', () => {
    const matches = matchDuplicates(
      { full_name: 'Priya Sharma', phone: '9800000001', dob: '1996-04-12' },
      [cand({ id: 'weak', full_name: 'Other Person', dob: null }), cand({ id: 'strong' })],
    );
    expect(matches.map((m) => m.candidate.id)).toEqual(['strong', 'weak']);
    expect(matches[0]?.reasons).toEqual(['phone', 'name_dob']);
  });
});

describe('filters', () => {
  it('builds the loose candidate query', () => {
    expect(buildDuplicateOrFilter({ full_name: 'x', phone: '+91 98000 00001', email: 'A@B.test', dob: '1996-04-12' })).toBe(
      'phone.ilike.%9800000001,email.ilike.a@b.test,dob.eq.1996-04-12',
    );
    expect(buildDuplicateOrFilter({ full_name: 'x', dob: 'not-a-date' })).toBeNull();
  });

  it('keeps user input from breaking the PostgREST filter', () => {
    expect(sanitizeFilterValue('a,b(c)*%"d')).toBe('a b c d');
    expect(buildSearchOrFilter('p')).toBeNull();
    expect(buildSearchOrFilter('Pri,ya')).toBe('full_name.ilike.%Pri ya%,mrn.ilike.%Pri ya%,phone.ilike.%Pri ya%');
  });
});
