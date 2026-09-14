import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromiumLocal = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1366, height: 900 },
    locale: 'es-EC',
    launchOptions: existsSync(chromiumLocal) ? { executablePath: chromiumLocal } : {},
  },
});
