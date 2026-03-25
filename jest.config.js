/**
 * Jest 테스트 설정
 * React 컴포넌트 테스트, API 테스트, 성능 테스트
 */

module.exports = {
  // 테스트 환경
  testEnvironment: 'jsdom',
  
  // 테스트 파일 패턴
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    '<rootDir>/tests/**/*.{spec,test}.{js,jsx,ts,tsx}',
  ],
  
  // 테스트 제외할 경로
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/.next/',
    '/.vercel/',
  ],
  
  // 모듈 매핑
  moduleNameMapper: {
    // CSS 모듈 모킹
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    
    // 이미지 파일 모킹
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
    
    // 절대 경로 매핑
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
  },
  
  // 변환 설정
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
      plugins: [
        '@babel/plugin-transform-runtime',
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-proposal-private-methods',
        '@babel/plugin-proposal-private-property-in-object',
      ],
    }],
  },
  
  // 변환 제외할 경로
  transformIgnorePatterns: [
    '/node_modules/(?!(@capacitor|@supabase|react-markdown)/)',
  ],
  
  // 테스트 전 설정 파일
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  
  // 테스트 커버리지 설정
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/*.test.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/index.js',
    '!src/main.jsx',
    '!src/App.jsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // 테스트 속도 향상
  maxWorkers: '50%',
  testTimeout: 10000,
  
  // 스냅샷 테스트
  snapshotSerializers: [],
  
  // 테스트 결과 표시
  verbose: true,
  
  // 모듈 확장자
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  
  // 테스트 감시 모드 설정
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  
  // 글로벌 변수
  globals: {
    __DEV__: true,
    __TEST__: true,
    __PROD__: false,
  },
  
  // 테스트 리포트 설정
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml',
    }],
  ],
};