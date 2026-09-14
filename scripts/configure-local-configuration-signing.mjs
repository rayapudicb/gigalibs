import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
let source = '';
try { source = await readFile(envPath, 'utf8'); } catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const existingKeyId = readValue(source, 'CONFIGURATION_PACKAGE_SIGNING_KEY_ID');
const existingPrivateKey = readValue(source, 'CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64');
if (existingKeyId && existingPrivateKey && !existingKeyId.includes('REPLACE_') && !existingPrivateKey.includes('REPLACE_')) {
  console.log(`Configuration package signing is already configured with key ${existingKeyId}.`);
  process.exit(0);
}
const { privateKey } = generateKeyPairSync('ed25519');
const keyId = `local-configuration-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
source = upsert(source, 'CONFIGURATION_PACKAGE_SIGNING_KEY_ID', keyId);
source = upsert(source, 'CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
const temporaryPath = `${envPath}.configuration-signing.tmp`;
await writeFile(temporaryPath, source.endsWith('\n') ? source : `${source}\n`, { mode: 0o600 });
await chmod(temporaryPath, 0o600);
await rename(temporaryPath, envPath);
console.log(`Configured local Configuration Studio package signing with key ${keyId}.`);

function readValue(text, name) {
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
}

function upsert(text, name, value) {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith('\n') || text.length === 0 ? '' : '\n'}${line}\n`;
}
