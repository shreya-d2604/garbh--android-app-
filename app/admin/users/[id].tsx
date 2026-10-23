import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ChoiceChips,
  ConfirmDialog,
  InfoBanner,
  QueryBoundary,
  Screen,
  StatusChip,
} from '@/components';
import { KeyValue } from '@/features/admin/components/KeyValue';
import { StaffFields } from '@/features/admin/components/StaffFields';
import { firstParam } from '@/features/admin/components/ui';
import type { StaffMember } from '@/features/admin/api';
import { adminErrorKey } from '@/features/admin/errors';
import {
  useResendInvite,
  useSetStaffActive,
  useSetStaffRole,
  useStaffMember,
  useUpdateStaff,
} from '@/features/admin/hooks';
import {
  staffCreateSchema,
  staffEditSchema,
  toStaffPayload,
  type StaffCreateForm,
} from '@/features/admin/schemas';
import type { StaffRole } from '@/features/admin/users';
import { useSession } from '@/lib/session';

/** One staff account: edit details, change role, deactivate / reactivate, resend the invite. */
export default function StaffDetail() {
  const { t } = useTranslation('admin');
  const params = useLocalSearchParams<{ id: string; invited?: string }>();
  const id = firstParam(params.id);
  const invited = firstParam(params.invited);
  const query = useStaffMember(id);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: query.data?.full_name ?? t('users.detail') }} />
      <QueryBoundary
        query={query}
        isEmpty={(m) => m === null}
        empty={{ title: t('users.notFound'), icon: 'account-question-outline' }}
      >
        {(member) => (member ? <Body member={member} invited={invited} /> : null)}
      </QueryBoundary>
    </Screen>
  );
}

function Body({ member, invited }: { member: StaffMember; invited: string }) {
  const { t } = useTranslation('admin');
  const me = useSession((s) => s.session?.user.id);
  const isMe = me === member.id;
  const update = useUpdateStaff();
  const setRole = useSetStaffRole();
  const setActive = useSetStaffActive();
  const resend = useResendInvite();

  const [notice, setNotice] = useState<string | null>(
    invited === 'sent' ? t('users.inviteSent') : null,
  );
  const [error, setError] = useState<string | null>(
    invited === 'failed' ? 'admin:users.inviteFailed' : null,
  );
  const [role, setRoleValue] = useState<StaffRole>(member.role);
  const [dialog, setDialog] = useState<'role' | 'active' | null>(null);

  const { control, handleSubmit, formState } = useForm<StaffCreateForm, unknown, StaffCreateForm>({
    resolver: zodResolver(staffEditSchema as unknown as typeof staffCreateSchema),
    defaultValues: {
      email: member.email ?? '',
      role: member.role,
      full_name: member.full_name ?? '',
      phone: member.phone ?? '',
      designation: member.designation ?? '',
      specialization: member.specialization ?? '',
      registration_no: member.registration_no ?? '',
      bio: member.bio ?? '',
    },
  });

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      setDialog(null);
    } catch (e) {
      setError(adminErrorKey(e as Error));
      setDialog(null);
    }
  };

  const onSave = handleSubmit((values) =>
    run(
      () => update.mutateAsync({ id: member.id, fields: toStaffPayload(values) }),
      t('users.saved'),
    ),
  );

  return (
    <>
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      <Card
        title={member.full_name ?? '-'}
        subtitle={member.email ?? undefined}
        right={
          <StatusChip
            label={member.is_active ? t('users.active') : t('users.inactive')}
            tone={member.is_active ? 'success' : 'neutral'}
          />
        }
      >
        <KeyValue label={t('staff.role')} value={t(`roles.${member.role}`)} />
        {isMe ? <InfoBanner message={t('users.thisIsYou')} /> : null}
      </Card>

      <Card title={t('users.details')}>
        <StaffFields control={control} doctor={member.role === 'doctor'} />
        <Button
          label={t('actions.save', { ns: 'common' })}
          onPress={() => void onSave()}
          loading={formState.isSubmitting}
        />
      </Card>

      <Card
        title={t('users.changeRole')}
        subtitle={isMe ? t('users.cannotChangeSelf') : t('users.changeRoleHint')}
      >
        <ChoiceChips
          allowClear={false}
          value={role}
          onChange={(v) => v !== '' && setRoleValue(v)}
          options={[
            { value: 'doctor', label: t('roles.doctor') },
            { value: 'receptionist', label: t('roles.receptionist') },
            { value: 'admin', label: t('roles.admin') },
          ]}
        />
        <Button
          label={t('users.changeRole')}
          variant="secondary"
          disabled={isMe || role === member.role}
          onPress={() => setDialog('role')}
        />
      </Card>

      <Card title={t('users.access')}>
        <Button
          label={t('users.resend')}
          variant="secondary"
          loading={resend.isPending}
          onPress={() =>
            void run(async () => {
              const r = await resend.mutateAsync(member.id);
              if (!r.invite_sent) throw new Error('INVITE_FAILED');
            }, t('users.inviteSent'))
          }
        />
        {member.is_active ? (
          <Button
            label={t('users.deactivate')}
            variant="danger"
            disabled={isMe}
            onPress={() => setDialog('active')}
          />
        ) : (
          <Button
            label={t('users.reactivate')}
            onPress={() =>
              void run(
                () => setActive.mutateAsync({ id: member.id, active: true }),
                t('users.reactivated'),
              )
            }
            loading={setActive.isPending}
          />
        )}
      </Card>

      <ConfirmDialog
        visible={dialog === 'role'}
        title={t('users.confirmRoleTitle')}
        message={t('users.confirmRole', { role: t(`roles.${role}`) })}
        confirmLabel={t('users.changeRole')}
        loading={setRole.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={() =>
          void run(() => setRole.mutateAsync({ id: member.id, role }), t('users.roleChanged'))
        }
      />
      <ConfirmDialog
        visible={dialog === 'active'}
        title={t('users.confirmDeactivateTitle')}
        message={t('users.confirmDeactivate')}
        confirmLabel={t('users.deactivate')}
        danger
        loading={setActive.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () => setActive.mutateAsync({ id: member.id, active: false }),
            t('users.deactivated'),
          )
        }
      />
    </>
  );
}
