import { COMPANION_SECTIONS, homeHref, sectionHref, visibleSections } from '../sections';

const base = {
  status: 'approved' as const,
  can_view_appointments: false,
  can_view_journey: false,
  can_view_summaries: false,
  can_view_reports: false,
  can_view_prescriptions: false,
};

describe('visible companion sections', () => {
  it('hides every section when nothing is permitted', () => {
    expect(visibleSections(base)).toEqual([]);
  });

  it('shows exactly the permitted sections, in display order', () => {
    const keys = visibleSections({
      ...base,
      can_view_prescriptions: true,
      can_view_journey: true,
      can_view_summaries: true,
    }).map((s) => s.key);
    expect(keys).toEqual(['journey', 'summaries', 'prescriptions']);
  });

  it('shows everything when everything is permitted', () => {
    const all = {
      ...base,
      can_view_appointments: true,
      can_view_journey: true,
      can_view_summaries: true,
      can_view_reports: true,
      can_view_prescriptions: true,
    };
    expect(visibleSections(all)).toHaveLength(COMPANION_SECTIONS.length);
  });

  it('shows nothing unless the link is approved, whatever the flags say', () => {
    const all = { ...base, can_view_journey: true, can_view_reports: true };
    for (const status of ['pending', 'rejected', 'revoked', 'left'] as const) {
      expect(visibleSections({ ...all, status })).toEqual([]);
    }
    expect(visibleSections(null)).toEqual([]);
  });

  it('builds the deep-link routes of docs/contracts.md section 6', () => {
    expect(homeHref('p1')).toBe('/companion/p1');
    expect(sectionHref('p1', 'appointments')).toBe('/companion/p1/appointments');
    expect(sectionHref('p1', 'prescriptions')).toBe('/companion/p1/prescriptions');
    expect(sectionHref('p1', 'summaries')).toBe('/companion/p1/summaries');
    expect(sectionHref('p1', 'reports')).toBe('/companion/p1/reports');
    expect(sectionHref('p1', 'journey')).toBe('/companion/p1/journey');
  });
});
