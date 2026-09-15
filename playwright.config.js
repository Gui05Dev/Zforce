import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 45_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // Usa o Chrome instalado na máquina (evita baixar navegadores do Playwright).
    channel: 'chrome',
  },
  projects: [
    // npm run test:e2e — headless, sem GPU (WebGL por software é recusado: testa os fallbacks).
    { name: 'chrome', testDir: 'tests/e2e' },
    // npm run test:gpu — janela visível com a GPU da máquina: fundo 3D e patinete.
    {
      name: 'gpu',
      testDir: 'tests/gpu',
      workers: 1,
      use: { headless: false, launchOptions: { args: ['--window-size=1500,1000'] } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
