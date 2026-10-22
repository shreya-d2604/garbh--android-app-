import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner, Screen, StatusChip, palette, spacing } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import type { DueVisitRow } from '@/features/reception/api';
import { localDateOf } from '@/features/reception/calendar';
import { ConfirmDialog } from '@/features/reception/components/ConfirmDialog';
import { QueryState } from '@/features/reception/components/QueryState';
import { formatISODay } from '@/features/reception/format';
import { useMarkVisitContacted, useRefetchOnFocus, useVisitsDue } from '@/features/reception/hooks';
import type { DueKind } from '@/features/reception/visits-due';

const TONE = { overdue: 'danger', open: 'info', soon: 'neutral' } as const satisfies Record<
  DueKind,
  string
>;

/** Visits due (PLAN.md §7.5 #4): planned visits opening within 14 days with no appointment, plus overdue ones. */
export default function VisitsDue() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const visits = useVisitsDue();
  const contacted = useMarkVisitContacted();
  const [calling, setCalling] = useState<DueVisitRow | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useRefetchOnFocus(visits.refetch);

  async function markCalled() {
    if (!calling) return;
    setError(null);
    try {
      await contacted.mutateAsync({ visit: calling.id, note: note.trim() });
      setCalling(null);
      setNote('');
    } catch (e) {
      setCalling(null);
      setError(rpcErrorKey(e as { message?: string; code?: string }));
    }
  }

  return (
    <Screen
      edges={[]}
      title={t('visits.title')}
      subtitle={t('visits.subtitle')}
      refreshing={visits.isRefetching}
      onRefresh={() => void visits.refetch()}
    >
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Button
        label={t('visits.unavailableLink')}
        variant="secondary"
        onPress={() => router.push('/reception/unavailable')}
      />
      <QueryState
        isPending={visits.isPending}
        isError={visits.isError}
        onRetry={() => void visits.refetch()}
        isEmpty={(visits.data ?? []).length === 0}
        emptyIcon="calendar-check-outline"
        emptyTitle={t('visits.emptyTitle')}
        emptyMessage={t('visits.emptyMessage')}
      >
        {(visits.data ?? []).map((v) => (
          <Card
            key={v.id}
            title={v.patient.full_name}
            subtitle={`${v.seq}. ${v.title}`}
            right={<StatusChip label={t(`visits.kind.${v.kind}`)} tone={TONE[v.kind]} />}
          >
            <Text variant="bodySmall" style={styles.muted}>
              {v.due_from && v.due_to
                ? t('visits.window', { from: formatISODay(v.due_from), to: formatISODay(v.due_to) })
                : t('visits.noWindow')}
              {v.patient.phone ? ` · ${v.patient.phone}` : ''}
            </Text>
            {v.contacted_at ? (
              <Text variant="bodySmall" style={styles.muted}>
                {t('visits.called', { date: formatISODay(localDateOf(v.contacted_at)) })}
                {v.contact_note ? `: ${v.contact_note}` : ''}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button
                label={t('visits.book')}
                variant="secondary"
                fullWidth={false}
                onPress={() =>
                  router.push({
                    pathname: '/reception/book',
                    params: { patient: v.patient.id, visit: v.id },
                  })
                }
              />
              <Button
                label={t('visits.called_action')}
                variant="text"
                onPress={() => setCalling(v)}
              />
            </View>
          </Card>
        ))}
      </QueryState>

      <ConfirmDialog
        visible={calling !== null}
        title={t('visits.callTitle', { name: calling?.patient.full_name ?? '' })}
        message={t('visits.callMessage')}
        confirmLabel={t('actions.save')}
        loading={contacted.isPending}
        onDismiss={() => setCalling(null)}
        onConfirm={() => void markCalled()}
      >
        <TextInput
          mode="outlined"
          label={t('visits.callNote')}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          style={styles.input}
          accessibilityLabel={t('visits.callNote')}
        />
      </ConfirmDialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: palette.inkMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  input: { backgroundColor: palette.white, marginTop: spacing.sm },
});
