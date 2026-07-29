import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env-file');
const envFile = path.resolve(envIndex >= 0 ? args[envIndex + 1] || '' : '.env.production');

const requiredFiles = [
  'Dockerfile',
  'docker-compose.yml',
  'docker-entrypoint.sh',
  'prisma/schema.prisma',
  'prisma/migrations/001_fulltext_search.sql',
  'prisma/migrations/002_capabilities_contributions.sql',
  'scripts/backfill-version-control.mjs',
  'scripts/backfill-capabilities-contributions.mjs',
];

const errors = [];
const warnings = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.resolve(file))) errors.push(`缺少部署文件：${file}`);
}

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

let env = {};
if (!fs.existsSync(envFile)) {
  errors.push(`缺少生产环境文件：${envFile}`);
} else {
  env = parseEnv(fs.readFileSync(envFile, 'utf8'));
}

const placeholder = /(change-me|你的|example|replace-me|replace-with|localhost)/i;
for (const key of ['DB_PASSWORD', 'CRON_SECRET', 'EMAIL_VERIFICATION_SECRET']) {
  const value = env[key] || '';
  if (!value) errors.push(`${key} 未配置`);
  else if (placeholder.test(value)) errors.push(`${key} 仍是示例值`);
  else if (value.length < 12) errors.push(`${key} 长度不足 12 个字符`);
}

if (env.DB_PASSWORD && !/^[A-Za-z0-9._~-]+$/.test(env.DB_PASSWORD)) {
  errors.push('DB_PASSWORD 会直接用于 DATABASE_URL，只能包含字母、数字和 . _ ~ -');
}

const redirectUri = env.REDIRECT_URI || '';
if (!redirectUri) {
  errors.push('REDIRECT_URI 未配置');
} else {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'https:') errors.push('REDIRECT_URI 生产环境必须使用 HTTPS');
    if (!parsed.pathname.endsWith('/api/auth/callback')) {
      errors.push('REDIRECT_URI 必须以 /api/auth/callback 结尾');
    }
  } catch {
    errors.push('REDIRECT_URI 不是有效 URL');
  }
}

const provider = (env.EMAIL_PROVIDER || 'console').toLowerCase();
if (provider === 'console') {
  warnings.push('EMAIL_PROVIDER=console：生产用户无法收到真实验证码邮件');
} else if (provider === 'resend' && !env.RESEND_API_KEY) {
  errors.push('EMAIL_PROVIDER=resend 时必须配置 RESEND_API_KEY');
} else if (provider === 'webhook' && !env.EMAIL_WEBHOOK_URL) {
  errors.push('EMAIL_PROVIDER=webhook 时必须配置 EMAIL_WEBHOOK_URL');
}

if (!env.GITHUB_CLIENT_ID && !env.GOOGLE_CLIENT_ID) {
  warnings.push('GitHub 和 Google OAuth 均未配置；仅保留邮箱登录');
}

if (warnings.length > 0) {
  console.log('部署前置警告：');
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length > 0) {
  console.error('部署前置检查失败：');
  for (const item of errors) console.error(`  - ${item}`);
  process.exit(1);
}

console.log('部署前置检查通过：文件完整，关键生产变量已配置。');
