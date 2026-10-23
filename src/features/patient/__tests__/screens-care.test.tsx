import { fireEvent, screen } from '@testing-library/react-native';

import { addDays, gestationalAge, todayISO } from '@/domain/pregnancy-math';
import { renderWithProviders } from '@/test-utils/render';

import CareGuideScreen from '../../../../app/patient/(more)/care-guide';
import DoctorsScreen from '../../../../app/patient/(more)/doctors';
import MoreScreen from '../../../../app/patient/(more)/more';
import PrescriptionsScreen from '../../../../app/patient/(more)/prescriptions';
import JourneyScreen from '../../../../app/patient/journey';
import { mergeCareGuide } from '../care-guide';
import * as hooks from '../hooks';
import { buildMilestonePath } from '../journey';
import { parseSummary } from '../summary';
import {
  consultation,
  doctor,
  guidance,
  item,
  member,
  milestone,
  patientContext,
  queryFailed,
  queryLoading,
  queryOf,
  visit,
  weekContent,
} from '../test-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../hooks');

const h = jest.mocked(hooks);
const today = todayISO();
const edd = addDays(today, 280 - (22 * 7 + 3)); // 22w3d today

function base(over: Parameters<typeof patientContext>[1] = {}) {
  h.usePullToRefresh.mockReturnValue({ refreshing: false, onRefresh: jest.fn() });
  h.usePatientContext.mockReturnValue(queryOf(patientContext(edd, over)));
  h.useDoctorMap.mockReturnValue(new Map([['doc-asha', doctor()]]));
}

beforeEach(() => jest.clearAllMocks());

