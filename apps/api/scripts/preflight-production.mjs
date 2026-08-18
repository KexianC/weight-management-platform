import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseEnvFile(contents) {
  const parsed = {};
  for (const sourceLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const envFileArg = argumentValue('--env-file');
const env = { ...process.env };
let envFilePath;
const errors = [];

if (envFileArg) {
  envFilePath = resolve(envFileArg);
  try {
    Object.assign(env, parseEnvFile(readFileSync(envFilePath, 'utf8')));
    if (process.platform !== 'win32' && (statSync(envFilePath).mode & 0o077) !== 0) {
      errors.push('.env must not be readable or writable by group/other users (use chmod 600)');
    }
  } catch (error) {
    errors.push(`--env-file could not be read: ${error instanceof Error ? error.code || error.name : 'unknown error'}`);
  }
}

const placeholderPattern = /(?:change[_-]?me|replace-with|example\.com|example-secret|your[_-]|<[^>]+>)/i;
const value = (key) => String(env[key] ?? '').trim();
const present = (key) => value(key).length > 0;

function requireValue(key) {
  const current = value(key);
  if (!current) errors.push(`${key} is required`);
  else if (placeholderPattern.test(current)) errors.push(`${key} still contains a placeholder`);
  return current;
}

function requireSecret(key) {
  const current = requireValue(key);
  if (current && current.length < 32) errors.push(`${key} must contain at least 32 characters`);
  return current;
}

function requireHttpsUrl(key) {
  const current = requireValue(key);
  if (!current) return current;
  try {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:') errors.push(`${key} must use https`);
  } catch {
    errors.push(`${key} must be a valid absolute URL`);
  }
  return current;
}

if (value('NODE_ENV') !== 'production') errors.push('NODE_ENV must equal production');
if (value('ALLOW_DEMO_SEED').toLowerCase() === 'true') errors.push('ALLOW_DEMO_SEED must not be true in production');

const databaseUrl = requireValue('DATABASE_URL');
if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'mysql:') errors.push('DATABASE_URL must use the mysql protocol');
    if (!parsed.username || !parsed.password || parsed.pathname === '/') {
      errors.push('DATABASE_URL must include a database user, password, and schema name');
    }
    if (['localhost', '127.0.0.1', 'mysql'].includes(parsed.hostname.toLowerCase())) {
      errors.push('DATABASE_URL must use the production RDS private endpoint, not a local Docker host');
    }
  } catch {
    errors.push('DATABASE_URL must be a valid MySQL connection URL');
  }
}

const secretKeys = [
  'JWT_ACCESS_SECRET',
  'SMS_CODE_PEPPER',
  'MEDIA_SIGNING_SECRET',
  'REMINDER_CRON_SECRET',
];
const secrets = secretKeys.map((key) => requireSecret(key)).filter(Boolean);
if (new Set(secrets).size !== secrets.length) errors.push('JWT, SMS, media, and reminder secrets must all be different');

requireValue('JWT_ISSUER');
requireValue('JWT_AUDIENCE');
requireHttpsUrl('API_PUBLIC_URL');

const corsOrigins = requireValue('CORS_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (corsOrigins.includes('*')) errors.push('CORS_ORIGINS must not contain a wildcard');
for (const origin of corsOrigins) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') errors.push('every CORS_ORIGINS entry must use https');
    if (parsed.origin !== origin.replace(/\/$/, '')) errors.push('every CORS_ORIGINS entry must be an origin without a path');
  } catch {
    errors.push('every CORS_ORIGINS entry must be a valid absolute origin');
  }
}

const directSmsKeys = [
  'ALIBABA_CLOUD_ACCESS_KEY_ID',
  'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
  'ALIYUN_SMS_SIGN_NAME',
  'ALIYUN_SMS_TEMPLATE_CODE',
];
const directSmsConfigured = directSmsKeys.every(present);
const webhookConfigured = present('SMS_DELIVERY_WEBHOOK_URL') && present('SMS_DELIVERY_WEBHOOK_TOKEN');
if (!directSmsConfigured && !webhookConfigured) {
  errors.push('configure either all Aliyun SMS fields or both SMS delivery webhook fields');
}
if (directSmsKeys.some(present) && !directSmsConfigured) errors.push('Aliyun SMS configuration is incomplete');
if (present('SMS_DELIVERY_WEBHOOK_URL') || present('SMS_DELIVERY_WEBHOOK_TOKEN')) {
  if (!webhookConfigured) errors.push('SMS delivery webhook URL and token must be configured together');
  else {
    requireHttpsUrl('SMS_DELIVERY_WEBHOOK_URL');
    if (value('SMS_DELIVERY_WEBHOOK_TOKEN').length < 16) errors.push('SMS_DELIVERY_WEBHOOK_TOKEN must contain at least 16 characters');
  }
}
if (directSmsConfigured) directSmsKeys.forEach(requireValue);

