import { useTranslation } from 'react-i18next';

import { InfoBanner } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';

/** Form-level banner for a failed RPC / mutation (maps the error code to a friendly message). */
export function ErrorBanner({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <InfoBanner
      tone="danger"
      icon="alert-circle-outline"
      message={t(rpcErrorKey(error as { message?: string; code?: string }))}
    />
  );
}
