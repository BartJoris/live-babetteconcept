import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      // iron-session requires SESSION_SECRET at module load (fail-closed in lib/session.ts)
      SESSION_SECRET:
        process.env.SESSION_SECRET ||
        'test_only_session_secret_at_least_32_chars_long',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
