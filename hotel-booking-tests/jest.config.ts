import type { Config } from 'jest';

/**
 * Cấu hình Jest cho dự án Hotel Booking API.
 *
 * Có 2 project tách biệt:
 *  - "unit"  : test từng đơn vị (Service, Guard...) với mock hoàn toàn
 *  - "e2e"   : test end-to-end HTTP thật qua Supertest với DB giả lập
 *
 * Phân tách này cho phép chạy riêng lẻ:
 *   npx jest --project unit   → chỉ unit tests
 *   npx jest --project e2e    → chỉ e2e tests
 */
const config: Config = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
      moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
      },
      clearMocks: true,
      restoreMocks: true,
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
      moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
      },
      clearMocks: true,
      restoreMocks: true,
    },
  ],
  // Coverage thu thập từ toàn bộ file src/ (trừ main.ts và *.module.ts)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.interface.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
};

export default config;
