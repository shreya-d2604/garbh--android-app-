import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  InfoBanner,
  ListItem,
  Screen,
  SectionHeader,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { logPatientView, type PatientRow } from '@/features/admin/api';
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog';
import { KeyValue } from '@/features/admin/components/KeyValue';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { ReasonDialog } from '@/features/admin/components/ReasonDialog';
import { firstParam } from '@/features/admin/components/ui';
import { adminErrorKey } from '@/features/admin/errors';
import { gaLabel, joinList } from '@/features/admin/format';
import {
  useHardDeletePatient,
  usePatient,
  usePregnancies,
  useSetPatientDeleted,
} from '@/features/admin/hooks';

const HARD_DELETE_WORD = 'DELETE';

/** One patient: details, pregnancies, merge, soft delete / restore, hard delete. */
export default function PatientDetail() {
  const { t } = useTranslation('admin');
  const id = firstParam(useLocalSearchParams<{ id: string }>().id);
  const query = usePatient(id);

  // Opening a chart is an audited view (PLAN.md §0). Fire and forget; never blocks the screen.
  useEffect(() => {
    if (id) void logPatientView(id, 'patients');
  }, [id]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: query.data?.full_name ?? t('patients.detail') }} />
      <QueryBoundary
        query={query}
        isEmpty={(p) => p === null}
        empty={{ title: t('patients.notFound'), icon: 'account-question-outline' }}
      >
        {(patient) => (patient ? <Body patient={patient} /> : null)}
      </QueryBoundary>
    </Screen>
  );
}

