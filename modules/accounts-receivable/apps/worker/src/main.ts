import { loadWorkerConfig } from './config.js';
import { OutboxWorker } from './outbox-worker.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // Environment injection remains authoritative
}

const config = loadWorkerConfig();
const worker = new OutboxWorker(config);
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

await worker.verifyAccess();
console.info(
  JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'worker-ready' }),
);

try {
  while (!stopping) {
    try {
      const processed = await worker.processOne();
      if (!processed) await delay(config.pollIntervalMs);
    } catch {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'worker-cycle-failed',
        }),
      );
      if (!stopping) await delay(config.pollIntervalMs);
    }
  }
} finally {
  await worker.close();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
