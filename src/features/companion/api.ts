// Supabase calls for the companion feature. Hooks live in hooks.ts / view-hooks.ts.
// RPC errors surface as thrown PostgrestErrors whose `message` is an UPPER_SNAKE code
// (see src/domain/rpc-errors.ts); screens show t(rpcErrorKey(error)).
import { supabase } from '@/lib/supabase';

import { permissionsPayload, type PermissionState } from './permissions';
import type { CompanionLinkView, PatientLinkView } from './types';

/** redeem_companion_code returns NULL (and logs a failed attempt) for a wrong/expired/used code. */
export class CodeRejectedError extends Error {
  constructor() {
    super('CODE_REJECTED');
    this.name = 'CodeRejectedError';
  }
}

// ---------------------------------------------------------------- RPCs

export async function createInvite(): Promise<string> {
  const { data, error } = await supabase.rpc('create_companion_invite');
  if (error) throw error;
  return data;
}

export async function redeemCode(code: string, relation: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_companion_code', {
    p_code: code,
    p_relation: relation,
  });
  if (error) throw error;
  if (!data) throw new CodeRejectedError();
  return data;
}

export async function decideLink(
  linkId: string,
  approve: boolean,
  permissions: PermissionState,
): Promise<void> {
  const { error } = await supabase.rpc('decide_companion_link', {
    p_link: linkId,
    p_approve: approve,
    p_perms: permissionsPayload(permissions),
  });
  if (error) throw error;
}

export async function endLink(linkId: string): Promise<void> {
  const { error } = await supabase.rpc('end_companion_link', { p_link: linkId });
  if (error) throw error;
}

// ---------------------------------------------------------------- companion side

/** The caller's own links, oldest first. The patient name is null until a link is approved (RLS). */
export async function fetchCompanionLinks(userId: string): Promise<CompanionLinkView[]> {
  const { data, error } = await supabase
    .from('companion_links')
    .select('*, patient:patients(full_name)')
    .eq('companion_user_id', userId)
    .order('requested_at', { ascending: true });
  if (error) throw error;
  return data.map(({ patient, ...link }) => ({
    ...link,
    patient_name: patient?.full_name ?? null,
  }));
}

// ---------------------------------------------------------------- patient side

export interface MyPatient {
  id: string;
  full_name: string;
  verified: boolean;
}

export async function fetchMyPatient(): Promise<MyPatient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name, verified_at')
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, full_name: data.full_name, verified: data.verified_at != null }
    : null;
}

/** Pending and approved links of the patient, newest request first. */
export async function fetchPatientLinks(patientId: string): Promise<PatientLinkView[]> {
  const { data, error } = await supabase
    .from('companion_links')
    .select('*, companion:profiles!companion_user_id(full_name)')
    .eq('patient_id', patientId)
    .in('status', ['pending', 'approved'])
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return data.map(({ companion, ...link }) => ({
    ...link,
    companion_name: companion?.full_name ?? null,
  }));
}

export interface ActiveInvite {
  id: string;
  expires_at: string;
}

/** The patient's unused, unrevoked, unexpired invite, if any. The code itself is never readable. */
export async function fetchActiveInvite(patientId: string): Promise<ActiveInvite | null> {
  const { data, error } = await supabase
    .from('companion_invites')
    .select('id, expires_at')
    .eq('patient_id', patientId)
    .is('revoked_at', null)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
