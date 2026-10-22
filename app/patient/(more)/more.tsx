import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, ListItem, Screen } from '@/components';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { toTelUri } from '@/features/patient/components/CallButton';

// More tab (PLAN.md §7.2 #4, #6-8): the rest of the patient area.
export default function MoreScreen() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  return (
    <Screen edges={[]}>
      <PatientGate>
        {({ patient, settings }) => (
          <>
            <Card>
              <ListItem
                icon="doctor"
                title={t('more.doctors')}
                description={t('more.doctorsHint')}
                onPress={() => router.push('/patient/doctors')}
              />
              <ListItem
                icon="food-apple-outline"
                title={t('more.careGuide')}
                description={t('more.careGuideHint')}
                onPress={() => router.push('/patient/care-guide')}
              />
              <ListItem
                icon="pill"
                title={t('more.prescriptions')}
                description={t('more.prescriptionsHint')}
                onPress={() => router.push('/patient/prescriptions')}
              />
              {/* Companions need a verified account (PLAN.md §7.2 #8). */}
              <ListItem
                icon="account-heart-outline"
                title={t('more.companions')}
                description={t(
                  patient.is_verified ? 'more.companionsHint' : 'more.companionsLocked',
                )}
                onPress={patient.is_verified ? () => router.push('/patient/companions') : undefined}
              />
              <ListItem
                icon="account-circle-outline"
                title={t('more.profile')}
                description={t('more.profileHint')}
                onPress={() => router.push('/profile')}
              />
            </Card>
            {settings.phone ? (
              <Card>
                <ListItem
                  icon="phone"
                  title={t('common.callReception')}
                  description={settings.name}
                  onPress={() => void Linking.openURL(toTelUri(settings.phone ?? ''))}
                />
              </Card>
            ) : null}
          </>
        )}
      </PatientGate>
    </Screen>
  );
}
