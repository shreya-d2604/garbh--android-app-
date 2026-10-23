import { zodResolver } from '@hookform/resolvers/zod';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  FormField,
  InfoBanner,
  ListItem,
  Screen,
  SectionHeader,
  StatusChip,
} from '@/components';
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog';
import { adminErrorKey } from '@/features/admin/errors';
import { formatDay } from '@/features/admin/format';
import { useCreateOwnRequest, useOwnRequests, useUpdateOwnProfile } from '@/features/admin/hooks';
import { hasOpenRequest, type RequestKind } from '@/features/admin/profile';
import { profileSchema, type ProfileForm } from '@/features/admin/schemas';
import { refreshProfile, signOut } from '@/features/auth/session-bootstrap';
import { useSession } from '@/lib/session';

/**
 * Profile for every role (PLAN.md §7.1): name and phone, sign out, and the two DPDP / Play Store
 * requests (export my data, delete my account). A deletion is only a request: the admin processes it,
 * because clinical records have legal retention requirements (PLAN.md §12).
 */
export default function Profile() {
  const { t } = useTranslation('admin');
  const profile = useSession((s) => s.profile);
  const userId = profile?.id;
  const requests = useOwnRequests(userId);
  const update = useUpdateOwnProfile();
  const createRequest = useCreateOwnRequest();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<RequestKind | null>(null);

  const { control, handleSubmit, formState } = useForm<ProfileForm, unknown, ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' },
  });

  const onSave = handleSubmit(async (values) => {
    if (!userId) return;
    setNotice(null);
    setError(null);
    try {
      await update.mutateAsync({
        userId,
        full_name: values.full_name.trim(),
        phone: values.phone?.trim() ? values.phone.trim() : null,
      });
      await refreshProfile();
      setNotice(t('profile.saved'));
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  const sendRequest = (kind: RequestKind) => {
    if (!userId) return;
    setNotice(null);
    setError(null);
    createRequest.mutate(
      { userId, kind },
      {
        onSuccess: () => {
          setConfirm(null);
          setNotice(t(kind === 'deletion' ? 'profile.deletionSent' : 'profile.exportSent'));
        },
        onError: (e) => {
          setConfirm(null);
          setError(adminErrorKey(e));
        },
      },
    );
  };

  const list = requests.data ?? [];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('profile.title') }} />
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      <Card
        title={profile?.full_name ?? ''}
        subtitle={profile?.role ? t(`roles.${profile.role}`) : undefined}
      >
        <ListItem
          icon="email-outline"
          title={t('profile.email')}
          description={profile?.email ?? ''}
        />
      </Card>

      <Card title={t('profile.details')}>
        <FormField
          control={control}
          name="full_name"
          label={t('profile.fullName')}
          autoComplete="name"
        />
        <FormField
          control={control}
          name="phone"
          label={t('profile.phone')}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Button
          label={t('actions.save', { ns: 'common' })}
          onPress={() => void onSave()}
          loading={formState.isSubmitting}
        />
      </Card>

      <SectionHeader title={t('profile.privacy')} />
      <Card>
        <InfoBanner message={t('profile.privacyHint')} />
        <Button
          label={t('profile.exportData')}
          variant="secondary"
          disabled={hasOpenRequest(list, 'export')}
          onPress={() => setConfirm('export')}
        />
        {hasOpenRequest(list, 'export') ? (
          <InfoBanner message={t('profile.exportPending')} />
        ) : null}
        <Button
          label={t('profile.deleteAccount')}
          variant="danger"
          disabled={hasOpenRequest(list, 'deletion')}
          onPress={() => setConfirm('deletion')}
        />
        {hasOpenRequest(list, 'deletion') ? (
          <InfoBanner message={t('profile.deletionPending')} />
        ) : null}
      </Card>

      {list.length > 0 ? (
        <>
          <SectionHeader title={t('profile.myRequests')} />
          <Card>
            {list.map((r) => (
              <ListItem
                key={r.id}
                icon={r.kind === 'deletion' ? 'account-remove-outline' : 'download-outline'}
                title={t(`profile.kind.${r.kind}`)}
                description={formatDay(r.created_at)}
                right={
                  <StatusChip
                    label={t(`requests.status.${r.status}`)}
                    tone={
                      r.status === 'done'
                        ? 'success'
                        : r.status === 'rejected'
                          ? 'neutral'
                          : 'warning'
                    }
                  />
                }
              />
            ))}
          </Card>
        </>
      ) : null}

      <Button
        label={t('actions.signOut', { ns: 'common' })}
        variant="secondary"
        onPress={() => void signOut()}
      />

      <ConfirmDialog
        visible={confirm === 'deletion'}
        title={t('profile.deleteTitle')}
        message={t('profile.deleteMessage')}
        confirmLabel={t('profile.deleteConfirm')}
        danger
        loading={createRequest.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={() => sendRequest('deletion')}
      />
      <ConfirmDialog
        visible={confirm === 'export'}
        title={t('profile.exportTitle')}
        message={t('profile.exportMessage')}
        confirmLabel={t('profile.exportConfirm')}
        loading={createRequest.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={() => sendRequest('export')}
      />
    </Screen>
  );
}
