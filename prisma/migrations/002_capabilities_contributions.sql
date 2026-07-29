-- 能力、贡献档案与成就版本化：纯增量迁移，不删除旧表或历史数据。

ALTER TABLE icebergs
  ADD COLUMN IF NOT EXISTS "contributionMode" TEXT NOT NULL DEFAULT 'DEFAULT';

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS "ruleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE user_achievements
  ADD COLUMN IF NOT EXISTS "ruleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS evidence JSONB;

CREATE TABLE IF NOT EXISTS user_capabilities (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  capability TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  source TEXT NOT NULL DEFAULT 'AUTO_CERTIFICATION',
  "grantedById" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "probationEndsAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspendedUntil" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  reason TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_capabilities_user_capability_key UNIQUE ("userId", capability)
);
CREATE INDEX IF NOT EXISTS user_capabilities_capability_status_idx ON user_capabilities(capability, status);
CREATE INDEX IF NOT EXISTS user_capabilities_user_status_idx ON user_capabilities("userId", status);

CREATE TABLE IF NOT EXISTS capability_applications (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  capability TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'APPLICATION',
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS capability_applications_status_created_idx ON capability_applications(status, "createdAt");
CREATE INDEX IF NOT EXISTS capability_applications_user_capability_idx ON capability_applications("userId", capability);

CREATE TABLE IF NOT EXISTS capability_decisions (
  id TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL REFERENCES capability_applications(id) ON DELETE CASCADE,
  "reviewerId" TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT capability_decisions_application_reviewer_key UNIQUE ("applicationId", "reviewerId")
);
CREATE INDEX IF NOT EXISTS capability_decisions_application_decision_idx ON capability_decisions("applicationId", decision);

CREATE TABLE IF NOT EXISTS capability_audit_logs (
  id TEXT PRIMARY KEY,
  "actorId" TEXT,
  "subjectUserId" TEXT,
  capability TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  reason TEXT,
  "breakGlass" BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS capability_audit_logs_subject_created_idx ON capability_audit_logs("subjectUserId", "createdAt");
CREATE INDEX IF NOT EXISTS capability_audit_logs_actor_created_idx ON capability_audit_logs("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS capability_audit_logs_capability_created_idx ON capability_audit_logs(capability, "createdAt");

CREATE TABLE IF NOT EXISTS reviewer_certifications (
  "userId" TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'INELIGIBLE',
  "certifiedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "decisionCount" INTEGER NOT NULL DEFAULT 0,
  "auditedCount" INTEGER NOT NULL DEFAULT 0,
  "auditErrorCount" INTEGER NOT NULL DEFAULT 0,
  metrics JSONB,
  "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS reviewer_certifications_status_updated_idx ON reviewer_certifications(status, "updatedAt");

CREATE TABLE IF NOT EXISTS review_audits (
  id TEXT PRIMARY KEY,
  "decisionKey" TEXT NOT NULL UNIQUE,
  "reviewId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "auditorId" TEXT,
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  "sampleRate" INTEGER NOT NULL,
  "isSelfReview" BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS review_audits_outcome_created_idx ON review_audits(outcome, "createdAt");
CREATE INDEX IF NOT EXISTS review_audits_review_created_idx ON review_audits("reviewId", "createdAt");
CREATE INDEX IF NOT EXISTS review_audits_reviewer_created_idx ON review_audits("reviewerId", "createdAt");

CREATE TABLE IF NOT EXISTS contribution_events (
  id TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  type TEXT NOT NULL,
  dimension TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "icebergId" TEXT,
  "projectId" TEXT,
  metadata JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS contribution_events_user_dimension_occurred_idx ON contribution_events("userId", dimension, "occurredAt");
CREATE INDEX IF NOT EXISTS contribution_events_type_occurred_idx ON contribution_events(type, "occurredAt");
CREATE INDEX IF NOT EXISTS contribution_events_iceberg_type_idx ON contribution_events("icebergId", type);

CREATE TABLE IF NOT EXISTS user_contribution_profiles (
  "userId" TEXT PRIMARY KEY,
  "creationCount" INTEGER NOT NULL DEFAULT 0,
  "collaborationCount" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "serviceCount" INTEGER NOT NULL DEFAULT 0,
  "publishedIcebergCount" INTEGER NOT NULL DEFAULT 0,
  "mergedPullRequestCount" INTEGER NOT NULL DEFAULT 0,
  "distinctCollabIcebergCount" INTEGER NOT NULL DEFAULT 0,
  "nonSelfReviewCount" INTEGER NOT NULL DEFAULT 0,
  "validReviewCount" INTEGER NOT NULL DEFAULT 0,
  "completedTaskCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_contribution_profiles_creation_idx ON user_contribution_profiles("creationCount");
CREATE INDEX IF NOT EXISTS user_contribution_profiles_collaboration_idx ON user_contribution_profiles("collaborationCount");
CREATE INDEX IF NOT EXISTS user_contribution_profiles_review_idx ON user_contribution_profiles("reviewCount");
CREATE INDEX IF NOT EXISTS user_contribution_profiles_service_idx ON user_contribution_profiles("serviceCount");

INSERT INTO system_settings(key, value, "updatedAt")
VALUES
  ('feature_capability_auth', 'false', CURRENT_TIMESTAMP),
  ('feature_contribution_profiles', 'true', CURRENT_TIMESTAMP),
  ('feature_legacy_governance_write', 'false', CURRENT_TIMESTAMP),
  ('external_pr_per_iceberg_limit', '3', CURRENT_TIMESTAMP),
  ('external_pr_global_limit', '10', CURRENT_TIMESTAMP),
  ('external_pr_daily_limit', '10', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
