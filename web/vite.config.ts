/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './test/setupTests.ts',
    // A fetch stubbed for one test must not answer the next one's requests.
    unstubGlobals: true,
  },
})
