const common = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  restoreMocks: true,
};

module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/app.ts',
    '!src/config/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  verbose: true,
  testTimeout: 10000,
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
    },
    {
      // tests/setup.ts 는 모든 테이블을 TRUNCATE 하므로 DB 가 필요한 스위트에만 붙인다.
      ...common,
      displayName: 'db',
      testMatch: [
        '<rootDir>/tests/contract/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
  ],
};
