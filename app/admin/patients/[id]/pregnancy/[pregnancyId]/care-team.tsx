import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ConfirmDialog,
  InfoBanner,
  QueryBoundary,
  Screen,
  SectionHeader,
  StatusChip,
} from '@/components';
import { logPatientView, type CareMember } from '@/features/admin/api';
import { DoctorPickerDialog } from '@/features/admin/components/DoctorPickerDialog';
import { firstParam } from '@/features/admin/components/ui';
import { adminErrorKey } from '@/features/admin/errors';
import {
  useAddBackup,
  useCareTeam,
  useDoctors,
  useRemoveCareMember,
  useSetPrimary,
} from '@/features/admin/hooks';

/** Care-team management (PLAN.md §7.6 #3): change the primary, add or remove backups. */
export default function CareTeam() {
  const { t } = useTranslation('admin');
  const params = useLocalSearchParams<{ id: string; pregnancyId: string }>();
  const pregnancyId = firstParam(params.pregnancyId);
  const patientId = firstParam(params.id);
  const team = useCareTeam(pregnancyId);
  const doctors = useDoctors();
  const setPrimary = useSetPrimary();
  const addBackup = useAddBackup();
  const remove = useRemoveCareMember();
  const [dialog, setDialog] = useState<'primary' | 'backup' | null>(null);
  const [removing, setRemoving] = useState<CareMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError(adminErrorKey(e as Error));
    setDialog(null);
    setRemoving(null);
  };
  const done = (message: string) => {
    setNotice(message);
    setDialog(null);
    setRemoving(null);
  };
  const reset = () => {
    setError(null);
    setNotice(null);
  };

  // Opening a care team counts as viewing the chart (audit-logged once per visit to the screen).
  useEffect(() => {
    if (patientId && pregnancyId) void logPatientView(patientId, 'care_team', pregnancyId);
  }, [patientId, pregnancyId]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('careTeam.title') }} />
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <QueryBoundary query={team}>
        {(members) => {
          const primary = members.find((m) => m.care_role === 'primary');
          const backups = members.filter((m) => m.care_role === 'backup');
          return (
            <>
              <SectionHeader title={t('careTeam.primary')} />
              {primary ? (
                <Card
                  title={primary.doctor?.full_name ?? '-'}
                  subtitle={t('careTeam.since', { date: primary.added_at.slice(0, 10) })}
                  right={
                    primary.doctor?.is_active === false ? (
                      <StatusChip label={t('careTeam.deactivated')} tone="danger" />
                    ) : null
                  }
                />
              ) : (
                <InfoBanner tone="warning" message={t('careTeam.noPrimary')} />
              )}
              <Button
                label={primary ? t('careTeam.changePrimary') : t('careTeam.setPrimary')}
                onPress={() => (reset(), setDialog('primary'))}
              />

              <SectionHeader title={t('careTeam.backups')} />
              {backups.length === 0 ? <InfoBanner message={t('careTeam.noBackups')} /> : null}
              {backups.map((m) => (
                <Card
                  key={m.id}
                  title={m.doctor?.full_name ?? '-'}
                  subtitle={m.note ?? undefined}
                  right={
                    m.doctor?.is_active === false ? (
                      <StatusChip label={t('careTeam.deactivated')} tone="danger" />
                    ) : null
                  }
                >
                  <Button
                    label={t('careTeam.remove')}
                    variant="text"
                    onPress={() => (reset(), setRemoving(m))}
                    accessibilityLabel={t('careTeam.removeNamed', {
                      name: m.doctor?.full_name ?? '',
                    })}
                  />
                </Card>
              ))}
              <Button
                label={t('careTeam.addBackup')}
                variant="secondary"
                onPress={() => (reset(), setDialog('backup'))}
              />

              <DoctorPickerDialog
                visible={dialog === 'primary'}
                title={t('careTeam.pickPrimary')}
                confirmLabel={t('careTeam.confirmPrimary')}
                doctors={doctors.data ?? []}
                excludeIds={primary ? [primary.doctor_id] : []}
                loading={setPrimary.isPending}
                onDismiss={() => setDialog(null)}
                onConfirm={(doctorId) =>
                  setPrimary.mutate(
                    { pregnancyId, doctorId },
                    { onSuccess: () => done(t('careTeam.primaryChanged')), onError: fail },
                  )
                }
              />
              <DoctorPickerDialog
                visible={dialog === 'backup'}
                title={t('careTeam.pickBackup')}
                confirmLabel={t('careTeam.addBackup')}
                doctors={doctors.data ?? []}
                excludeIds={members.map((m) => m.doctor_id)}
                withNote
                loading={addBackup.isPending}
                onDismiss={() => setDialog(null)}
                onConfirm={(doctorId, note) =>
                  addBackup.mutate(
                    { pregnancyId, doctorId, note },
                    { onSuccess: () => done(t('careTeam.backupAdded')), onError: fail },
                  )
                }
              />
            </>
          );
        }}
      </QueryBoundary>
      <ConfirmDialog
        visible={removing !== null}
        title={t('careTeam.removeTitle')}
        message={t('careTeam.removeMessage', { name: removing?.doctor?.full_name ?? '' })}
        confirmLabel={t('careTeam.remove')}
        danger
        loading={remove.isPending}
        onDismiss={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          remove.mutate(
            { pregnancyId, doctorId: removing.doctor_id },
            { onSuccess: () => done(t('careTeam.removed')), onError: fail },
          )
        }
      />
    </Screen>
  );
}
