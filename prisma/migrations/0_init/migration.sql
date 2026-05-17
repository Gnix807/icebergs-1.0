-- Baseline migration generated from existing SQLite schema (with manual supplements).
-- Review before first production apply.

CREATE TABLE "achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "triggerType" TEXT NOT NULL,
    "triggerTarget" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "banner" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "appeals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "auth_rate_limit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "rate_key" TEXT NOT NULL,
    "created_at" TEXT NOT NULL
);

CREATE TABLE "comment_likes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icebergId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "election_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "election_candidates_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "election_candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "election_votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "election_votes_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "election_votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "elections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initiatedBy" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '站长选举',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN_APPLY',
    "applyDeadline" DATETIME NOT NULL,
    "voteDeadline" DATETIME NOT NULL,
    "confirmedAt" DATETIME,
    "winnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contact" TEXT,
    "icebergId" TEXT,
    "itemName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedNote" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "iceberg_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icebergId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "iceberg_reviews_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "iceberg_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "icebergs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic" TEXT NOT NULL DEFAULT 'general',
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "icebergs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "impeach_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUserId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closesAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impeach_requests_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "impeach_requests_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "impeach_votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impeach_votes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "impeach_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "impeach_votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "item_reads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "icebergId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tierId" TEXT NOT NULL,
    "labels" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "items_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "tiers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "count" INTEGER NOT NULL DEFAULT 1,
    "aggregateKey" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "oauth_identities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "oauth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "promotion_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "statement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "promotion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "filerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "handlerId" TEXT,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "reports_filerId_fkey" FOREIGN KEY ("filerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reports_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "rfa_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "statement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "rfa_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "rfa_votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rfa_votes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "rfa_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rfa_votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "score_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "score_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

CREATE TABLE "tiers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "icebergId" TEXT NOT NULL,
    CONSTRAINT "tiers_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "user_awards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiverId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_awards_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_awards_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "user_stats" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "totalRead" INTEGER NOT NULL DEFAULT 0,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "randomCount" INTEGER NOT NULL DEFAULT 0,
    "nightReadCount" INTEGER NOT NULL DEFAULT 0,
    "visitedIcebergCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveDays" INTEGER NOT NULL DEFAULT 0,
    "lastVisitDate" TEXT,
    "totalVotesCast" INTEGER NOT NULL DEFAULT 0,
    "totalSessionMinutes" INTEGER NOT NULL DEFAULT 0,
    "pendingAchievements" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "user_warnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" DATETIME,
    "clearedByAppeal" BOOLEAN NOT NULL DEFAULT false,
    "autoClears" DATETIME NOT NULL,
    CONSTRAINT "user_warnings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "banUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bio" TEXT,
    "avatar" TEXT,
    "isFounder" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "lastWeeklyBonusAt" DATETIME,
    "privacyShowStats" BOOLEAN NOT NULL DEFAULT true,
    "privacyShowWatchlist" BOOLEAN NOT NULL DEFAULT false,
    "userboxIds" TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE "view_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icebergId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "view_logs_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "icebergId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "votes_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "icebergId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "watchlist_icebergId_fkey" FOREIGN KEY ("icebergId") REFERENCES "icebergs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "achievements_key_key" ON "achievements"("key");

CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

CREATE INDEX "appeals_status_idx" ON "appeals"("status");

CREATE INDEX "appeals_userId_idx" ON "appeals"("userId");

CREATE UNIQUE INDEX "comment_likes_commentId_userId_key" ON "comment_likes"("commentId", "userId");

CREATE INDEX "comments_icebergId_createdAt_idx" ON "comments"("icebergId", "createdAt");

CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

CREATE INDEX "election_candidates_electionId_idx" ON "election_candidates"("electionId");

CREATE UNIQUE INDEX "election_candidates_electionId_userId_key" ON "election_candidates"("electionId", "userId");

CREATE INDEX "election_votes_electionId_candidateId_idx" ON "election_votes"("electionId", "candidateId");

CREATE UNIQUE INDEX "election_votes_electionId_voterId_key" ON "election_votes"("electionId", "voterId");

CREATE INDEX "elections_status_idx" ON "elections"("status");

CREATE INDEX "feedbacks_createdAt_idx" ON "feedbacks"("createdAt");

CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

CREATE UNIQUE INDEX "iceberg_reviews_icebergId_key" ON "iceberg_reviews"("icebergId");

CREATE INDEX "iceberg_reviews_status_createdAt_idx" ON "iceberg_reviews"("status", "createdAt");

CREATE INDEX "icebergs_authorId_idx" ON "icebergs"("authorId");

CREATE UNIQUE INDEX "icebergs_slug_key" ON "icebergs"("slug");

CREATE INDEX "icebergs_status_topic_createdAt_idx" ON "icebergs"("status", "topic", "createdAt");

CREATE INDEX "idx_auth_rate_limit_action_key_created" ON "auth_rate_limit_events"("action", "rate_key", "created_at");

CREATE INDEX "idx_auth_rate_limit_created" ON "auth_rate_limit_events"("created_at");

CREATE UNIQUE INDEX "idx_oauth_identity_unique" ON "oauth_identities"("provider", "provider_user_id");

CREATE INDEX "idx_oauth_identity_user" ON "oauth_identities"("user_id");

CREATE UNIQUE INDEX "idx_oauth_identity_user_provider" ON "oauth_identities"("user_id", "provider");

CREATE INDEX "impeach_requests_status_closesAt_idx" ON "impeach_requests"("status", "closesAt");

CREATE INDEX "impeach_requests_targetUserId_idx" ON "impeach_requests"("targetUserId");

CREATE INDEX "impeach_votes_requestId_idx" ON "impeach_votes"("requestId");

CREATE UNIQUE INDEX "impeach_votes_requestId_voterId_key" ON "impeach_votes"("requestId", "voterId");

CREATE INDEX "item_reads_userId_icebergId_idx" ON "item_reads"("userId", "icebergId");

CREATE UNIQUE INDEX "item_reads_userId_itemId_key" ON "item_reads"("userId", "itemId");

CREATE INDEX "items_tierId_order_idx" ON "items"("tierId", "order");

CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

CREATE INDEX "notifications_userId_type_aggregateKey_read_idx" ON "notifications"("userId", "type", "aggregateKey", "read");

CREATE INDEX "promotion_requests_status_idx" ON "promotion_requests"("status");

CREATE INDEX "promotion_requests_userId_idx" ON "promotion_requests"("userId");

CREATE INDEX "reports_status_idx" ON "reports"("status");

CREATE INDEX "reports_type_targetId_idx" ON "reports"("type", "targetId");

CREATE INDEX "rfa_requests_status_closesAt_idx" ON "rfa_requests"("status", "closesAt");

CREATE INDEX "rfa_requests_userId_idx" ON "rfa_requests"("userId");

CREATE INDEX "rfa_votes_requestId_idx" ON "rfa_votes"("requestId");

CREATE UNIQUE INDEX "rfa_votes_requestId_voterId_key" ON "rfa_votes"("requestId", "voterId");

CREATE INDEX "score_logs_userId_createdAt_idx" ON "score_logs"("userId", "createdAt");

CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

CREATE INDEX "tiers_icebergId_order_idx" ON "tiers"("icebergId", "order");

CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON "user_achievements"("userId", "achievementId");

CREATE INDEX "user_achievements_userId_idx" ON "user_achievements"("userId");

CREATE INDEX "user_awards_receiverId_idx" ON "user_awards"("receiverId");

CREATE INDEX "user_warnings_userId_idx" ON "user_warnings"("userId");

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE INDEX "view_logs_createdAt_idx" ON "view_logs"("createdAt");

CREATE INDEX "view_logs_icebergId_createdAt_idx" ON "view_logs"("icebergId", "createdAt");

CREATE UNIQUE INDEX "votes_userId_icebergId_key" ON "votes"("userId", "icebergId");

CREATE UNIQUE INDEX "watchlist_userId_icebergId_key" ON "watchlist"("userId", "icebergId");

-- Added manually to match current Prisma schema: OAuthChallenge
CREATE TABLE IF NOT EXISTS "oauth_challenges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "state_hash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "code_verifier" TEXT,
  "link_user_id" TEXT,
  "expires_at" DATETIME NOT NULL,
  "consumed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_challenges_state_hash_key" ON "oauth_challenges"("state_hash");
CREATE INDEX IF NOT EXISTS "idx_oauth_challenges_expires" ON "oauth_challenges"("expires_at");
CREATE INDEX IF NOT EXISTS "idx_oauth_challenges_consumed" ON "oauth_challenges"("consumed_at");
