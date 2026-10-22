import {
  approvedLinks,
  resolveGateway,
  resolveSelectedPatientId,
  useCompanionSelection,
} from '../store';
import type { LinkStatus } from '../types';

const link = (
  id: string,
  patient_id: string,
  status: LinkStatus,
  requested_at = '2026-10-01T00:00:00Z',
) => ({
  id,
  patient_id,
  status,
  requested_at,
});

describe('patient switcher store', () => {
  beforeEach(() => useCompanionSelection.setState({ selectedPatientId: null }));

  it('starts empty and remembers the selection', () => {
    expect(useCompanionSelection.getState().selectedPatientId).toBeNull();
    useCompanionSelection.getState().select('p2');
    expect(useCompanionSelection.getState().selectedPatientId).toBe('p2');
  });
});

describe('resolveSelectedPatientId', () => {
  const links = [
    link('l1', 'p1', 'approved'),
    link('l2', 'p2', 'approved'),
    link('l3', 'p3', 'pending'),
  ];

  it('keeps a selection that is still approved', () => {
    expect(resolveSelectedPatientId(links, 'p2')).toBe('p2');
  });

  it('falls back to the first approved patient when nothing is selected', () => {
    expect(resolveSelectedPatientId(links, null)).toBe('p1');
  });

  it('drops a selection that is pending, revoked or unknown', () => {
    expect(resolveSelectedPatientId(links, 'p3')).toBe('p1');
    expect(
      resolveSelectedPatientId([link('l1', 'p1', 'revoked'), link('l2', 'p2', 'approved')], 'p1'),
    ).toBe('p2');
    expect(resolveSelectedPatientId(links, 'nope')).toBe('p1');
  });

  it('is null when no link is approved', () => {
    expect(resolveSelectedPatientId([link('l3', 'p3', 'pending')], 'p3')).toBeNull();
    expect(resolveSelectedPatientId([], null)).toBeNull();
  });

  it('lists approved links only', () => {
    expect(approvedLinks(links).map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('resolveGateway (what /companion shows)', () => {
  it('first run: code entry, no notice', () => {
    expect(resolveGateway([], null)).toEqual({ kind: 'join', notice: null });
  });

  it('a pending request: waiting, live', () => {
    expect(resolveGateway([link('l1', 'p1', 'pending')], null)).toEqual({
      kind: 'waiting',
      pendingLinkIds: ['l1'],
    });
  });

  it('an approved link wins over a pending one and honours the switcher', () => {
    const links = [
      link('l1', 'p1', 'approved'),
      link('l2', 'p2', 'approved'),
      link('l3', 'p3', 'pending'),
    ];
    expect(resolveGateway(links, null)).toEqual({ kind: 'approved', patientId: 'p1' });
    expect(resolveGateway(links, 'p2')).toEqual({ kind: 'approved', patientId: 'p2' });
  });

  it('access that was revoked sends the companion back to the code entry with a notice', () => {
    expect(resolveGateway([link('l1', 'p1', 'revoked')], 'p1')).toEqual({
      kind: 'join',
      notice: 'revoked',
    });
  });

  it('a declined request is explained; leaving on her own is not', () => {
    expect(resolveGateway([link('l1', 'p1', 'rejected')], null)).toEqual({
      kind: 'join',
      notice: 'rejected',
    });
    expect(resolveGateway([link('l1', 'p1', 'left')], null)).toEqual({
      kind: 'join',
      notice: null,
    });
  });

  it('only the most recent link decides the notice', () => {
    const links = [
      link('l1', 'p1', 'rejected', '2026-10-01T00:00:00Z'),
      link('l2', 'p1', 'left', '2026-10-05T00:00:00Z'),
    ];
    expect(resolveGateway(links, null)).toEqual({ kind: 'join', notice: null });
  });

  it('after the last patient revokes, a still-approved second patient keeps the companion in', () => {
    const links = [link('l1', 'p1', 'revoked'), link('l2', 'p2', 'approved')];
    expect(resolveGateway(links, 'p1')).toEqual({ kind: 'approved', patientId: 'p2' });
  });
});
