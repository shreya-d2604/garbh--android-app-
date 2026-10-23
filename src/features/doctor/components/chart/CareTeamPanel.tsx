import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  InfoBanner,
  ListItem,
  StatusChip,
  palette,
  radius,
  spacing,
} from '@/components';

import {
  addableDoctors,
  handOverCandidates,
  teamPermissions,
  type CareTeamMember,
  type DoctorOption,
} from '../../care-team';
import { useAddBackup, useHandOver, useRemoveMember } from '../../hooks';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBanner } from '../ErrorBanner';

export interface CareTeamPanelProps {
  pregnancyId: string;
  members: CareTeamMember[];
  directory: DoctorOption[];
  me: string | null;
}

type DialogKind = 'add' | 'handover' | null;

/** Care team (PLAN.md §7.4 #3): the primary adds/removes backups or hands over; backups see it read-only. */
export function CareTeamPanel({ pregnancyId, members, directory, me }: CareTeamPanelProps) {
  const { t } = useTranslation('doctor');
  const perms = teamPermissions(members, me);
  const add = useAddBackup(pregnancyId);
  const remove = useRemoveMember(pregnancyId);
  const handOver = useHandOver(pregnancyId);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [toRemove, setToRemove] = useState<CareTeamMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();

  const close = () => {
    setDialog(null);
    setPicked(null);
    setNote('');
    add.reset();
    handOver.reset();
  };

  const options =
    dialog === 'add'
      ? addableDoctors(directory, members)
      : handOverCandidates(directory, members, me);

  return (
    <Card title={t('team.title')} subtitle={t('team.subtitle')}>
      {members.map((m) => (
        <ListItem
          key={m.id}
          icon={m.role === 'primary' ? 'doctor' : 'account-supervisor-outline'}
          title={m.name}
          description={m.note ?? undefined}
          right={
            perms.canManage && m.role === 'backup' ? (
              <Button
                label={t('team.remove')}
                variant="text"
                accessibilityLabel={t('team.removeFor', { name: m.name })}
                onPress={() => setToRemove(m)}
              />
            ) : (
              <StatusChip
                label={t(`team.role.${m.role}`)}
                tone={m.role === 'primary' ? 'primary' : 'neutral'}
              />
            )
          }
        />
      ))}

      {perms.canManage ? (
        <View style={styles.actions}>
          <Button label={t('team.add')} variant="secondary" onPress={() => setDialog('add')} />
          <Button label={t('team.handOver')} variant="text" onPress={() => setDialog('handover')} />
        </View>
      ) : perms.onTeam ? (
        <InfoBanner
          tone="info"
          icon="lock-outline"
          message={t('team.readOnly', { name: perms.primaryName ?? t('team.primaryDoctor') })}
        />
      ) : null}
      {perms.canLeave ? (
        <Button label={t('team.leave')} variant="text" onPress={() => setLeaving(true)} />
      ) : null}
      {remove.isError ? <ErrorBanner error={remove.error} /> : null}

      <Portal>
        <Dialog visible={dialog !== null} onDismiss={close}>
          <Dialog.Title>
            {dialog === 'add' ? t('team.addTitle') : t('team.handOverTitle')}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.scroll}>
            <ScrollView>
              {options.length === 0 ? (
                <Text variant="bodyMedium" style={styles.muted}>
                  {t('team.noOptions')}
                </Text>
              ) : (
                options.map((d) => (
                  <DoctorOptionRow
                    key={d.id}
                    doctor={d}
                    selected={picked === d.id}
                    onPress={() => setPicked(d.id)}
                  />
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Content style={styles.content}>
            {dialog === 'add' ? (
              <TextInput
                mode="outlined"
                label={t('team.note')}
                placeholder={t('team.notePlaceholder')}
                value={note}
                onChangeText={setNote}
                accessibilityLabel={t('team.note')}
              />
            ) : (
              <InfoBanner tone="warning" message={t('team.handOverWarning')} />
            )}
            <ErrorBanner error={add.error ?? handOver.error} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button label={t('common:actions.cancel')} variant="text" onPress={close} />
            <Button
              label={dialog === 'add' ? t('team.addConfirm') : t('team.handOverConfirm')}
              fullWidth={false}
              disabled={picked === null}
              loading={add.isPending || handOver.isPending}
              onPress={() => {
                if (!picked) return;
                if (dialog === 'add') add.mutate({ doctorId: picked, note }, { onSuccess: close });
                else handOver.mutate(picked, { onSuccess: close });
              }}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ConfirmDialog
        visible={toRemove !== null}
        title={t('team.removeTitle')}
        message={t('team.removeMessage', { name: toRemove?.name ?? '' })}
        confirmLabel={t('team.remove')}
        danger
        loading={remove.isPending}
        onDismiss={() => setToRemove(null)}
        onConfirm={() =>
          toRemove && remove.mutate(toRemove.doctorId, { onSettled: () => setToRemove(null) })
        }
      />

      <ConfirmDialog
        visible={leaving}
        title={t('team.leaveTitle')}
        message={t('team.leaveMessage')}
        confirmLabel={t('team.leave')}
        danger
        loading={remove.isPending}
        onDismiss={() => setLeaving(false)}
        onConfirm={() =>
          me &&
          remove.mutate(me, {
            onSettled: () => setLeaving(false),
            // The chart is no longer readable once she has left.
            onSuccess: () => router.replace('/doctor/patients' as never),
          })
        }
      />
    </Card>
  );
}

function DoctorOptionRow({
  doctor,
  selected,
  onPress,
}: {
  doctor: DoctorOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={doctor.name}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={22}
        color={selected ? palette.rose : palette.inkMuted}
      />
      <View style={styles.optionText}>
        <Text variant="bodyLarge">{doctor.name}</Text>
        {doctor.specialization ? (
          <Text variant="bodySmall" style={styles.muted}>
            {doctor.specialization}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  scroll: { maxHeight: 240 },
  content: { gap: spacing.sm, paddingTop: spacing.sm },
  muted: { color: palette.inkMuted },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  optionSelected: { backgroundColor: palette.roseMist },
  optionText: { flex: 1 },
});
