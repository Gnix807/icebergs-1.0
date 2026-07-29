// 统一 API 响应格式

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function success<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function error(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}

// 常见错误码
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  BRANCH_BEHIND: 'BRANCH_BEHIND',
  WORKSPACE_CONFLICT: 'WORKSPACE_CONFLICT',
  MERGE_CONFLICT: 'MERGE_CONFLICT',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  VERSION_CONTROL_ENABLED: 'VERSION_CONTROL_ENABLED',
  CAPABILITY_REQUIRED: 'CAPABILITY_REQUIRED',
  CAPABILITY_SUSPENDED: 'CAPABILITY_SUSPENDED',
  CERTIFICATION_PROBATION: 'CERTIFICATION_PROBATION',
  DAILY_REVIEW_LIMIT: 'DAILY_REVIEW_LIMIT',
  SECOND_APPROVAL_REQUIRED: 'SECOND_APPROVAL_REQUIRED',
  BREAK_GLASS_REASON_REQUIRED: 'BREAK_GLASS_REASON_REQUIRED',
  LEGACY_GOVERNANCE_RETIRED: 'LEGACY_GOVERNANCE_RETIRED',
} as const;
