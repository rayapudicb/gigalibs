import { defineConfig, devices } from '@playwright/test';
import { labOrigin } from './specs/speed/lab';

// WI-OI-120ce: SPEED's end-to-end suite. It runs only against the speed-lab copy (its own database, store and
// network), never against UAT: `lab.ts` refuses any other target. Results: an HTML report and a JSON summary.
export default defineConfig({
  testDir: './specs/speed',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: './specs/speed/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/speed-lab/results.json' }],
    ['html', { open: 'never', outputFolder: 'test-results/speed-lab/report' }],
  ],
  use: {
    baseURL: labOrigin(),
    storageState: 'test-results/speed-lab/session.json',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'on',
    trace: 'retain-on-failure',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  outputDir: 'test-results/speed-lab/artifacts',
});
