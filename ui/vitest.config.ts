import { defineConfig } from 'vitest/config';
import path from 'path';

// The UI shows timestamps in the viewer's zone, and test fixtures name the
// day they expect in UTC. Pin the zone so results do not depend on the host.
// Test workers inherit it from this process.
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
