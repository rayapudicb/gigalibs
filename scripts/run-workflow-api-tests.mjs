import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const workflowApi = join(root, 'apps/workflow-api');
const localVirtualEnvironmentPython = join(workflowApi, '.venv/bin/python');
const python =
  process.env.EXECUTION_PYTHON_BIN ??
  (existsSync(localVirtualEnvironmentPython) ? localVirtualEnvironmentPython : 'python3');

const commands = [
  ['-m', 'compileall', '-q', 'config.py', 'main.py', 'middleware', 'services', 'tests'],
  ['-m', 'unittest', 'discover', '-s', 'tests', '-v'],
];

for (const args of commands) {
  const result = spawnSync(python, args, {
    cwd: workflowApi,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to execute workflow API verification: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
