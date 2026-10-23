import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, QueryBoundary } from '@/components';
import type { ISODate } from '@/domain/pregnancy-math';

import { usePatientContext } from '../hooks';
import type { HospitalSettings, PatientBasics, PregnancyBasics } from '../types';

export interface ReadyContext {
  patient: PatientBasics;
  pregnancy: PregnancyBasics;
  /** edd_final of the active pregnancy. */
  edd: ISODate;
  settings: HospitalSettings;
}

/**
 * Loads the patient + active pregnancy once and only renders `children` when both exist, so
 * every screen below can rely on them. Handles loading, error and "no active pregnancy".
 */
export function PatientGate({ children }: { children: (ctx: ReadyContext) => ReactNode }) {
  const { t } = useTranslation('patient');
  const query = usePatientContext();
  return (
    <QueryBoundary query={query}>
      {({ patient, pregnancy, settings }) =>
        pregnancy?.edd_final ? (
          children({ patient, pregnancy, edd: pregnancy.edd_final, settings })
        ) : (
          <EmptyState
            icon="human-pregnant"
            title={t('gate.noPregnancyTitle')}
            message={t('gate.noPregnancyMessage')}
          />
        )
      }
    </QueryBoundary>
  );
}
