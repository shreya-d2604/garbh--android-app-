import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette } from './theme';

/** Bell + profile icons for role tab headers: `headerRight: () => <HeaderActions />`. */
export function HeaderActions() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <IconButton
        icon="bell-outline"
        iconColor={palette.maroon}
        accessibilityLabel={t('shell.notifications')}
        onPress={() => router.push('/notifications')}
      />
      <IconButton
        icon="account-circle-outline"
        iconColor={palette.maroon}
        accessibilityLabel={t('shell.profile')}
        onPress={() => router.push('/profile')}
      />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row' } });
