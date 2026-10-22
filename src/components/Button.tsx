import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

import { palette, radius } from './theme';

type PaperButtonProps = ComponentProps<typeof PaperButton>;

export interface ButtonProps extends Omit<
  PaperButtonProps,
  'mode' | 'children' | 'buttonColor' | 'textColor'
> {
  label: string;
  /** primary = filled rose, secondary = outlined, text = link-style, danger = filled red. */
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  /** Stretch to the container width (default true for primary/secondary/danger). */
  fullWidth?: boolean;
}

const MODE: Record<NonNullable<ButtonProps['variant']>, PaperButtonProps['mode']> = {
  primary: 'contained',
  secondary: 'outlined',
  text: 'text',
  danger: 'contained',
};

/** The only button feature code should use. Pass `loading` while a mutation runs. */
export function Button({
  label,
  variant = 'primary',
  fullWidth = variant !== 'text',
  style,
  loading,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <PaperButton
      mode={MODE[variant]}
      buttonColor={variant === 'danger' ? palette.danger : undefined}
      textColor={variant === 'secondary' ? palette.maroon : undefined}
      loading={loading}
      disabled={disabled || loading}
      style={[
        styles.base,
        fullWidth && styles.full,
        variant === 'secondary' && styles.outlined,
        style,
      ]}
      contentStyle={variant === 'text' ? undefined : styles.content}
      labelStyle={styles.label}
      {...rest}
    >
      {label}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill },
  full: { alignSelf: 'stretch' },
  outlined: { borderColor: palette.rose },
  content: { minHeight: 48 },
  label: { fontSize: 16, fontWeight: '600' },
});
