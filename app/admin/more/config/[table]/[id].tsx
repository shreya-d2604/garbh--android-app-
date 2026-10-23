import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, InfoBanner, QueryBoundary, Screen } from '@/components';
import { ConfigFields } from '@/features/admin/components/ConfigFields';
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog';
import { configResolver } from '@/features/admin/components/configResolver';
import { firstParam } from '@/features/admin/components/ui';
import {
  CONFIG_TABLES,
  buildTablePayload,
  isConfigKey,
  valuesFromRow,
  type ConfigTable,
  type FormValues,
  type Row,
} from '@/features/admin/config';
import { adminErrorKey } from '@/features/admin/errors';
import { useConfigRow, useDeleteConfigRow, useSaveConfigRow } from '@/features/admin/hooks';

/** Create (id = "new") or edit one catalog row. */
export default function ConfigEdit() {
  const { t } = useTranslation('admin');
  const params = useLocalSearchParams<{ table: string; id: string }>();
  const table = firstParam(params.table);
  const id = decodeURIComponent(firstParam(params.id));
  if (!isConfigKey(table)) {
    return (
      <Screen edges={[]}>
        <EmptyState title={t('config.unknown')} icon="help-circle-outline" />
      </Screen>
    );
  }
  return <Editor def={CONFIG_TABLES[table]} id={id === 'new' ? null : id} />;
}

function Editor({ def, id }: { def: ConfigTable; id: string | null }) {
  const { t } = useTranslation('admin');
  const query = useConfigRow(def, id);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t(id ? 'config.edit' : 'config.new') }} />
      {id ? (
        <QueryBoundary
          query={query}
          isEmpty={(r) => r === null}
          empty={{ title: t('config.notFound'), icon: 'help-circle-outline' }}
        >
          {(row) => (row ? <Form def={def} id={id} row={row} /> : null)}
        </QueryBoundary>
      ) : (
        <Form def={def} id={null} row={null} />
      )}
    </Screen>
  );
}

function Form({ def, id, row }: { def: ConfigTable; id: string | null; row: Row | null }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const editing = id !== null;
  const save = useSaveConfigRow(def);
  const remove = useDeleteConfigRow(def);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fields = editing ? def.fields.filter((f) => !f.createOnly || f.key === def.pk) : def.fields;
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: configResolver(
      editing ? def.fields.filter((f) => !f.createOnly) : def.fields,
      def.validate,
    ),
    defaultValues: valuesFromRow(def.fields, row),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const built = buildTablePayload(def, values, editing);
    if (!built.ok) return;
    try {
      await save.mutateAsync({ id, payload: built.payload });
      router.back();
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  const onDelete = () => {
    if (!id) return;
    setError(null);
    remove.mutate(id, {
      onSuccess: () => router.back(),
      onError: (e) => {
        setError(adminErrorKey(e));
        setConfirmDelete(false);
      },
    });
  };

  return (
    <>
      <InfoBanner message={t(`config.tables.${def.key}.hint`)} />
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <ConfigFields group={def.key} fields={fields} control={control} editing={editing} />
      <Button
        label={t('actions.save', { ns: 'common' })}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
      {editing ? (
        <Button label={t('config.delete')} variant="text" onPress={() => setConfirmDelete(true)} />
      ) : null}
      <ConfirmDialog
        visible={confirmDelete}
        title={t('config.deleteTitle')}
        message={t('config.deleteMessage')}
        confirmLabel={t('config.delete')}
        danger
        loading={remove.isPending}
        onDismiss={() => setConfirmDelete(false)}
        onConfirm={onDelete}
      />
    </>
  );
}
