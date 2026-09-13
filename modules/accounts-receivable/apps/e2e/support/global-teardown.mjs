import { spawnSync } from 'node:child_process';

export default async function globalTeardown() {
  try {
    await fetch('http://127.0.0.1:3503/__control/shutdown', {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  } catch {
    // The fallback below handles an environment that exited before the control endpoint was available.
  }
  const listed = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      'label=io.gigalibs.test-suite=ar-e2e',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  );
  for (const name of listed.stdout?.split('\n').filter(Boolean) ?? []) {
    spawnSync('docker', ['stop', '--time', '3', name], { stdio: 'ignore' });
  }
}
