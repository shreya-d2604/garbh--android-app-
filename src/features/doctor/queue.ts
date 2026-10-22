// Today queue (PLAN.md §7.4 #1): grouping, chips and start rules. Pure.
import type { AppointmentRow, ApptStatus, BookingChannel } from './types';

export interface QueueItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: ApptStatus;
  reason: string | null;
  channel: BookingChannel;
  pregnancyId: string;
  patientId: string;
  patientName: string;
  mrn: string | null;
  verified: boolean;
  eddFinal: string | null;
  riskLevel: 'low' | 'moderate' | 'high';
}

/** Shape of the joined row returned by the queue query (see api.ts). */
export interface QueueRow
  extends Pick<
    AppointmentRow,
    | 'id'
    | 'starts_at'
    | 'ends_at'
    | 'status'
    | 'reason'
    | 'booking_channel'
    | 'pregnancy_id'
    | 'patient_id'
  > {
  patients: { full_name: string; mrn: string | null; is_verified: boolean } | null;
  pregnancies: { edd_final: string | null; risk_level: 'low' | 'moderate' | 'high' } | null;
}

export function toQueueItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    reason: row.reason,
    channel: row.booking_channel,
    pregnancyId: row.pregnancy_id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? '',
    mrn: row.patients?.mrn ?? null,
    verified: row.patients?.is_verified ?? false,
    eddFinal: row.pregnancies?.edd_final ?? null,
    riskLevel: row.pregnancies?.risk_level ?? 'low',
  };
}

/** Display order of the groups: what needs the doctor now comes first. */
export const QUEUE_GROUP_ORDER = ['in_consultation', 'checked_in', 'booked', 'done', 'closed'] as const;
export type QueueGroupKey = (typeof QUEUE_GROUP_ORDER)[number];

export interface QueueGroup {
  key: QueueGroupKey;
  items: QueueItem[];
}

export function queueGroupFor(status: ApptStatus): QueueGroupKey {
  switch (status) {
    case 'in_consultation':
      return 'in_consultation';
    case 'checked_in':
      return 'checked_in';
    case 'booked':
    case 'confirmed':
      return 'booked';
    case 'completed':
      return 'done';
    case 'cancelled':
    case 'no_show':
      return 'closed';
  }
}

/** Groups by status (booked + confirmed together), each group sorted by start time. Empty groups are dropped. */
export function groupQueue(items: readonly QueueItem[]): QueueGroup[] {
  const sorted = [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return QUEUE_GROUP_ORDER.map((key) => ({
    key,
    items: sorted.filter((i) => queueGroupFor(i.status) === key),
  })).filter((g) => g.items.length > 0);
}

/** Counts shown in the Today summary line. */
export function queueCounts(items: readonly QueueItem[]) {
  const count = (key: QueueGroupKey) => items.filter((i) => queueGroupFor(i.status) === key).length;
  return {
    total: items.filter((i) => queueGroupFor(i.status) !== 'closed').length,
    waiting: count('checked_in'),
    inConsultation: count('in_consultation'),
    done: count('done'),
  };
}

/** A consultation can be started from these statuses (contracts §2 set_appointment_status). */
export function canStart(status: ApptStatus): boolean {
  return status === 'booked' || status === 'confirmed' || status === 'checked_in';
}

export function queueChips(item: Pick<QueueItem, 'channel' | 'verified'>) {
  return { app: item.channel === 'app', newUnverified: !item.verified };
}

/** Start and end of the device-local day containing `now`, as ISO instants. */
export function dayRange(now: Date): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
