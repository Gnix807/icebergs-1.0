export const ICEBERG_MODERATION_REASON_MIN = 5;
export const ICEBERG_MODERATION_REASON_MAX = 500;

export type IcebergModerationAction = 'ARCHIVE' | 'RESTORE';

export type IcebergModerationRequestResult =
  | { ok: true; value: { action: IcebergModerationAction; reason: string } }
  | { ok: false; message: string };

export type IcebergModerationTransition =
  | { kind: 'change'; from: 'PUBLISHED' | 'ARCHIVED'; to: 'PUBLISHED' | 'ARCHIVED' }
  | { kind: 'noop'; to: 'PUBLISHED' | 'ARCHIVED' }
  | { kind: 'invalid'; message: string };

export function isAllowedRequestOrigin(
  requestUrl: string | URL,
  origin: string | null,
  configuredPublicUrl?: string | null,
): boolean {
  if (!origin) return true;

  try {
    const request = new URL(requestUrl);
    const source = new URL(origin);
    if (source.origin === request.origin || source.host === request.host) return true;

    if (configuredPublicUrl) {
      const configured = new URL(configuredPublicUrl);
      if (source.origin === configured.origin) return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function parseIcebergModerationRequest(raw: unknown): IcebergModerationRequestResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '请求格式错误' };
  }

  const input = raw as Record<string, unknown>;
  const action = input.action;
  if (action !== 'ARCHIVE' && action !== 'RESTORE') {
    return { ok: false, message: '不支持的管理操作' };
  }

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < ICEBERG_MODERATION_REASON_MIN) {
    return { ok: false, message: `处理理由至少需要 ${ICEBERG_MODERATION_REASON_MIN} 个字` };
  }
  if (reason.length > ICEBERG_MODERATION_REASON_MAX) {
    return { ok: false, message: `处理理由不能超过 ${ICEBERG_MODERATION_REASON_MAX} 个字` };
  }

  return { ok: true, value: { action, reason } };
}

export function getIcebergModerationTransition(
  currentStatus: string,
  action: IcebergModerationAction,
  hasPublication: boolean,
): IcebergModerationTransition {
  if (action === 'ARCHIVE') {
    if (currentStatus === 'ARCHIVED') return { kind: 'noop', to: 'ARCHIVED' };
    if (currentStatus !== 'PUBLISHED') {
      return { kind: 'invalid', message: '只有已发布的冰山图可以执行下架' };
    }
    return { kind: 'change', from: 'PUBLISHED', to: 'ARCHIVED' };
  }

  if (currentStatus === 'PUBLISHED') return { kind: 'noop', to: 'PUBLISHED' };
  if (currentStatus !== 'ARCHIVED') {
    return { kind: 'invalid', message: '只有已归档的冰山图可以恢复公开' };
  }
  if (!hasPublication) {
    return { kind: 'invalid', message: '缺少已审核的发布快照，不能直接恢复公开' };
  }
  return { kind: 'change', from: 'ARCHIVED', to: 'PUBLISHED' };
}