const wechatMiniKeys = ['WECHAT_MINI_APP_ID', 'WECHAT_MINI_APP_SECRET'];
const wechatMiniConfigured = wechatMiniKeys.every(present);
if (wechatMiniKeys.some(present) && !wechatMiniConfigured) {
  errors.push('WeChat mini-program App ID and secret must be configured together');
}
if (wechatMiniConfigured) wechatMiniKeys.forEach(requireValue);
requireHttpsUrl('OSS_ENDPOINT');
['OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET'].forEach(requireValue);

const adminUsername = value('DEFAULT_ADMIN_USERNAME');
const adminPassword = value('DEFAULT_ADMIN_PASSWORD');
if (Boolean(adminUsername) !== Boolean(adminPassword)) {
  errors.push('DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD must be configured together');
}
if (adminPassword) {
  const normalized = adminPassword.toLowerCase();
  if (adminPassword.length < 16 || adminPassword.length > 72) {
    errors.push('DEFAULT_ADMIN_PASSWORD must contain between 16 and 72 characters');
  }
  if (['admin123', 'password', 'password123', '12345678', 'changeme'].includes(normalized)) {
    errors.push('DEFAULT_ADMIN_PASSWORD must not use a known default');
  }
}

for (const [key, current] of Object.entries(env)) {
  if (/^REDIS(?:_|$)/i.test(key) && String(current ?? '').trim()) {
    errors.push(`${key} must be removed because this deployment is MySQL-only`);
  }
}

const releaseTag = requireValue('RELEASE_TAG');
if (releaseTag && (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(releaseTag) || /^(?:latest|local|dev)$/i.test(releaseTag))) {
  errors.push('RELEASE_TAG must be an immutable version identifier, not latest/local/dev');
}

const publicApiBase = requireHttpsUrl('VITE_API_BASE_URL').replace(/\/$/, '');
const publicStorageBase = requireHttpsUrl('VITE_STORAGE_BASE_URL').replace(/\/$/, '');
if (publicApiBase && !publicApiBase.endsWith('/api/v1')) errors.push('VITE_API_BASE_URL must end with /api/v1');

if (envFilePath) {
  const repositoryRoot = dirname(envFilePath);
  const publicFiles = [
    ['apps/clinician-admin/.env.production', false],
    ['apps/patient-mobile/.env.production', false],
    ['apps/mini-program/.env.production', true],
  ];
  for (const [relativePath, needsStorage] of publicFiles) {
    try {
      const publicEnv = parseEnvFile(readFileSync(resolve(repositoryRoot, relativePath), 'utf8'));
      const appApiBase = String(publicEnv.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
      if (!appApiBase.startsWith('https://')) errors.push(`${relativePath} must use an https VITE_API_BASE_URL`);
      if (publicApiBase && appApiBase !== publicApiBase) errors.push(`${relativePath} VITE_API_BASE_URL does not match the release .env`);
      if (needsStorage) {
        const appStorageBase = String(publicEnv.VITE_STORAGE_BASE_URL ?? '').replace(/\/$/, '');
        if (!appStorageBase.startsWith('https://')) errors.push(`${relativePath} must use an https VITE_STORAGE_BASE_URL`);
        if (publicStorageBase && appStorageBase !== publicStorageBase) errors.push(`${relativePath} VITE_STORAGE_BASE_URL does not match the release .env`);
      }
    } catch {
      errors.push(`${relativePath} is missing or unreadable`);
    }
  }
}

if (errors.length) {
  console.error('PRODUCTION_PREFLIGHT_FAILED');
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

console.log('PRODUCTION_PREFLIGHT_OK');
