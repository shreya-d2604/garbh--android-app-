import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ChoiceChips,
  DateField,
  EmptyState,
  ErrorState,
  LoadingState,
  palette,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { KeyValue } from '@/features/admin/components/KeyValue';
import { PickerSearch, type PickItem } from '@/features/admin/components/PickerSearch';
import {
  AUDIT_ACTIONS,
  AUDIT_TABLES,
  changedFields,
  explicitEvent,
  formatValue,
  hasFilters,
  type AuditFilters,
  type AuditRow,
} from '@/features/admin/audit';
import { formatWhen } from '@/features/admin/format';
import { useAuditLog, usePatientSearch, usePeopleSearch } from '@/features/admin/hooks';
import type { PersonName } from '@/features/admin/api';

const ACTION_TONE = {
  insert: 'success',
  update: 'info',
  delete: 'danger',
  view_sensitive: 'warning',
  export: 'primary',
} as const;

const usePeopleItems = (term: string) => {
  const q = usePeopleSearch(term);
  return {
    isFetching: q.isFetching,
    data: q.data?.map((p): PickItem => ({
      id: p.id,
      label: p.full_name ?? p.email ?? p.id,
      description: p.email ?? undefined,
    })),
  };
};
const usePatientItems = (term: string) => {
  const q = usePatientSearch(term);
  return {
    isFetching: q.isFetching,
    data: q.data?.map((p): PickItem => ({
      id: p.id,
      label: p.full_name,
      description: p.mrn ?? undefined,
    })),
  };
};

/** Audit log viewer (PLAN.md §7.6 #6): filter by user, patient, table, action and date. */
export default function Audit() {
  const { t } = useTranslation('admin');
  const [actor, setActor] = useState<PickItem | null>(null);
  const [patient, setPatient] = useState<PickItem | null>(null);
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState(false);
  const { control, reset } = useForm<{ from: string; to: string }>({
    defaultValues: { from: '', to: '' },
  });
  const range = useWatch({ control });

  const filters = useMemo<AuditFilters>(
    () => ({
      actorId: actor?.id,
      patientId: patient?.id,
      table: table || undefined,
      action: action || undefined,
      from: range.from || undefined,
      to: range.to || undefined,
    }),
    [actor, patient, table, action, range.from, range.to],
  );
  const query = useAuditLog(filters);
  const rows =
    query.data?.pages.flatMap((p) => p.rows.map((r) => ({ row: r, people: p.people }))) ?? [];

  const clear = () => {
    setActor(null);
    setPatient(null);
    setTable('');
    setAction('');
    reset({ from: '', to: '' });
  };

  const header = (
    <View style={styles.header}>
      <Button
        label={open ? t('audit.hideFilters') : t('audit.showFilters')}
        variant="secondary"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <Card>
          <PickerSearch
            placeholder={t('audit.byUser')}
            selected={actor}
            onSelect={setActor}
            useResults={usePeopleItems}
          />
          <PickerSearch
            placeholder={t('audit.byPatient')}
            selected={patient}
            onSelect={setPatient}
            useResults={usePatientItems}
          />
          <ChoiceChips
            allowClear={false}
            value={action}
            onChange={(v) => setAction(action === v ? '' : v)}
            accessibilityLabel={t('audit.byAction')}
            options={AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`audit.actions.${a}`) }))}
          />
          <ChoiceChips
            allowClear={false}
            value={table}
            onChange={(v) => setTable(table === v ? '' : v)}
            accessibilityLabel={t('audit.byTable')}
            options={AUDIT_TABLES.map((x) => ({ value: x, label: x.replace(/_/g, ' ') }))}
          />
          <DateField
            control={control}
            name="from"
            label={t('audit.from')}
            maximumDate={todayISO()}
          />
          <DateField control={control} name="to" label={t('audit.to')} maximumDate={todayISO()} />
          {hasFilters(filters) ? (
            <Button label={t('audit.clear')} variant="text" onPress={clear} />
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t('audit.title') }} />
      {query.isLoading ? (
        <>
          {header}
          <LoadingState />
        </>
      ) : query.isError ? (
        <>
          {header}
          <ErrorState onRetry={() => void query.refetch()} />
        </>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.row.id)}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState title={t('audit.empty')} message={t('audit.emptyHint')} icon="history" />
          }
          contentContainerStyle={styles.items}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={
            query.hasNextPage ? (
              <Button
                label={t('audit.more')}
                variant="secondary"
                loading={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
              />
            ) : undefined
          }
          renderItem={({ item }) => <AuditCard row={item.row} people={item.people} />}
        />
      )}
    </Screen>
  );
}

function AuditCard({ row, people }: { row: AuditRow; people: Record<string, PersonName> }) {
  const { t } = useTranslation('admin');
  const [open, setOpen] = useState(false);
  const actor = row.actor_id
    ? (people[row.actor_id]?.full_name ?? t('audit.unknownUser'))
    : t('audit.system');
  const event = explicitEvent(row);
  const changes = changedFields(row);
  const tone = ACTION_TONE[row.action as keyof typeof ACTION_TONE] ?? 'neutral';
  return (
    <Card
      title={`${actor} · ${row.table_name.replace(/_/g, ' ')}`}
      subtitle={formatWhen(row.at)}
      right={
        <StatusChip
          label={t(`audit.actions.${row.action}`, { defaultValue: row.action })}
          tone={tone}
        />
      }
      onPress={() => setOpen(!open)}
      accessibilityLabel={`${actor}, ${row.action}, ${row.table_name}`}
    >
      {event ? (
        <KeyValue
          label={t('audit.event')}
          value={t(`audit.events.${event.event}`, { defaultValue: event.event })}
        />
      ) : null}
      {event?.reason ? <KeyValue label={t('audit.reason')} value={event.reason} /> : null}
      {open ? (
        <>
          <KeyValue label={t('audit.record')} value={row.record_id} />
          {changes.length === 0 && !event ? (
            <KeyValue label={t('audit.changes')} value={t('audit.noChanges')} />
          ) : null}
          {changes.slice(0, 25).map((c) => (
            <KeyValue
              key={c.key}
              label={c.key}
              value={
                row.action === 'update'
                  ? `${formatValue(c.before, 40)} → ${formatValue(c.after, 40)}`
                  : formatValue(c.after ?? c.before)
              }
            />
          ))}
        </>
      ) : (
        <KeyValue
          label={t('audit.tapForDetails')}
          value={changes.length ? t('audit.changeCount', { count: changes.length }) : null}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.cream },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  items: { gap: spacing.sm, paddingBottom: spacing.lg },
});
