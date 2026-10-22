import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, InfoBanner, palette, radius, spacing } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';

import { CodeRejectedError } from '../api';
import { formatCodeInput, isCompleteCode } from '../code';
import { useRedeemCode } from '../hooks';
import { RELATIONS, type Relation } from '../relations';

interface Props {
  /** Called with the new (pending) link id after the code was accepted. */
  onRedeemed?: (linkId: string) => void;
}

/** First-run form: invite code + "who are you to her?" -> pending request (PLAN.md §7.3). */
export function CodeEntryForm({ onRedeemed }: Props) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const redeem = useRedeemCode();
  const [code, setCode] = useState('');
  const [relation, setRelation] = useState<Relation | null>(null);
  const [touched, setTouched] = useState(false);

  const codeOk = isCompleteCode(code);
  const canSubmit = codeOk && relation != null;

  const errorMessage = redeem.error
    ? redeem.error instanceof CodeRejectedError
      ? t('join.codeRejected')
      : tc(rpcErrorKey(redeem.error))
    : null;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    redeem.mutate({ code, relation }, { onSuccess: (linkId) => onRedeemed?.(linkId) });
  };

  return (
    <View style={styles.form}>
      <View>
        <TextInput
          mode="outlined"
          label={t('join.codeLabel')}
          value={code}
          onChangeText={(v) => {
            setCode(formatCodeInput(v));
            redeem.reset();
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={8}
          placeholder="ABC-DEF"
          accessibilityLabel={t('join.codeLabel')}
          style={styles.code}
          contentStyle={styles.codeContent}
          outlineStyle={styles.outline}
          error={touched && !codeOk}
        />
        <HelperText type={touched && !codeOk ? 'error' : 'info'} visible>
          {touched && !codeOk ? t('join.codeInvalid') : t('join.codeHint')}
        </HelperText>
      </View>

      <View style={styles.relations}>
        <Text variant="titleSmall" style={styles.relationTitle}>
          {t('join.relationTitle')}
        </Text>
        <View style={styles.chips}>
          {RELATIONS.map((r) => (
            <Chip
              key={r}
              selected={relation === r}
              showSelectedOverlay
              onPress={() => setRelation(r)}
              accessibilityLabel={t(`relations.${r}`)}
              style={styles.chip}
            >
              {t(`relations.${r}`)}
            </Chip>
          ))}
        </View>
        {touched && relation == null ? (
          <HelperText type="error" visible>
            {t('join.relationRequired')}
          </HelperText>
        ) : null}
      </View>

      {errorMessage ? (
        <InfoBanner tone="danger" icon="alert-circle-outline" message={errorMessage} />
      ) : null}

      <Button
        label={t('join.submit')}
        loading={redeem.isPending}
        onPress={submit}
        accessibilityLabel={t('join.submit')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  code: { backgroundColor: palette.white },
  codeContent: { fontSize: 24, letterSpacing: 4, textAlign: 'center' },
  outline: { borderRadius: radius.sm },
  relations: { gap: spacing.sm },
  relationTitle: { color: palette.maroon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 40, justifyContent: 'center' },
});