describe('journey screen', () => {
  function mockJourney() {
    base();
    h.useWeekContent.mockReturnValue(
      queryOf([
        weekContent({ week: 16, baby_size_label: 'Avocado' }),
        weekContent({ week: 20, baby_size_label: 'Banana' }),
      ]),
    );
    const ga = gestationalAge(edd, today);
    const nodes = buildMilestonePath({
      visits: [
        visit({
          id: 'v4',
          seq: 4,
          target_week: 20,
          status: 'completed',
          title: 'Anomaly scan visit',
        }),
        visit({
          id: 'v6',
          seq: 6,
          target_week: 28,
          title: 'Third trimester visit',
          purpose: 'Sugar test and blood count',
          due_from: addDays(today, 30),
          due_to: addDays(today, 43),
          recommended_tests: ['OGTT'],
        }),
      ],
      milestones: [
        milestone({
          key: 'ogtt',
          title: 'Sugar test (OGTT)',
          week_from: 24,
          week_to: 28,
          description: 'Checks for diabetes in pregnancy.',
        }),
      ],
      ga,
      today,
      rhNegative: false,
    });
    h.useMilestonePath.mockReturnValue(queryOf(nodes));
  }

  it('shows the timeline, this week, what is next and the milestone path', async () => {
    mockJourney();
    await renderWithProviders(<JourneyScreen />);
    expect(screen.getByText('Week 22 + 3 days')).toBeTruthy();
    expect(screen.getByText('Week 20')).toBeTruthy(); // week-by-week swiper starts on her week
    expect(screen.getByText('What is next')).toBeTruthy();
    expect(screen.getByText('Your journey')).toBeTruthy();
    expect(screen.getAllByText('Sugar test (OGTT)').length).toBeGreaterThan(0);
    expect(screen.getByText('You are here: Week 22 + 3 days')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('expands a node and books that visit', async () => {
    mockJourney();
    await renderWithProviders(<JourneyScreen />);
    await fireEvent.press(screen.getByLabelText('Third trimester visit'));
    await fireEvent.press(screen.getByText('Book this visit'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/book?visit=v6');
  });

  it('has loading and error states for the path', async () => {
    mockJourney();
    h.useMilestonePath.mockReturnValue(queryLoading());
    const view = await renderWithProviders(<JourneyScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const refetch = jest.fn();
    h.useMilestonePath.mockReturnValue(queryFailed(refetch));
    await view.rerender(<JourneyScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('care guide screen', () => {
  const summary = parseSummary({
    summary: {
      headline: 'h',
      plain_language_summary: 'p',
      foods_to_eat: [{ item: 'Spinach, beetroot, jaggery, dates', why: 'Iron-rich' }],
    },
  });

  it('labels doctor-advised and general items and always shows warning signs first', async () => {
    base();
    const guide = mergeCareGuide({
      curated: [
        guidance({
          id: 'w',
          kind: 'warning_sign',
          text: 'Bleeding or leaking fluid',
          reason: 'Go to hospital now',
        }),
        guidance({ id: 'f', kind: 'food_recommend', text: 'Green leafy vegetables daily' }),
        guidance({ id: 'a', kind: 'food_avoid', text: 'Raw papaya' }),
      ],
      summary,
      trimester: 2,
      tags: new Set(),
    });
    h.useCareGuide.mockReturnValue(queryOf({ guide, doctorName: 'Dr. Asha Rao' }));
    await renderWithProviders(<CareGuideScreen />);

    expect(screen.getByText('Warning signs')).toBeTruthy();
    expect(screen.getByText('Bleeding or leaking fluid')).toBeTruthy();
    expect(screen.getByText('Advised by Dr. Asha Rao')).toBeTruthy();
    expect(screen.getAllByText('General guidance').length).toBe(2);
    expect(screen.getByText('Spinach, beetroot, jaggery, dates')).toBeTruthy();
    expect(screen.getByText('Call the hospital now')).toBeTruthy();
    // Nothing curated for "medicines": friendly placeholder, section still present.
    expect(screen.getByText('Nothing listed for you right now.')).toBeTruthy();
  });

  it('falls back to the built-in warning signs when none are curated', async () => {
    base();
    const guide = mergeCareGuide({ curated: [], summary: null, trimester: 2, tags: new Set() });
    h.useCareGuide.mockReturnValue(queryOf({ guide, doctorName: null }));
    await renderWithProviders(<CareGuideScreen />);
    expect(screen.getByText('Bleeding from the vagina')).toBeTruthy();
    expect(screen.getByText('Your baby is moving less than usual')).toBeTruthy();
  });

  it('passes the patient’s trimester, conditions and risk factors to the guide', async () => {
    base({ conditions: ['anemia'], risks: ['GDM'] });
    h.useCareGuide.mockReturnValue(queryLoading());
    await renderWithProviders(<CareGuideScreen />);
    expect(h.useCareGuide).toHaveBeenCalledWith(2, ['anemia'], ['GDM']);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});

describe('prescriptions screen', () => {
  it('lists current medicines and the history with the doctor’s advice', async () => {
    base();
    const c = consultation({
      id: 'c1',
      advice: 'Walk 20 minutes daily.',
      next_visit_after_weeks: 4,
    });
    const current = item({
      id: 'p1',
      consultation_id: 'c1',
      start_date: addDays(today, -5),
      end_date: addDays(today, 30),
      frequency: '1-0-1',
    });
    const stopped = item({
      id: 'p2',
      consultation_id: 'c1',
      drug_name: 'Old tablet',
      end_date: addDays(today, -2),
    });
    h.usePrescriptions.mockReturnValue(
      queryOf({
        items: [current, stopped],
        groups: [{ consultation: c, items: [current, stopped] }],
      }),
    );
    await renderWithProviders(<PrescriptionsScreen />);
    expect(screen.getByText('Medicines to take now')).toBeTruthy();
    expect(screen.getAllByText('Morning, Night').length).toBe(2); // now + history
    expect(screen.getByText('Walk 20 minutes daily.')).toBeTruthy();
    expect(screen.getByText('Next visit: after 4 weeks')).toBeTruthy();
    // History keeps the stopped one; the "now" list does not.
    expect(screen.getAllByText('Ferrous ascorbate 100 mg Tablet').length).toBe(2);
    expect(screen.getAllByText(/^Old tablet/).length).toBe(1);
  });

  it('has empty and error states', async () => {
    base();
    h.usePrescriptions.mockReturnValue(queryOf({ items: [], groups: [] }));
    const view = await renderWithProviders(<PrescriptionsScreen />);
    expect(screen.getByText('No medicines yet')).toBeTruthy();
    h.usePrescriptions.mockReturnValue(queryFailed());
    await view.rerender(<PrescriptionsScreen />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});

describe('my doctors screen', () => {
  it('shows the primary doctor first, then the covering doctor', async () => {
    base();
    h.useCareTeam.mockReturnValue(
      queryOf([
        member({
          id: 'b',
          doctor_id: 'doc-meera',
          care_role: 'backup',
          note: 'Covers Dr. Asha’s leave',
          doctor: doctor({ id: 'doc-meera', full_name: 'Dr. Meera Nair' }),
        }),
        member({ id: 'p', care_role: 'primary' }),
      ]) as never,
    );
    await renderWithProviders(<DoctorsScreen />);
    const names = screen.getAllByText(/^Dr\. /).map((n) => n.props.children);
    expect(names.indexOf('Dr. Asha Rao')).toBeLessThan(names.indexOf('Dr. Meera Nair'));
    expect(screen.getByText('Your main doctor')).toBeTruthy();
    expect(screen.getByText('Covering doctor')).toBeTruthy();
    expect(screen.getByText('Covers Dr. Asha’s leave')).toBeTruthy();
  });

  it('invites a new patient to book her first visit', async () => {
    base();
    h.useCareTeam.mockReturnValue(queryOf([]) as never);
    await renderWithProviders(<DoctorsScreen />);
    await fireEvent.press(screen.getByText('Book first visit'));
    expect(mockPush).toHaveBeenCalledWith('/patient/first-booking');
  });
});

describe('more screen', () => {
  it('links to the other screens; companions are locked until verified', async () => {
    base({ verified: false });
    await renderWithProviders(<MoreScreen />);
    await fireEvent.press(screen.getByText('Care guide'));
    expect(mockPush).toHaveBeenCalledWith('/patient/care-guide');
    expect(
      screen.getByText('Available once your account is verified at the hospital'),
    ).toBeTruthy();
    mockPush.mockClear();
    await fireEvent.press(screen.getByText('My family members'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens My companions once verified', async () => {
    base({ verified: true });
    await renderWithProviders(<MoreScreen />);
    await fireEvent.press(screen.getByText('My family members'));
    expect(mockPush).toHaveBeenCalledWith('/patient/companions');
  });
});
