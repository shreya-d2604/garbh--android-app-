import { fireEvent, screen } from '@testing-library/react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

import { addDays, todayISO } from '@/domain/pregnancy-math';
import { renderWithProviders } from '@/test-utils/render';

import ReportScreen from '../../../../app/patient/reports/[id]';
import ReportsScreen from '../../../../app/patient/reports/index';
import SummaryScreen from '../../../../app/patient/reports/summaries/[id]';
import TrendsScreen from '../../../../app/patient/reports/trends';
import { originOf } from '../components/FileViewer';
import * as hooks from '../hooks';
import {
  consultation,
  doctor,
  lab,
  patientContext,
  queryFailed,
  queryLoading,
  queryOf,
  report,
} from '../test-fixtures';
import { buildTrends } from '../reports';

const mockPush = jest.fn();
let mockParams: Record<string, string> = { id: 'r1' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-screen-capture', () => ({ usePreventScreenCapture: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../hooks');

const h = jest.mocked(hooks);
const today = todayISO();
const edd = addDays(today, 140); // 20 weeks in; reports from last month are in trimester 2

const summaryRow = {
  id: 's1',
  pregnancy_id: 'preg-1',
  source_type: 'report' as const,
  source_id: 'r1',
  reviewed_by: 'doc-asha',
  published_at: '2026-09-24T05:30:00.000Z',
  final: {
    summary: {
      headline: 'Your haemoglobin is slightly low.',
      plain_language_summary: 'Your blood test shows mild anaemia.',
      key_findings: [
        {
          finding: 'Hb 10.4 g/dL',
          status: 'attention',
          explanation: 'A little below the normal range.',
        },
      ],
      foods_to_eat: [{ item: 'Spinach, beetroot', why: 'Iron-rich' }],
      foods_to_avoid: [{ item: 'Tea with meals', why: 'Reduces iron absorption' }],
      medicines_to_avoid: [],
      lifestyle_tips: ['Take iron after food'],
      questions_for_doctor: ['Do I need an iron injection?'],
      doctor_attention_flags: ['SECRET FLAG'],
    },
  },
};

function base() {
  h.usePullToRefresh.mockReturnValue({ refreshing: false, onRefresh: jest.fn() });
  h.usePatientContext.mockReturnValue(queryOf(patientContext(edd)));
  h.useDoctorMap.mockReturnValue(new Map([['doc-asha', doctor()]]));
  h.usePublishedSummaries.mockReturnValue(queryOf([summaryRow]));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'r1' };
});

