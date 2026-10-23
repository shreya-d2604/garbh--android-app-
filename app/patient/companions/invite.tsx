import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  InfoBanner,
  palette,
  radius,
  Screen,
  spacing,
} from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { countdownParts, formatCode } from '@/features/companion/code';
import { QueryBoundary } from '@/features/companion/components/QueryBoundary';
import {
  useActiveInvite,
  useCreateInvite,
  useMyPatient,
  usePatientLinks,
} from '@/features/companion/hooks';
import { useInviteDraft } from '@/features/companion/invite-store';
import { useNow } from '@/features/companion/use-now';

export default function InviteCompanion() {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const router = useRouter();
  const me = useMyPatient();
  const patientId = me.data?.verified ? me.data.id : undefined;
  const invite = useActiveInvite(patientId);
  const links = usePatientLinks(patientId);
  const create = useCreateInvite();
  const code = useInviteDraft((s) => s.code);
  const setCode = useInviteDraft((s) => s.setCode);
  const now = useNow();
  const [copied, setCopied] = useState(false);

  const active = invite.data ?? null;
  // The plaintext code is only meaningful while its invite is still active (not used/expired/replaced).
  useEffect(() => {
    if (invite.isSuccess && !active && code) setCode(null);
  }, [invite.isSuccess, active, code, setCode]);

  const shownCode = active ? code : null;
  const left = active ? countdownParts(active.expires_at, now) : null;
  const pendingCount = (links.data ?? []).filter((l) => l.status === 'pending').length;
  const justUsed = !active && !!code && pendingCount > 0;

  const generate = () => {
    setCopied(false);
    create.mutate(undefined, { onSuccess: (c) => setCode(c) });
  };
  const timeLeft = left
    ? left.hours > 0
      ? t('invite.hoursMinutes', { hours: left.hours, minutes: left.minutes })
      : t('invite.minutes', { minutes: left.minutes })
    : null;

  const refetch = () => {
    void me.refetch();
    void invite.refetch();
  };

  return (
    <Screen
      edges={['bottom']}
      title={t('invite.title')}
      subtitle={t('invite.intro')}
      refreshing={invite.isRefetching}
      onRefresh={refetch}
    >
      <QueryBoundary
        isPending={me.isPending || (patientId != null && invite.isPending)}
        isError={me.isError || invite.isError}
        onRetry={refetch}
      >
        {!patientId ? (
          <Card variant="soft">
            <EmptyState
              icon="shield-lock-outline"
              title={t('my.unverifiedTitle')}
              message={t('my.unverifiedMessage')}
            />
          </Card>
        ) : (
          <>
            {pendingCount > 0 ? (
              <InfoBanner tone="success" icon="account-clock-outline" message={t('invite.used')} />
            ) : null}

            {shownCode ? (
              <Card variant="soft" title={t('invite.yourCode')}>
                <View style={styles.codeBox} accessibilityLabel={formatCode(shownCode)}>
                  <Text variant="displaySmall" style={styles.code} selectable>
                    {formatCode(shownCode)}
                  </Text>
                </View>
                {timeLeft ? (
                  <Text variant="bodyMedium" style={styles.center}>
                    {t('invite.expiresIn', { time: timeLeft })}
                  </Text>
                ) : (
                  <Text variant="bodyMedium" style={styles.center}>
                    {t('invite.expired')}
                  </Text>
                )}
                <Button
                  label={t('invite.share')}
                  onPress={() =>
                    void Share.share({
                      message: t('invite.shareMessage', { code: formatCode(shownCode) }),
                    })
                  }
                  accessibilityLabel={t('invite.share')}
                />
                <Button
                  label={copied ? t('invite.copied') : t('invite.copy')}
                  variant="secondary"
                  onPress={() => {
                    void Clipboard.setStringAsync(formatCode(shownCode)).then(() =>
                      setCopied(true),
                    );
                  }}
                  accessibilityLabel={t('invite.copy')}
                />
                <Text variant="bodySmall" style={styles.muted}>
                  {t('invite.onceNote')}
                </Text>
              </Card>
            ) : active ? (
              <InfoBanner message={t('invite.lostCode')} />
            ) : null}

            {create.error ? (
              <InfoBanner tone="danger" message={tc(rpcErrorKey(create.error))} />
            ) : null}

            {justUsed ? (
              <Button
                label={t('invite.review')}
                onPress={() => router.replace('/patient/companions')}
                accessibilityLabel={t('invite.review')}
              />
            ) : (
              <>
                <Button
                  label={shownCode || active ? t('invite.newCode') : t('invite.create')}
                  variant={shownCode ? 'text' : 'primary'}
                  loading={create.isPending}
                  onPress={generate}
                  accessibilityLabel={
                    shownCode || active ? t('invite.newCode') : t('invite.create')
                  }
                />
                {shownCode || active ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    {t('invite.newCodeHint')}
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeBox: {
    backgroundColor: palette.white,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  code: { color: palette.maroon, fontWeight: '700', letterSpacing: 6 },
  center: { textAlign: 'center', color: palette.ink },
  muted: { color: palette.inkMuted, textAlign: 'center' },
});
