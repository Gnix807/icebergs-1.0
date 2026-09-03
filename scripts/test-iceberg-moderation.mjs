import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const outfile = new URL(`../.iceberg-moderation-test-${randomUUID()}.mjs`, import.meta.url);

try {
  await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/icebergModeration.ts', import.meta.url))],
    outfile: fileURLToPath(outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const {
    getIcebergModerationTransition,
    isAllowedRequestOrigin,
    parseIcebergModerationRequest,
  } = await import(`${outfile.href}?v=${Date.now()}`);

  assert.equal(isAllowedRequestOrigin(
    'http://icebergs.gnix807.cn/api/icebergs/test/moderation',
    'https://icebergs.gnix807.cn',
  ), true);
  assert.equal(isAllowedRequestOrigin(
    'http://app:4321/api/icebergs/test/moderation',
    'https://icebergs.gnix807.cn',
    'https://icebergs.gnix807.cn/api/auth/callback',
  ), true);
  assert.equal(isAllowedRequestOrigin(
    'http://icebergs.gnix807.cn/api/icebergs/test/moderation',
    'https://evil.example',
    'https://icebergs.gnix807.cn/api/auth/callback',
  ), false);
  assert.equal(isAllowedRequestOrigin(
    'http://icebergs.gnix807.cn/api/icebergs/test/moderation',
    'not-a-url',
  ), false);
  assert.equal(isAllowedRequestOrigin(
    'http://icebergs.gnix807.cn/api/icebergs/test/moderation',
    null,
  ), true);

  assert.deepEqual(
    parseIcebergModerationRequest({ action: 'ARCHIVE', reason: '存在明确违规内容' }),
    { ok: true, value: { action: 'ARCHIVE', reason: '存在明确违规内容' } },
  );
  assert.equal(parseIcebergModerationRequest({ action: 'ARCHIVE', reason: '短' }).ok, false);
  assert.equal(parseIcebergModerationRequest({ action: 'DELETE', reason: '永久删除内容' }).ok, false);

  assert.deepEqual(
    getIcebergModerationTransition('PUBLISHED', 'ARCHIVE', true),
    { kind: 'change', from: 'PUBLISHED', to: 'ARCHIVED' },
  );
  assert.deepEqual(
    getIcebergModerationTransition('ARCHIVED', 'ARCHIVE', true),
    { kind: 'noop', to: 'ARCHIVED' },
  );
  assert.equal(getIcebergModerationTransition('DRAFT', 'ARCHIVE', true).kind, 'invalid');

  assert.deepEqual(
    getIcebergModerationTransition('ARCHIVED', 'RESTORE', true),
    { kind: 'change', from: 'ARCHIVED', to: 'PUBLISHED' },
  );
  assert.deepEqual(
    getIcebergModerationTransition('PUBLISHED', 'RESTORE', true),
    { kind: 'noop', to: 'PUBLISHED' },
  );
  assert.equal(getIcebergModerationTransition('ARCHIVED', 'RESTORE', false).kind, 'invalid');

  console.log('iceberg moderation policy tests passed');
} finally {
  await unlink(outfile).catch(() => {});
}