function Body({ patient }: { patient: PatientRow }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const pregnancies = usePregnancies(patient.id);
  const setDeleted = useSetPatientDeleted();
  const hardDelete = useHardDeletePatient();
  const [dialog, setDialog] = useState<'delete' | 'restore' | 'hard1' | 'hard2' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleted = patient.deleted_at !== null;
  const today = todayISO();
  const hasActive = (pregnancies.data ?? []).some((p) => p.status === 'active');

  const base = `/admin/patients/${patient.id}`;

  return (
    <>
      {deleted ? (
        <InfoBanner tone="warning" icon="delete-outline" message={t('patients.deletedBanner')} />
      ) : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      <Card
        title={patient.full_name}
        subtitle={patient.mrn ?? t('patients.noMrn')}
        right={
          <View style={styles.chips}>
            <StatusChip
              label={patient.verified_at ? t('patients.verified') : t('patients.unverified')}
              tone={patient.verified_at ? 'success' : 'warning'}
            />
            <StatusChip
              label={patient.registration_source === 'app' ? t('patients.app') : t('patients.desk')}
              tone="info"
            />
          </View>
        }
      >
        <KeyValue label={t('patient.dob')} value={patient.dob} />
        <KeyValue label={t('patient.phone')} value={patient.phone} />
        <KeyValue label={t('patient.email')} value={patient.email} />
        <KeyValue label={t('patient.address')} value={patient.address} />
        <KeyValue
          label={t('patient.bloodGroup')}
          value={
            patient.blood_group
              ? `${patient.blood_group}${patient.rh_negative ? ` (${t('patient.rhShort')})` : ''}`
              : null
          }
        />
        <KeyValue label={t('patient.allergies')} value={joinList(patient.allergies)} />
        <KeyValue label={t('patient.conditions')} value={joinList(patient.chronic_conditions)} />
        <KeyValue label={t('patient.emergencyContact')} value={patient.emergency_contact} />
        <KeyValue
          label={t('patients.appAccount')}
          value={patient.user_id ? t('generic.yes') : t('generic.no')}
        />
        <Button
          label={t('patients.edit')}
          variant="secondary"
          onPress={() => router.push(`${base}/edit` as never)}
        />
      </Card>

      <SectionHeader title={t('patients.pregnancies')} />
      <QueryBoundary
        query={pregnancies}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('patients.noPregnancies'), icon: 'human-pregnant' }}
      >
        {(rows) => (
          <Card>
            {rows.map((p) => {
              const ga = p.status === 'active' ? gaLabel(p.edd_final, today) : null;
              return (
                <ListItem
                  key={p.id}
                  icon="human-pregnant"
                  title={t(`pregnancy.status.${p.status}`)}
                  description={[
                    ga ? t('patients.ga', { ga }) : null,
                    p.edd_final
                      ? t('pregnancy.eddValue', { date: p.edd_final })
                      : t('patients.noDates'),
                    t(`pregnancy.risk.${p.risk_level}`),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push(`${base}/pregnancy/${p.id}` as never)}
                />
              );
            })}
          </Card>
        )}
      </QueryBoundary>
      {!hasActive && !deleted ? (
        <Button
          label={t('pregnancy.add')}
          variant="secondary"
          onPress={() => router.push(`${base}/new-pregnancy` as never)}
        />
      ) : null}

      <SectionHeader title={t('patients.manage')} />
      <Card>
        <Button
          label={t('patients.merge')}
          variant="secondary"
          onPress={() => router.push(`${base}/merge` as never)}
          disabled={deleted}
        />
        {deleted ? (
          <Button label={t('patients.restore')} onPress={() => setDialog('restore')} />
        ) : (
          <Button
            label={t('patients.softDelete')}
            variant="danger"
            onPress={() => setDialog('delete')}
          />
        )}
        <Button
          label={t('patients.hardDelete')}
          variant="text"
          onPress={() => setDialog('hard1')}
        />
      </Card>

      <ReasonDialog
        visible={dialog === 'delete'}
        title={t('patients.softDeleteTitle')}
        message={t('patients.softDeleteMessage')}
        confirmLabel={t('patients.softDelete')}
        danger
        loading={setDeleted.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={(reason) => {
          setError(null);
          setDeleted.mutate(
            { id: patient.id, deleted: true, reason },
            {
              onSuccess: () => setDialog(null),
              onError: (e) => (setError(adminErrorKey(e)), setDialog(null)),
            },
          );
        }}
      />
      <ConfirmDialog
        visible={dialog === 'restore'}
        title={t('patients.restoreTitle')}
        message={t('patients.restoreMessage')}
        confirmLabel={t('patients.restore')}
        loading={setDeleted.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={() => {
          setError(null);
          setDeleted.mutate(
            { id: patient.id, deleted: false },
            {
              onSuccess: () => setDialog(null),
              onError: (e) => (setError(adminErrorKey(e)), setDialog(null)),
            },
          );
        }}
      />
      {/* Hard delete needs two confirmations: a warning, then a reason and a typed word. */}
      <ConfirmDialog
        visible={dialog === 'hard1'}
        title={t('patients.hardDeleteTitle')}
        message={t('patients.hardDeleteWarning')}
        confirmLabel={t('actions.continue', { ns: 'common' })}
        danger
        onDismiss={() => setDialog(null)}
        onConfirm={() => setDialog('hard2')}
      />
      <ReasonDialog
        visible={dialog === 'hard2'}
        title={t('patients.hardDeleteFinalTitle')}
        message={t('patients.hardDeleteFinal')}
        confirmLabel={t('patients.hardDeleteConfirm')}
        minLength={5}
        confirmWord={HARD_DELETE_WORD}
        danger
        loading={hardDelete.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={(reason) => {
          setError(null);
          hardDelete.mutate(
            { id: patient.id, reason },
            {
              onSuccess: (filesLeft) => {
                setDialog(null);
                router.replace({
                  pathname: '/admin/patients',
                  params: { deleted: filesLeft > 0 ? 'files' : '1' },
                });
              },
              onError: (e) => (setError(adminErrorKey(e)), setDialog(null)),
            },
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({ chips: { gap: 4, alignItems: 'flex-end' } });
