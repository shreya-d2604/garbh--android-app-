import { Linking } from 'react-native';

import { Button } from '@/components';

/** Keeps digits and a leading "+", so the dialler gets a clean number. */
export function toTelUri(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

interface Props {
  phone: string | null | undefined;
  label: string;
  variant?: 'primary' | 'secondary';
}

/** Tap-to-call. Renders nothing when the hospital has no phone number set. */
export function CallButton({ phone, label, variant = 'secondary' }: Props) {
  if (!phone) return null;
  return (
    <Button
      label={label}
      variant={variant}
      icon="phone"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(toTelUri(phone))}
    />
  );
}
