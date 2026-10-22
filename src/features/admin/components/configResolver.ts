import type { FieldErrors, Resolver } from 'react-hook-form';

import { buildPayload, type FieldDef, type FormValues, type Row } from '../config';

/** react-hook-form resolver that validates a configuration form with buildPayload(). */
export function configResolver(
  fields: readonly FieldDef[],
  validate?: (payload: Row) => Record<string, string>,
): Resolver<FormValues> {
  return (values) => {
    const result = buildPayload(fields, values, validate);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<FormValues> = {};
    for (const [key, message] of Object.entries(result.errors)) {
      errors[key] = { type: 'validate', message };
    }
    return { values: {}, errors };
  };
}
