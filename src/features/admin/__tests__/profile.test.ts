import { hasOpenRequest } from '../profile';

describe('hasOpenRequest', () => {
  const requests = [
    { kind: 'export', status: 'done' },
    { kind: 'deletion', status: 'in_progress' },
    { kind: 'export', status: 'rejected' },
  ];

  it('finds an unfinished request of the same kind', () => {
    expect(hasOpenRequest(requests, 'deletion')).toBe(true);
  });

  it('ignores finished requests and other kinds', () => {
    expect(hasOpenRequest(requests, 'export')).toBe(false);
    expect(hasOpenRequest([], 'deletion')).toBe(false);
    expect(hasOpenRequest([{ kind: 'export', status: 'open' }], 'deletion')).toBe(false);
  });
});
