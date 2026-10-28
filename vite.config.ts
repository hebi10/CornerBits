import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: { rolldownOptions: { input: { legacy: 'index.html', coast: 'coast.html' } } },
  test: { include: ['src/**/*.test.ts'] },
});
