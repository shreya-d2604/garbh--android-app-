// Read-only sections of the companion app and which ones a link may show.
// Sections are HIDDEN, not disabled, when the permission is off (PLAN.md §7.3). The database
// enforces the same rule through RLS; this only decides what to render.
import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { companionCanView, type CompanionSection } from '@/domain/permissions';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type LinkPermissions = Parameters<typeof companionCanView>[0];

export interface SectionDef {
  key: CompanionSection;
  icon: IconName;
}

/** Display order of the sections under the companion home. */
export const COMPANION_SECTIONS: readonly SectionDef[] = [
  { key: 'journey', icon: 'timeline-text-outline' },
  { key: 'appointments', icon: 'calendar-clock-outline' },
  { key: 'summaries', icon: 'text-box-check-outline' },
  { key: 'reports', icon: 'flask-outline' },
  { key: 'prescriptions', icon: 'pill' },
];

export function visibleSections(link: LinkPermissions): SectionDef[] {
  return COMPANION_SECTIONS.filter((s) => companionCanView(link, s.key));
}

export function homeHref(patientId: string): string {
  return `/companion/${patientId}`;
}

export function sectionHref(patientId: string, section: CompanionSection): string {
  return `/companion/${patientId}/${section}`;
}
