import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, FormField, InfoBanner, Screen } from '@/components';
import { otpSchema, type OtpForm } from '@/domain/schemas/auth';
import { supabase } from '@/lib/supabase';

export default function VerifyOtp() {
  const { t } = useTranslation();
  const router = useRouter();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const { control, handleSubmit, formState } = useForm<OtpForm, unknown, { token: string }>({
    resolver: zodResolver(otpSchema),
    defaultValues: { token: '' },
  });

  // On success the auth listener updates the session store and the role router redirects.
  const onVerify = handleSubmit(async ({ token }) => {
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) setMessage({ tone: 'danger', text: t('validation.otp') });
  });

  const onResend = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMessage(
      error
        ? { tone: 'danger', text: t('errors.GENERIC') }
        : { tone: 'success', text: t('auth.codeResent') },
    );
  };

  return (
    <Screen title={t('auth.verifyTitle')} subtitle={t('auth.verifySubtitle', { email })}>
      {message ? <InfoBanner tone={message.tone} message={message.text} /> : null}
      <FormField
        control={control}
        name="token"
        label={t('auth.code')}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Button
        label={t('auth.verify')}
        onPress={() => void onVerify()}
        loading={formState.isSubmitting}
      />
      <Button label={t('auth.resend')} variant="text" onPress={onResend} />
      <Button
        label={t('auth.changeEmail')}
        variant="text"
        onPress={() => router.replace('/sign-in')}
      />
    </Screen>
  );
}
