import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

import type { CompanionSection } from '@/domain/permissions';
import { companionCanView } from '@/domain/permissions';

import { useCompanionLinks } from '../hooks';
import { homeHref } from '../sections';

interface Props {
  patientId: string;
  section: CompanionSection;
  children: ReactNode;
}

/**
 * A section whose permission is off is not rendered at all; a deep link to it (e.g. from a
 * notification) goes back to the patient's home instead of showing a disabled page.
 */
export function SectionGate({ patientId, section, children }: Props) {
  const { data } = useCompanionLinks();
  const link = data?.find((l) => l.patient_id === patientId && l.status === 'approved');
  if (!companionCanView(link, section)) return <Redirect href={homeHref(patientId)} />;
  return <>{children}</>;
}
