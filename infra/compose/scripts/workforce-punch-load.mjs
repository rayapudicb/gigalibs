// WI-OI-069 punch ingestion baseline, executed inside the Workforce API container by
// verify-workforce-punch-load.sh: linked workers send distinct punches with a fixed number in flight, resend a
// share of them, and retry 429s with the same event id. Prints the measured result as JSON.
import { randomUUID } from 'node:crypto';

const env = process.env;
const base = 'http://127.0.0.1:4700/v1';
const tokens = JSON.parse(env.TOKENS);
const workers = tokens.workers;
const TOTAL = Number(env.TOTAL);
const IN_FLIGHT = Number(env.IN_FLIGHT);
const RESEND_EVERY = 10;

async function post(token, body) {
  const started = performance.now();
  const response = await fetch(`${base}/punches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Correlation-Id': `wi-oi-069-load-${env.RUN}` },
    body: JSON.stringify(body),
  });
  await response.arrayBuffer();
  return { status: response.status, ms: performance.now() - started };
}

for (const [index, subject] of workers.subjects.entries()) {
  const response = await fetch(`${base}/resources`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceCode: `LOAD-${index}-${env.RUN}`, displayName: `Load ${index}`, resourceType: 'HUMAN', platformUserId: subject }),
  });
  if (response.status !== 201) throw new Error(`worker ${index}: ${response.status}`);
}

const plan = Array.from({ length: TOTAL }, (_, index) => {
  const worker = index % workers.tokens.length;
  return {
    token: workers.tokens[worker],
    body: {
      deviceId: `load-device-${worker}`,
      deviceEventId: randomUUID(),
      kind: Math.floor(index / workers.tokens.length) % 2 === 0 ? 'CLOCK_IN' : 'CLOCK_OUT',
      occurredAt: new Date(Date.now() - 60_000 + (index % 50_000)).toISOString(),
      timeZone: 'UTC',
    },
  };
});
const queue = [];
plan.forEach((item, index) => {
  queue.push(item);
  if (index % RESEND_EVERY === RESEND_EVERY - 1) queue.push(plan[index - RESEND_EVERY + 1]);
});

const statuses = new Map();
const latencies = [];
let refused = 0;
let cursor = 0;
const retry = [];
const started = performance.now();
async function lane() {
  for (;;) {
    const item = retry.shift() ?? (cursor < queue.length ? queue[cursor++] : undefined);
    if (!item) return;
    const result = await post(item.token, item.body);
    if (result.status === 429) {
      refused += 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retry.push(item);
      continue;
    }
    statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
    latencies.push(result.ms);
  }
}
await Promise.all(Array.from({ length: IN_FLIGHT }, lane));
const elapsedMs = performance.now() - started;
latencies.sort((left, right) => left - right);
const created = statuses.get(201) ?? 0;
const replayed = statuses.get(200) ?? 0;
const unexpected = [...statuses.entries()].filter(([status]) => status !== 200 && status !== 201);
if (unexpected.length) throw new Error(`unexpected statuses ${JSON.stringify(unexpected)}`);
process.stdout.write(JSON.stringify({
  punches: created,
  resends: replayed,
  refused,
  inFlight: IN_FLIGHT,
  elapsedMs: Math.round(elapsedMs),
  punchesPerMinute: Math.round((created / elapsedMs) * 60_000),
  requestsPerMinute: Math.round(((created + replayed) / elapsedMs) * 60_000),
  p50Ms: Math.round(latencies[Math.floor(latencies.length * 0.5)]),
  p95Ms: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
}));
