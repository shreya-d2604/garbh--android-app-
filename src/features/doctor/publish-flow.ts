// Publishing a consultation (PLAN.md §7.4 #4): save -> publish -> optional AI draft -> mark the visit done.
// Each later step may fail without undoing the earlier ones, so the outcome reports them separately.
import * as api from './api';
import { canStart } from './queue';
import type { ApptStatus } from './types';

export interface PublishArgs {
  save: api.SaveConsultationArgs;
  appointmentStatus: ApptStatus;
  alreadyPublished: boolean;
  withAiSummary: boolean;
}

export interface PublishOutcome {
  consultationId: string;
  /** Edge Function error code when the optional AI summary could not be started. */
  aiError: string | null;
  /** True when the appointment could not be marked completed (e.g. the RPC is not merged yet). */
  statusNotUpdated: boolean;
}

export async function publishFlow(args: PublishArgs): Promise<PublishOutcome> {
  const consultationId = await api.saveConsultation(args.save);
  if (!args.alreadyPublished) await api.publishConsultation(consultationId);

  let aiError: string | null = null;
  if (args.withAiSummary && !args.alreadyPublished) {
    const res = await api.invokeSummaryFunction('summarize-consultation', {
      consultation_id: consultationId,
    });
    if (!res.ok) aiError = res.code;
  }

  let statusNotUpdated = false;
  if (args.appointmentStatus !== 'completed') {
    try {
      if (canStart(args.appointmentStatus))
        await api.setAppointmentStatus(args.save.appointmentId, 'in_consultation');
      await api.setAppointmentStatus(args.save.appointmentId, 'completed');
    } catch {
      statusNotUpdated = true;
    }
  }
  return { consultationId, aiError, statusNotUpdated };
}
