import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // JUnit XML so the suite drops straight into any CI that reads it.
    reporters: process.env.CI_JUNIT ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'reports/unit-junit.xml' },
    coverage: { provider: 'v8', reportsDirectory: 'reports/coverage', include: ['src/lib/**'] },
  },
})
