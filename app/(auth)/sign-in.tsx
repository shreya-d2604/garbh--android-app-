import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, FormField, InfoBanner, Screen } from '@/components';
import { emailSchema, type EmailForm } from '@/domain/schemas/auth';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const deactivated = useSession((s) => s.deactivatedNotice);
  const [failed, setFailed] = useState(false);
  const { control, handleSubmit, formState } = useForm<EmailForm, unknown, { email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailed(false);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setFailed(true);
      return;
    }
    useSession.setState({ deactivatedNotice: false });
    router.push({ pathname: '/verify-otp', params: { email } });
  });

  return (
    <Screen title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      {deactivated ? <InfoBanner tone="danger" message={t('auth.deactivated')} /> : null}
      {failed ? <InfoBanner tone="danger" message={t('errors.GENERIC')} /> : null}
      <FormField
        control={control}
        name="email"
        label={t('auth.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Button
        label={t('auth.sendCode')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Screen>
  );
}
