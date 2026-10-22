import { z } from 'zod';

// Error messages are i18n keys in the 'common' namespace (FormField translates them).
export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'validation.email' })),
});
export type EmailForm = z.input<typeof emailSchema>;

export const otpSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: 'validation.otp' }),
});
export type OtpForm = z.input<typeof otpSchema>;