describe('reports list', () => {
  it('groups reports by trimester with a "Doctor reviewed" chip and opens them', async () => {
    base();
    const reportDate = addDays(today, -20);
    h.useReports.mockReturnValue(
      queryOf([
        report({ id: 'r1', title: 'CBC + TSH', report_date: reportDate }),
        report({ id: 'r2', title: 'Urine test', report_date: addDays(today, -60) }),
      ]),
    );
    await renderWithProviders(<ReportsScreen />);

    expect(screen.getByText("Doctor's summaries")).toBeTruthy();
    expect(screen.getByText('Your haemoglobin is slightly low.')).toBeTruthy();
    expect(screen.getByText('CBC + TSH')).toBeTruthy();
    expect(screen.getAllByText('Doctor reviewed')).toHaveLength(1); // only r1 has a summary
    expect(screen.getByText('2nd Trimester')).toBeTruthy();

    await fireEvent.press(screen.getByText('CBC + TSH'));
    expect(mockPush).toHaveBeenCalledWith('/patient/reports/r1');
    await fireEvent.press(screen.getByText('See my trends'));
    expect(mockPush).toHaveBeenCalledWith('/patient/reports/trends');
  });

  it('has empty, loading and error states', async () => {
    base();
    h.useReports.mockReturnValue(queryOf([]));
    h.usePublishedSummaries.mockReturnValue(queryOf([]));
    const view = await renderWithProviders(<ReportsScreen />);
    expect(screen.getByText('No reports yet')).toBeTruthy();
    expect(screen.getByText(/No summaries yet/)).toBeTruthy();

    h.useReports.mockReturnValue(queryLoading());
    await view.rerender(<ReportsScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();

    const refetch = jest.fn();
    h.useReports.mockReturnValue(queryFailed(refetch));
    await view.rerender(<ReportsScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('report detail', () => {
  function mockReport() {
    base();
    h.useReport.mockReturnValue(
      queryOf(report({ id: 'r1', title: 'CBC + TSH', doctor_comment: 'Please take iron daily.' })),
    );
    h.useReportLabResults.mockReturnValue(
      queryOf([
        lab({ id: 'l1', test_code: 'HB', value_num: 10.4, flag: 'low' }),
        lab({
          id: 'l2',
          test_code: 'TSH',
          raw_name: 'TSH',
          value_num: 2.1,
          unit: 'mIU/L',
          ref_low: 0.2,
          ref_high: 3,
          flag: 'normal',
        }),
      ]),
    );
    h.useLabTests.mockReturnValue(queryOf([{ code: 'HB', name: 'Haemoglobin', unit: 'g/dL' }]));
    h.useReportFiles.mockReturnValue(queryOf([]));
  }

  it('shows checked values with low/normal chips, the doctor’s note and the linked summary, and blocks screenshots', async () => {
    mockReport();
    await renderWithProviders(<ReportScreen />);
    expect(usePreventScreenCapture).toHaveBeenCalled();
    expect(screen.getByText('Haemoglobin')).toBeTruthy();
    expect(screen.getByText('10.4 g/dL · Normal: 11 to 15')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();
    expect(screen.getByText('Please take iron daily.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Read the summary'));
    expect(mockPush).toHaveBeenCalledWith('/patient/reports/summaries/s1');
  });

  it('explains when no values are checked yet', async () => {
    mockReport();
    h.useReportLabResults.mockReturnValue(queryOf([]));
    await renderWithProviders(<ReportScreen />);
    expect(screen.getByText(/has not checked the results yet/)).toBeTruthy();
  });

  it('shows a friendly error with a hint when a file cannot be opened', async () => {
    mockReport();
    h.useReportFiles.mockReturnValue(
      queryOf([
        {
          id: 'f1',
          report_id: 'r1',
          storage_path: 'p/r/f1.pdf',
          mime_type: 'application/pdf',
          page_no: 1,
        },
      ]),
    );
    h.useReportFileUrl.mockReturnValue(queryFailed());
    await renderWithProviders(<ReportScreen />);
    expect(screen.getByText('Please check your connection and try again.')).toBeTruthy();
    expect(screen.getByText('If this keeps happening, ask the hospital for a copy.')).toBeTruthy();
  });

  it('offers a PDF fallback button once the link is ready, without exposing the link as text', async () => {
    mockReport();
    h.useReportFiles.mockReturnValue(
      queryOf([
        {
          id: 'f1',
          report_id: 'r1',
          storage_path: 'p/r/f1.pdf',
          mime_type: 'application/pdf',
          page_no: 1,
        },
      ]),
    );
    h.useReportFileUrl.mockReturnValue(queryOf('https://files.example/signed?token=abc'));
    await renderWithProviders(<ReportScreen />);
    expect(screen.getByText('Open the file')).toBeTruthy();
    expect(screen.queryByText(/token=abc/)).toBeNull();
  });
});

describe('summary detail', () => {
  it('shows the doctor-approved summary, never the doctor-only flags, and blocks screenshots', async () => {
    base();
    mockParams = { id: 's1' };
    h.usePublishedSummary.mockReturnValue(queryOf(summaryRow));
    await renderWithProviders(<SummaryScreen />);
    expect(usePreventScreenCapture).toHaveBeenCalled();
    expect(screen.getByText('Your haemoglobin is slightly low.')).toBeTruthy();
    expect(screen.getByText(/^Checked by Dr\. Asha Rao/)).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Tea with meals')).toBeTruthy();
    expect(screen.getByText('Do I need an iron injection?')).toBeTruthy();
    expect(screen.queryByText(/SECRET FLAG/)).toBeNull();
    await fireEvent.press(screen.getByText('See the report'));
    expect(mockPush).toHaveBeenCalledWith('/patient/reports/r1');
  });

  it('handles a summary it cannot read', async () => {
    base();
    mockParams = { id: 's1' };
    h.usePublishedSummary.mockReturnValue(queryOf({ ...summaryRow, final: { nonsense: true } }));
    await renderWithProviders(<SummaryScreen />);
    expect(screen.getByText('We cannot show this summary')).toBeTruthy();
  });
});

describe('trends', () => {
  it('shows the verified-only note and a card per measure', async () => {
    base();
    const trends = buildTrends(
      [lab({ test_code: 'HB', value_num: 10.4, observed_on: addDays(today, -20) })],
      [consultation({ weight_kg: 60, bp_systolic: 110, bp_diastolic: 70 })],
      edd,
    );
    h.useTrends.mockReturnValue(queryOf(trends));
    await renderWithProviders(<TrendsScreen />);
    expect(screen.getByText('Only results checked by your doctor are shown.')).toBeTruthy();
    expect(screen.getByText('Haemoglobin')).toBeTruthy();
    expect(screen.getByText('Blood pressure')).toBeTruthy();
    // No fasting-sugar readings: that card says so instead of drawing an empty chart.
    expect(screen.getAllByText('No checked readings yet.').length).toBe(2);
  });

  it('shows an empty state when nothing is verified yet', async () => {
    base();
    h.useTrends.mockReturnValue(queryOf(buildTrends([], [], edd)));
    await renderWithProviders(<TrendsScreen />);
    expect(screen.getByText('No trends yet')).toBeTruthy();
  });
});

describe('originOf', () => {
  it('keeps scheme, host and port only', () => {
    expect(originOf('http://127.0.0.1:54321/storage/v1/object/sign/x?token=1')).toBe(
      'http://127.0.0.1:54321',
    );
    expect(originOf('https://abc.supabase.co/x')).toBe('https://abc.supabase.co');
    expect(originOf('not a url')).toBeNull();
  });
});
