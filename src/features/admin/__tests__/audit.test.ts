import { changedFields, dayRange, explicitEvent, formatValue, hasFilters } from '../audit';

describe('dayRange', () => {
  it('turns inclusive calendar days into timestamp bounds', () => {
    const r = dayRange('2026-10-01', '2026-10-02');
    expect(new Date(r.gte ?? '').getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(r.lt ?? '').getTime()).toBe(new Date(2026, 9, 3).getTime());
  });

  it('either end is optional and bad dates are ignored', () => {
    expect(dayRange('2026-10-01').lt).toBeUndefined();
    expect(dayRange(undefined, '2026-10-01').gte).toBeUndefined();
    expect(dayRange('2026-13-01', 'x')).toEqual({});
  });
});

describe('changedFields', () => {
  it('lists the columns that differ on an update, ignoring updated_at', () => {
    expect(
      changedFields({
        action: 'update',
        old: { id: '1', phone: '1', mrn: 'A', updated_at: 'x' },
        new: { id: '1', phone: '2', mrn: 'A', updated_at: 'y' },
      }),
    ).toEqual([{ key: 'phone', before: '1', after: '2' }]);
  });

  it('lists filled columns for insert and delete', () => {
    expect(
      changedFields({ action: 'insert', old: null, new: { id: '1', note: null, name: 'x' } }).map(
        (c) => c.key,
      ),
    ).toEqual(['id', 'name']);
    expect(
      changedFields({ action: 'delete', old: { id: '1', name: 'x' }, new: null }).map((c) => c.key),
    ).toEqual(['id', 'name']);
  });

  it('has nothing to show for views and exports', () => {
    expect(changedFields({ action: 'view_sensitive', old: null, new: null })).toEqual([]);
    expect(changedFields({ action: 'update', old: null, new: null })).toEqual([]);
  });
});

describe('explicitEvent / formatValue / hasFilters', () => {
  it('reads the event and reason an admin action logged', () => {
    expect(explicitEvent({ new: { event: 'soft_delete', reason: 'Duplicate' } })).toEqual({
      event: 'soft_delete',
      reason: 'Duplicate',
    });
    expect(explicitEvent({ new: { event: 'staff_create' } })).toEqual({
      event: 'staff_create',
      reason: null,
    });
    expect(explicitEvent({ new: { name: 'x' } })).toBeNull();
    expect(explicitEvent({ new: null })).toBeNull();
  });

  it('formats values briefly', () => {
    expect(formatValue(null)).toBe('-');
    expect(formatValue(12)).toBe('12');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatValue('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });

  it('detects active filters', () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ table: '' })).toBe(false);
    expect(hasFilters({ table: 'patients' })).toBe(true);
  });
});
