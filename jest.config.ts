import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  modulePaths: [
    "<rootDir>"
  ],
  coverageDirectory: 'coverage',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {'^.+\\.tsx?$': 'ts-jest'},
  collectCoverageFrom: [
    '<rootDir>/lambda/**/*.ts',
    '!<rootDir>/lambda/**/*.d.ts',
    '!<rootDir>/lambda/**/*.test.ts',
  ],
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./lambda/**/*.ts": {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }

  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  }

};

export default config;