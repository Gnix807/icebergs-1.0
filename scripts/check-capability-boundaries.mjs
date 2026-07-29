import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const apiRoot = join(process.cwd(), 'src', 'pages', 'api');
const legacyPrefixes = [
  'promotion/',
  'rfa/',
  'elections/',
  'impeach/',
  'admin/cron/advance-elections.ts',
  'admin/cron/advance-impeach.ts',
  'admin/cron/advance-rfa.ts',
  'admin/cron/weekly-activity-bonus.ts',
  'users/[id]/role.ts',
  'users/[id]/score-log.ts',
];

async function collectTypescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypescriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  }));
  return nested.flat();
}

function normalizedRelativePath(file) {
  return relative(apiRoot, file).split(sep).join('/');
}

function isLegacyArchive(path) {
  return legacyPrefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

const forbidden = [
  {
    label: '直接读取会话旧角色',
    pattern: /\bsession\??\.role\b/,
  },
  {
    label: '用质量分参与授权判断',
    pattern: /\b(?:if|while)\s*\([^)]*\bqualityScore\b|(?:&&|\|\|)\s*[^;\n]*\bqualityScore\b/,
  },
  {
    label: '用成就参与授权判断',
    pattern: /\b(?:if|while)\s*\([^)]*\b(?:achievement|achievements)\b|(?:&&|\|\|)\s*[^;\n]*\b(?:achievement|achievements)\b/i,
  },
];

const violations = [];
for (const file of await collectTypescriptFiles(apiRoot)) {
  const path = normalizedRelativePath(file);
  if (isLegacyArchive(path)) continue;
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const rule of forbidden) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        violations.push(`${path}:${index + 1} ${rule.label}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error('能力边界静态检查失败：');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('能力边界静态检查通过：新 API 未使用旧角色、质量分或成就进行授权。');
}
