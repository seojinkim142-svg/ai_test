/**
 * Jest 테스트 설정 파일
 * 테스트 환경 설정, 모킹, 유틸리티 함수
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// 글로벌 TextEncoder/TextDecoder 설정 (Node.js 환경)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// fetch 모킹
global.fetch = jest.fn();

// localStorage 모킹
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.localStorage = localStorageMock;

// sessionStorage 모킹
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// IndexedDB 모킹
global.indexedDB = {
  open: jest.fn(),
};

// matchMedia 모킹 (CSS 미디어 쿼리)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ResizeObserver 모킹
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// IntersectionObserver 모킹
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  takeRecords: jest.fn(),
}));

// MutationObserver 모킹
global.MutationObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  takeRecords: jest.fn(),
}));

// visualViewport 모킹
Object.defineProperty(window, 'visualViewport', {
  writable: true,
  value: {
    width: 1024,
    height: 768,
    scale: 1,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
});

// navigator 모킹
Object.defineProperty(window, 'navigator', {
  writable: true,
  value: {
    userAgent: 'jest-test',
    language: 'ko-KR',
    languages: ['ko-KR', 'en-US'],
    platform: 'Win32',
    maxTouchPoints: 0,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    connection: {
      effectiveType: '4g',
      saveData: false,
      downlink: 10,
      rtt: 50,
    },
    clipboard: {
      writeText: jest.fn(),
      readText: jest.fn(),
    },
    geolocation: {
      getCurrentPosition: jest.fn(),
      watchPosition: jest.fn(),
      clearWatch: jest.fn(),
    },
    mediaDevices: {
      getUserMedia: jest.fn(),
      enumerateDevices: jest.fn(),
    },
  },
});

// performance 모킹
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: jest.fn(() => Date.now()),
    timing: {
      navigationStart: Date.now() - 1000,
    },
    memory: {
      usedJSHeapSize: 1000000,
      totalJSHeapSize: 2000000,
      jsHeapSizeLimit: 4000000,
    },
    mark: jest.fn(),
    measure: jest.fn(),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
    getEntriesByName: jest.fn(),
    getEntriesByType: jest.fn(),
  },
});

// requestAnimationFrame 모킹
global.requestAnimationFrame = jest.fn(callback => {
  setTimeout(() => callback(Date.now()), 0);
  return 1;
});

global.cancelAnimationFrame = jest.fn();

// setTimeout/clearTimeout 모킹 (테스트 속도 향상)
global.setTimeout = jest.fn((callback, delay) => {
  if (typeof callback === 'function') {
    callback();
  }
  return 1;
});

global.clearTimeout = jest.fn();

// setInterval/clearInterval 모킹
global.setInterval = jest.fn((callback, delay) => {
  if (typeof callback === 'function') {
    callback();
  }
  return 1;
});

global.clearInterval = jest.fn();

// URL 모킹
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

// Blob 모킹
global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
    this.size = parts.reduce((size, part) => size + part.length, 0);
    this.type = options?.type || '';
  }
  
  slice() {
    return new Blob(this.parts, this.options);
  }
  
  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(this.size));
  }
  
  text() {
    return Promise.resolve(this.parts.join(''));
  }
  
  stream() {
    return new ReadableStream();
  }
};

// File 모킹
global.File = class File extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
    this.lastModified = Date.now();
  }
};

// FormData 모킹
global.FormData = class FormData {
  constructor() {
    this.data = new Map();
  }
  
  append(key, value) {
    this.data.set(key, value);
  }
  
  get(key) {
    return this.data.get(key);
  }
  
  getAll(key) {
    return Array.from(this.data.entries())
      .filter(([k]) => k === key)
      .map(([, v]) => v);
  }
  
  has(key) {
    return this.data.has(key);
  }
  
  delete(key) {
    this.data.delete(key);
  }
  
  set(key, value) {
    this.data.set(key, value);
  }
  
  entries() {
    return this.data.entries();
  }
  
  keys() {
    return this.data.keys();
  }
  
  values() {
    return this.data.values();
  }
  
  forEach(callback) {
    this.data.forEach(callback);
  }
};

// Crypto 모킹
Object.defineProperty(global, 'crypto', {
  writable: true,
  value: {
    getRandomValues: jest.fn(arr => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    randomUUID: jest.fn(() => 'test-uuid-1234-5678-9012-345678901234'),
    subtle: {
      digest: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      deriveKey: jest.fn(),
      deriveBits: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      wrapKey: jest.fn(),
      unwrapKey: jest.fn(),
    },
  },
});

// Service Worker 모킹
Object.defineProperty(navigator, 'serviceWorker', {
  writable: true,
  value: {
    register: jest.fn(() => Promise.resolve({
      active: { state: 'activated' },
      installing: null,
      waiting: null,
      update: jest.fn(),
      unregister: jest.fn(),
    })),
    ready: Promise.resolve({
      active: { state: 'activated' },
    }),
    controller: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
});

// WebSocket 모킹
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  readyState: WebSocket.CONNECTING,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}));

// BroadcastChannel 모킹
global.BroadcastChannel = jest.fn().mockImplementation(() => ({
  postMessage: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

// 테스트 유틸리티 함수
global.testUtils = {
  // 컴포넌트 렌더링 헬퍼
  renderWithProviders: (component, options = {}) => {
    const { store, router, theme } = options;
    
    // 필요한 Provider로 감싸서 반환
    return component;
  },
  
  // 비동기 테스트 헬퍼
  waitFor: (callback, options = {}) => {
    const { timeout = 1000, interval = 50 } = options;
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        try {
          const result = callback();
          if (result) {
            resolve(result);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('waitFor timeout'));
          } else {
            setTimeout(check, interval);
          }
        } catch (error) {
          if (Date.now() - startTime > timeout) {
            reject(error);
          } else {
            setTimeout(check, interval);
          }
        }
      };
      
      check();
    });
  },
  
  // 모킹 데이터 생성
  createMockData: (type, overrides = {}) => {
    const baseData = {
      user: {
        id: 'test-user-123',
        email: 'test@example.com',
        name: '테스트 사용자',
        tier: 'free',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      pdf: {
        id: 'test-pdf-123',
        name: '테스트 PDF.pdf',
        size: 1024 * 1024, // 1MB
        pages: 10,
        uploadedAt: new Date().toISOString(),
        processed: true,
      },
      aiResponse: {
        id: 'test-response-123',
        question: '테스트 질문',
        answer: '테스트 답변입니다.',
        model: 'gpt-4',
        tokens: 100,
        createdAt: new Date().toISOString(),
      },
      payment: {
        id: 'test-payment-123',
        amount: 9900,
        currency: 'KRW',
        status: 'completed',
        method: 'kakaopay',
        createdAt: new Date().toISOString(),
      },
    };
    
    return { ...baseData[type], ...overrides };
  },
  
  // 에러 객체 생성
  createError: (message, code = 'TEST_ERROR') => {
    const error = new Error(message);
    error.code = code;
    error.status = 500;
    return error;
  },
  
  // 파일 객체 생성
  createFile: (name, size, type = 'application/pdf') => {
    const file = new File([''], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  },
  
  // Blob URL 생성
  createBlobURL: (content, type = 'text/plain') => {
    const blob = new Blob([content], { type });
    return URL.createObjectURL(blob);
  },
  
  // 환경 변수 설정
  setEnv: (key, value) => {
    process.env[key] = value;
  },
  
  // 환경 변수 초기화
  resetEnv: () => {
    // 테스트 관련 환경 변수만 유지
    const testEnv = {
      NODE_ENV: 'test',
      JEST_WORKER_ID: process.env.JEST_WORKER_ID,
    };
    
    Object.keys(process.env).forEach(key => {
      if (!(key in testEnv)) {
        delete process.env[key];
      }
    });
    
    Object.assign(process.env, testEnv);
  },
};

// 테스트 전 설정
beforeEach(() => {
  // fetch 모킹 초기화
  fetch.mockClear();
  
  // localStorage 모킹 초기화
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  // sessionStorage 모킹 초기화
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
  
  // console 메서드 모킹
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  
  // 환경 변수 초기화
  global.testUtils.resetEnv();
});

// 테스트 후 정리
afterEach(() => {
  // console 모킹 복원
  jest.restoreAllMocks();
  
  // 타이머 정리
  jest.clearAllTimers();
  
  // fetch 모킹 정리
  fetch.mockClear();
  
  // URL 객체 정리
  URL.createObjectURL.mockClear();
  URL.revokeObjectURL.mockClear();
});

// 모든 테스트 후 정리
afterAll(() => {
  // 글로벌 모킹 제거
  delete global.fetch;
  delete global.localStorage;
  delete global.sessionStorage;
  delete global.indexedDB;
  delete global.TextEncoder;
  delete global.TextDecoder;
  delete global.testUtils;
});