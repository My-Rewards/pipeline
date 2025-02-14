module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {'^.+\\.tsx?$': 'ts-jest'},
  globals: {
    'ts-jest': {
        isolatedModules: true
    }
  },
};
