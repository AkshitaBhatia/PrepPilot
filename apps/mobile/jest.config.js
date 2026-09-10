/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Reanimated 4 runs its animations through react-native-worklets, which ships
  // a resolver that swaps the native bindings for test-safe ones. Without it
  // every module importing Reanimated fails to load.
  resolver: 'react-native-worklets/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Metro turns .svg into a component; Jest needs telling separately.
    '\\.svg$': '<rootDir>/src/test-utils/svg-mock.tsx',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@preppilot/.*))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    // Route files are exercised by the app, not by unit tests; barrels and test
    // helpers contain no logic of their own.
    '!src/app/**',
    '!src/**/index.ts',
    '!src/test-utils/**',
    '!src/db/test-support/**',
    '!src/features/sync/test-support/**',
    // Browser-only platform override. It needs sql.js's WebAssembly and a DOM,
    // neither of which exists in the Node test environment. CI builds the web
    // bundle instead, so a break here still fails the pipeline.
    '!src/db/client.web.ts',
    // Declarations, not behaviour. The schema's index callbacks are invoked by
    // drizzle-kit when generating a migration, and that generated SQL is what
    // the repository tests actually run — so the schema is verified, just not
    // by executing this file.
    '!src/db/schema.ts',
    '!src/db/types.ts',
  ],
  coverageThreshold: {
    global: { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};
