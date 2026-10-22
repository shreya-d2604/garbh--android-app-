import * as api from '../api';
import { publishFlow, type PublishArgs } from '../publish-flow';

jest.mock('../api', () => ({
  saveConsultation: jest.fn(),
  publishConsultation: jest.fn(),
  invokeSummaryFunction: jest.fn(),
  setAppointmentStatus: jest.fn(),
}));

const mocked = api as jest.Mocked<typeof api>;

const args = (over: Partial<PublishArgs> = {}): PublishArgs => ({
  save: { appointmentId: 'a1' } as PublishArgs['save'],
  appointmentStatus: 'in_consultation',
  alreadyPublished: false,
  withAiSummary: false,
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  mocked.saveConsultation.mockResolvedValue('c1');
  mocked.publishConsultation.mockResolvedValue();
  mocked.setAppointmentStatus.mockResolvedValue();
  mocked.invokeSummaryFunction.mockResolvedValue({ ok: true, data: { summary_id: 's1' } });
});

describe('publishFlow', () => {
  it('saves, publishes and marks the visit completed, in that order', async () => {
    const order: string[] = [];
    mocked.saveConsultation.mockImplementation(async () => (order.push('save'), 'c1'));
    mocked.publishConsultation.mockImplementation(async () => void order.push('publish'));
    mocked.setAppointmentStatus.mockImplementation(async (_id, status) => void order.push(status));

    const res = await publishFlow(args());

    expect(order).toEqual(['save', 'publish', 'completed']);
    expect(mocked.publishConsultation).toHaveBeenCalledWith('c1');
    expect(res).toEqual({ consultationId: 'c1', aiError: null, statusNotUpdated: false });
  });

  it('starts the consultation first when it was never started', async () => {
    await publishFlow(args({ appointmentStatus: 'checked_in' }));
    expect(mocked.setAppointmentStatus.mock.calls.map((c) => c[1])).toEqual([
      'in_consultation',
      'completed',
    ]);
  });

  it('does not touch the status of a visit that is already completed, nor republish', async () => {
    await publishFlow(args({ appointmentStatus: 'completed', alreadyPublished: true }));
    expect(mocked.publishConsultation).not.toHaveBeenCalled();
    expect(mocked.setAppointmentStatus).not.toHaveBeenCalled();
  });

  it('asks for the AI summary only when requested', async () => {
    await publishFlow(args());
    expect(mocked.invokeSummaryFunction).not.toHaveBeenCalled();
    await publishFlow(args({ withAiSummary: true }));
    expect(mocked.invokeSummaryFunction).toHaveBeenCalledWith('summarize-consultation', {
      consultation_id: 'c1',
    });
  });

  it('keeps going when the AI summary fails and reports the code', async () => {
    mocked.invokeSummaryFunction.mockResolvedValue({ ok: false, code: 'NOT_IMPLEMENTED' });
    const res = await publishFlow(args({ withAiSummary: true }));
    expect(res.aiError).toBe('NOT_IMPLEMENTED');
    expect(mocked.setAppointmentStatus).toHaveBeenCalledWith('a1', 'completed');
  });

  it('keeps the published consultation when the status RPC is not available yet', async () => {
    mocked.setAppointmentStatus.mockRejectedValue({ message: 'NOT_IMPLEMENTED' });
    const res = await publishFlow(args());
    expect(res).toMatchObject({ consultationId: 'c1', statusNotUpdated: true });
  });

  it('stops before publishing when saving fails', async () => {
    mocked.saveConsultation.mockRejectedValue({ message: 'NOT_ALLOWED' });
    await expect(publishFlow(args())).rejects.toEqual({ message: 'NOT_ALLOWED' });
    expect(mocked.publishConsultation).not.toHaveBeenCalled();
  });
});
