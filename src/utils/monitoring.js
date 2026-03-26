/**
 * 애플리케이션 모니터링 시스템
 * 성능 모니터링, 에러 추적, 사용자 행동 분석
 */

// 모니터링 설정
const MONITORING_CONFIG = {
  // 성능 모니터링
  PERFORMANCE: {
    ENABLED: true,
    SAMPLE_RATE: 0.1, // 10% 샘플링
    METRICS: ['LCP', 'FID', 'CLS', 'FCP', 'TTFB'],
    THRESHOLDS: {
      LCP: 2500, // 2.5초
      FID: 100, // 100ms
      CLS: 0.1, // 0.1
      FCP: 1800, // 1.8초
      TTFB: 800, // 800ms
    },
  },
  
  // 에러 모니터링
  ERROR: {
    ENABLED: true,
    CAPTURE_UNHANDLED: true,
    CAPTURE_CONSOLE: true,
    CAPTURE_NETWORK: true,
    IGNORE_PATTERNS: [
      /Script error\.?/,
      /ResizeObserver loop limit exceeded/,
      /Loading chunk.*failed/,
    ],
  },
  
  // 사용자 행동 분석
  ANALYTICS: {
    ENABLED: true,
    AUTO_TRACK: true,
    EVENTS: ['click', 'submit', 'navigation', 'error', 'performance'],
    PRIVACY_MODE: true, // 개인정보 보호 모드
  },
  
  // 로깅
  LOGGING: {
    ENABLED: true,
    LEVEL: 'info', // debug, info, warn, error
    CONSOLE: true,
    REMOTE: false,
    BUFFER_SIZE: 100,
    FLUSH_INTERVAL: 10000, // 10초
  },
};

// 성능 메트릭 타입
export const PerformanceMetric = {
  LCP: 'LCP', // Largest Contentful Paint
  FID: 'FID', // First Input Delay
  CLS: 'CLS', // Cumulative Layout Shift
  FCP: 'FCP', // First Contentful Paint
  TTFB: 'TTFB', // Time to First Byte
  CUSTOM: 'CUSTOM',
};

// 에러 심각도
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// 모니터링 이벤트
export const MonitoringEvent = {
  PERFORMANCE: 'performance',
  ERROR: 'error',
  USER_ACTION: 'user_action',
  NAVIGATION: 'navigation',
  API_CALL: 'api_call',
  CUSTOM: 'custom',
};

// 성능 모니터링 클래스
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = [];
    this.isInitialized = false;
  }
  
  // 초기화
  init() {
    if (this.isInitialized || !MONITORING_CONFIG.PERFORMANCE.ENABLED) {
      return;
    }
    
    this.isInitialized = true;
    
    // Web Vitals 모니터링
    if (typeof window !== 'undefined' && window.PerformanceObserver) {
      this.setupWebVitals();
    }
    
    // 사용자 정의 성능 메트릭
    this.setupCustomMetrics();
    
    // 리소스 모니터링
    this.setupResourceMonitoring();
    
    // 네트워크 모니터링
    this.setupNetworkMonitoring();
    
    console.log('[Monitoring] 성능 모니터링 초기화 완료');
  }
  
  // Web Vitals 설정
  setupWebVitals() {
    try {
      // LCP (Largest Contentful Paint)
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        
        if (lastEntry) {
          this.recordMetric(PerformanceMetric.LCP, lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      
      // FID (First Input Delay)
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          this.recordMetric(PerformanceMetric.FID, entry.processingStart - entry.startTime);
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      
      // CLS (Cumulative Layout Shift)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            this.recordMetric(PerformanceMetric.CLS, clsValue);
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      
      // FCP (First Contentful Paint)
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const entry = entries[0];
        if (entry) {
          this.recordMetric(PerformanceMetric.FCP, entry.startTime);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
      
      this.observers.push(lcpObserver, fidObserver, clsObserver, fcpObserver);
    } catch (error) {
      console.warn('[Monitoring] Web Vitals 모니터링 실패:', error);
    }
  }
  
  // 사용자 정의 메트릭 설정
  setupCustomMetrics() {
    // 페이지 로드 시간
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      this.recordMetric('PAGE_LOAD', loadTime);
    }
    
    // 메모리 사용량 (브라우저 지원 시)
    if (window.performance && window.performance.memory) {
      setInterval(() => {
        const memory = window.performance.memory;
        this.recordMetric('MEMORY_USED', memory.usedJSHeapSize);
        this.recordMetric('MEMORY_TOTAL', memory.totalJSHeapSize);
        this.recordMetric('MEMORY_LIMIT', memory.jsHeapSizeLimit);
      }, 30000);
    }
  }
  
  // 리소스 모니터링 설정
  setupResourceMonitoring() {
    if (!window.PerformanceObserver) return;
    
    const resourceObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        const resourceType = entry.initiatorType || 'other';
        const metricName = `RESOURCE_${resourceType.toUpperCase()}`;
        
        this.recordMetric(metricName, entry.duration, {
          name: entry.name,
          size: entry.transferSize || 0,
          type: resourceType,
        });
      });
    });
    
    resourceObserver.observe({ entryTypes: ['resource'] });
    this.observers.push(resourceObserver);
  }
  
  // 네트워크 모니터링 설정
  setupNetworkMonitoring() {
    if (!navigator.connection) return;
    
    const connection = navigator.connection;
    
    // 네트워크 정보 기록
    this.recordMetric('NETWORK_TYPE', connection.effectiveType, {
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    });
    
    // 네트워크 변경 감지
    connection.addEventListener('change', () => {
      this.recordMetric('NETWORK_CHANGE', connection.effectiveType, {
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });
    });
  }
  
  // 메트릭 기록
  recordMetric(name, value, metadata = {}) {
    const timestamp = Date.now();
    const metric = {
      name,
      value,
      timestamp,
      metadata,
    };
    
    this.metrics.set(`${name}_${timestamp}`, metric);
    
    // 임계값 검사
    this.checkThreshold(name, value, metric);
    
    // 옵저버에게 알림
    this.notifyObservers(MonitoringEvent.PERFORMANCE, metric);
    
    // 샘플링된 데이터만 저장
    if (Math.random() < MONITORING_CONFIG.PERFORMANCE.SAMPLE_RATE) {
      this.storeMetric(metric);
    }
    
    return metric;
  }
  
  // 임계값 검사
  checkThreshold(metricName, value, metric) {
    const threshold = MONITORING_CONFIG.PERFORMANCE.THRESHOLDS[metricName];
    
    if (threshold && value > threshold) {
      const errorMonitor = getErrorMonitor();
      errorMonitor.captureError(
        new Error(`성능 임계값 초과: ${metricName}=${value}ms`),
        {
          severity: ErrorSeverity.MEDIUM,
          context: {
            metric: metricName,
            value,
            threshold,
            ...metric.metadata,
          },
        }
      );
    }
  }
  
  // 메트릭 저장
  storeMetric(metric) {
    try {
      const stored = JSON.parse(localStorage.getItem('performance_metrics') || '[]');
      stored.push(metric);
      
      // 최대 100개만 유지
      if (stored.length > 100) {
        stored.splice(0, stored.length - 100);
      }
      
      localStorage.setItem('performance_metrics', JSON.stringify(stored));
    } catch (error) {
      console.warn('[Monitoring] 메트릭 저장 실패:', error);
    }
  }
  
  // 옵저버 등록
  addObserver(callback) {
    this.observers.push(callback);
  }
  
  // 옵저버에게 알림
  notifyObservers(event, data) {
    this.observers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.warn('[Monitoring] 옵저버 알림 실패:', error);
      }
    });
  }
  
  // 메트릭 가져오기
  getMetrics(filter = {}) {
    const metrics = Array.from(this.metrics.values());
    
    if (filter.name) {
      return metrics.filter(m => m.name === filter.name);
    }
    
    if (filter.startTime && filter.endTime) {
      return metrics.filter(m => 
        m.timestamp >= filter.startTime && m.timestamp <= filter.endTime
      );
    }
    
    return metrics;
  }
  
  // 평균 메트릭 계산
  getAverageMetric(name, period = 300000) { // 5분
    const now = Date.now();
    const metrics = this.getMetrics({
      name,
      startTime: now - period,
      endTime: now,
    });
    
    if (metrics.length === 0) return null;
    
    const sum = metrics.reduce((total, metric) => total + metric.value, 0);
    return sum / metrics.length;
  }
  
  // 정리
  cleanup() {
    this.observers.forEach(observer => {
      if (observer.disconnect) {
        observer.disconnect();
      }
    });
    this.observers = [];
    this.isInitialized = false;
  }
}

// 에러 모니터링 클래스
class ErrorMonitor {
  constructor() {
    this.errors = new Map();
    this.observers = [];
    this.isInitialized = false;
  }
  
  // 초기화
  init() {
    if (this.isInitialized || !MONITORING_CONFIG.ERROR.ENABLED) {
      return;
    }
    
    this.isInitialized = true;
    
    // 전역 에러 핸들러
    if (MONITORING_CONFIG.ERROR.CAPTURE_UNHANDLED) {
      this.setupGlobalErrorHandlers();
    }
    
    // 콘솔 에러 캡처
    if (MONITORING_CONFIG.ERROR.CAPTURE_CONSOLE) {
      this.setupConsoleCapture();
    }
    
    // 네트워크 에러 캡처
    if (MONITORING_CONFIG.ERROR.CAPTURE_NETWORK) {
      this.setupNetworkErrorCapture();
    }
    
    // Promise 에러 캡처
    this.setupPromiseErrorCapture();
    
    console.log('[Monitoring] 에러 모니터링 초기화 완료');
  }
  
  // 전역 에러 핸들러 설정
  setupGlobalErrorHandlers() {
    // 전역 에러 이벤트
    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), {
        severity: ErrorSeverity.HIGH,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          type: 'unhandled_error',
        },
      });
    });
    
    // 전역 Promise 에러
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(event.reason, {
        severity: ErrorSeverity.HIGH,
        context: {
          type: 'unhandled_promise',
        },
      });
    });
  }
  
  // 콘솔 에러 캡처
  setupConsoleCapture() {
    const originalConsole = {
      error: console.error,
      warn: console.warn,
      log: console.log,
      info: console.info,
      debug: console.debug,
    };
    
    // 에러 레벨
    console.error = (...args) => {
      this.captureConsoleError('error', args);
      originalConsole.error.apply(console, args);
    };
    
    console.warn = (...args) => {
      this.captureConsoleError('warn', args);
      originalConsole.warn.apply(console, args);
    };
    
    // 다른 레벨은 그대로 유지
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  }
  
  // 네트워크 에러 캡처
  setupNetworkErrorCapture() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const startTime = Date.now();
      
      try {
        const response = await originalFetch.apply(window, args);
        
        if (!response.ok) {
          this.captureNetworkError(response, args, startTime);
        }
        
        return response;
      } catch (error) {
        this.captureNetworkError(error, args, startTime);
        throw error;
      }
    };
  }
  
  // Promise 에러 캡처
  setupPromiseErrorCapture() {
    const originalPromise = window.Promise;
    
    window.Promise = class MonitoringPromise extends originalPromise {
      constructor(executor) {
        super((resolve, reject) => {
          executor(
            (value) => resolve(value),
            (reason) => {
              this.capturePromiseError(reason);
              reject(reason);
            }
          );
        });
      }
    };
    
    // 정적 메서드 복사
    Object.setPrototypeOf(window.Promise, originalPromise);
    window.Promise.all = originalPromise.all;
    window.Promise.race = originalPromise.race;
    window.Promise.resolve = originalPromise.resolve;
    window.Promise.reject = originalPromise.reject;
    window.Promise.allSettled = originalPromise.allSettled;
    window.Promise.any = originalPromise.any;
  }
  
  // 콘솔 에러 캡처
  captureConsoleError(level, args) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    this.captureError(new Error(message), {
      severity: level === 'error' ? ErrorSeverity.MEDIUM : ErrorSeverity.LOW,
      context: {
        type: 'console',
        level,
        args: args.slice(0, 5), // 최대 5개만 저장
      },
    });
  }
  
  // 네트워크 에러 캡처
  captureNetworkError(errorOrResponse, requestArgs, startTime) {
    const duration = Date.now() - startTime;
    let error;
    let context = {
      type: 'network',
      duration,
      timestamp: startTime,
    };
    
    if (errorOrResponse instanceof Response) {
      const response = errorOrResponse;
      error = new Error(`HTTP ${response.status} ${response.statusText}`);
      context = {
        ...context,
        url: requestArgs[0],
        method: requestArgs[1]?.method || 'GET',
        status: response.status,
        statusText: response.statusText,
      };
    } else {
      error = errorOrResponse;
      context = {
        ...context,
        url: requestArgs[0],
        method: requestArgs[1]?.method || 'GET',
        errorType: error.name,
      };
    }
    
    this.captureError(error, {
      severity: ErrorSeverity.MEDIUM,
      context,
    });
  }
  
  // Promise 에러 캡처
  capturePromiseError(reason) {
    this.captureError(reason, {
      severity: ErrorSeverity.MEDIUM,
      context: {
        type: 'promise',
      },
    });
  }
  
  // 에러 캡처
  captureError(error, options = {}) {
    // 무시할 패턴 확인
    if (this.shouldIgnoreError(error)) {
      return null;
    }
    
    const timestamp = Date.now();
    const errorId = `err_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorData = {
      id: errorId,
      message: error.message,
      name: error.name,
      stack: error.stack,
      severity: options.severity || ErrorSeverity.MEDIUM,
      timestamp,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        ...options.context,
      },
    };
    
    this.errors.set(errorId, errorData);
    
    // 옵저버에게 알림
    this.notifyObservers(MonitoringEvent.ERROR, errorData);
    
    // 에러 저장
    this.storeError(errorData);
    
    return errorData;
  }
  
  // 에러 무시 여부 확인
  shouldIgnoreError(error) {
    const message = error.message || '';
    
    return MONITORING_CONFIG.ERROR.IGNORE_PATTERNS.some(pattern => 
      pattern.test(message)
    );
  }
  
  // 에러 저장
  storeError(errorData) {
    try {
      const stored = JSON.parse(localStorage.getItem('error_logs') || '[]');
      stored.push(errorData);
      
      // 최대 50개만 유지
      if (stored.length > 50) {
        stored.splice(0, stored.length - 50);
      }
      
      localStorage.setItem('error_logs', JSON.stringify(stored));
    } catch (error) {
      console.warn('[Monitoring] 에러 저장 실패:', error);
    }
  }
  
  // 옵저버 등록
  addObserver(callback) {
    this.observers.push(callback);
  }
  
  // 옵저버에게 알림
  notifyObservers(event, data) {
    this.observers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.warn('[Monitoring] 옵저버 알림 실패:', error);
      }
    });
  }
  
  // 에러 가져오기
  getErrors(filter = {}) {
    const errors = Array.from(this.errors.values());
    
    if (filter.severity) {
      return errors.filter(e => e.severity === filter.severity);
    }
    
    if (filter.startTime && filter.endTime) {
      return errors.filter(e => 
        e.timestamp >= filter.startTime && e.timestamp <= filter.endTime
      );
    }
    
    return errors;
  }
  
  // 에러 통계
  getErrorStats(period = 86400000) { // 24시간
    const now = Date.now();
    const errors = this.getErrors({
      startTime: now - period,
      endTime: now,
    });
    
    const stats = {
      total: errors.length,
      bySeverity: {},
      byType: {},
      recent: errors.slice(-10),
    };
    
    errors.forEach(error => {
      // 심각도별 통계
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      
      // 타입별 통계
      const type = error.context?.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    return stats;
  }
  
  // 정리
  cleanup() {
    // 원래 콘솔 함수 복원
    if (this.originalConsole) {
      Object.assign(console, this.originalConsole);
    }
    
    // 원래 fetch 함수 복원
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    
    // 원래 Promise 복원
    if (this.originalPromise) {
      window.Promise = this.originalPromise;
    }
    
    this.observers = [];
    this.isInitialized = false;
  }
}

// 애널리틱스 모니터링 클래스
class AnalyticsMonitor {
  constructor() {
    this.events = new Map();
    this.observers = [];
    this.isInitialized = false;
    this.sessionId = this.generateSessionId();
    this.pageViews = 0;
  }
  
  // 초기화
  init() {
    if (this.isInitialized || !MONITORING_CONFIG.ANALYTICS.ENABLED) {
      return;
    }
    
    this.isInitialized = true;
    
    // 자동 이벤트 트래킹
    if (MONITORING_CONFIG.ANALYTICS.AUTO_TRACK) {
      this.setupAutoTracking();
    }
    
    // 세션 시작
    this.trackSessionStart();
    
    // 페이지 뷰 트래킹
    this.trackPageView();
    
    console.log('[Monitoring] 애널리틱스 모니터링 초기화 완료');
  }
  
  // 세션 ID 생성
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // 자동 트래킹 설정
  setupAutoTracking() {
    // 클릭 이벤트
    document.addEventListener('click', (event) => {
      this.trackClick(event);
    }, { capture: true });
    
    // 폼 제출 이벤트
    document.addEventListener('submit', (event) => {
      this.trackFormSubmit(event);
    }, { capture: true });
    
    // 네비게이션 이벤트 (SPA)
    window.addEventListener('popstate', () => {
      this.trackNavigation();
    });
    
    // 해시 변경 이벤트
    window.addEventListener('hashchange', () => {
      this.trackNavigation();
    });
  }
  
  // 세션 시작 트래킹
  trackSessionStart() {
    this.trackEvent('session_start', {
      sessionId: this.sessionId,
      referrer: document.referrer,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
  }
  
  // 페이지 뷰 트래킹
  trackPageView() {
    this.pageViews++;
    
    this.trackEvent('page_view', {
      sessionId: this.sessionId,
      pageViews: this.pageViews,
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
    });
  }
  
  // 네비게이션 트래킹
  trackNavigation() {
    setTimeout(() => {
      this.trackPageView();
    }, 100);
  }
  
  // 클릭 이벤트 트래킹
  trackClick(event) {
    const target = event.target;
    
    // 중요한 요소만 트래킹
    if (target.matches('button, a, [role="button"], input[type="submit"], input[type="button"]')) {
      const eventData = {
        sessionId: this.sessionId,
        element: {
          tagName: target.tagName,
          id: target.id,
          className: target.className,
          text: target.textContent?.trim().substring(0, 100),
          href: target.href,
          type: target.type,
          name: target.name,
        },
        position: {
          x: event.clientX,
          y: event.clientY,
        },
      };
      
      this.trackEvent('click', eventData);
    }
  }
  
  // 폼 제출 이벤트 트래킹
  trackFormSubmit(event) {
    const form = event.target;
    
    const eventData = {
      sessionId: this.sessionId,
      form: {
        id: form.id,
        className: form.className,
        action: form.action,
        method: form.method,
        fields: Array.from(form.elements)
          .filter(el => el.name)
          .map(el => ({
            name: el.name,
            type: el.type,
            required: el.required,
          })),
      },
    };
    
    this.trackEvent('form_submit', eventData);
  }
  
  // 사용자 정의 이벤트 트래킹
  trackEvent(name, data = {}) {
    const timestamp = Date.now();
    const eventId = `event_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    const eventData = {
      id: eventId,
      name,
      timestamp,
      sessionId: this.sessionId,
      data: MONITORING_CONFIG.ANALYTICS.PRIVACY_MODE 
        ? this.anonymizeData(data) 
        : data,
    };
    
    this.events.set(eventId, eventData);
    
    // 옵저버에게 알림
    this.notifyObservers(MonitoringEvent.USER_ACTION, eventData);
    
    // 이벤트 저장
    this.storeEvent(eventData);
    
    return eventData;
  }
  
  // 데이터 익명화 (개인정보 보호)
  anonymizeData(data) {
    const anonymized = { ...data };
    
    // 개인정보 필드 제거
    const sensitiveFields = ['email', 'password', 'phone', 'address', 'creditCard', 'ssn'];
    sensitiveFields.forEach(field => {
      if (anonymized[field]) {
        anonymized[field] = '[REDACTED]';
      }
    });
    
    // IP 주소 마스킹
    if (anonymized.ip) {
      anonymized.ip = anonymized.ip.replace(/\d+\.\d+$/, '0.0');
    }
    
    return anonymized;
  }
  
  // 이벤트 저장
  storeEvent(eventData) {
    try {
      const stored = JSON.parse(localStorage.getItem('analytics_events') || '[]');
      stored.push(eventData);
      
      // 최대 200개만 유지
      if (stored.length > 200) {
        stored.splice(0, stored.length - 200);
      }
      
      localStorage.setItem('analytics_events', JSON.stringify(stored));
    } catch (error) {
      console.warn('[Monitoring] 이벤트 저장 실패:', error);
    }
  }
  
  // 옵저버 등록
  addObserver(callback) {
    this.observers.push(callback);
  }
  
  // 옵저버에게 알림
  notifyObservers(event, data) {
    this.observers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.warn('[Monitoring] 옵저버 알림 실패:', error);
      }
    });
  }
  
  // 이벤트 가져오기
  getEvents(filter = {}) {
    const events = Array.from(this.events.values());
    
    if (filter.name) {
      return events.filter(e => e.name === filter.name);
    }
    
    if (filter.startTime && filter.endTime) {
      return events.filter(e => 
        e.timestamp >= filter.startTime && e.timestamp <= filter.endTime
      );
    }
    
    return events;
  }
  
  // 이벤트 통계
  getEventStats(period = 86400000) { // 24시간
    const now = Date.now();
    const events = this.getEvents({
      startTime: now - period,
      endTime: now,
    });
    
    const stats = {
      total: events.length,
      byType: {},
      uniqueSessions: new Set(),
      recent: events.slice(-20),
    };
    
    events.forEach(event => {
      // 타입별 통계
      stats.byType[event.name] = (stats.byType[event.name] || 0) + 1;
      
      // 고유 세션 수
      if (event.sessionId) {
        stats.uniqueSessions.add(event.sessionId);
      }
    });
    
    stats.uniqueSessionCount = stats.uniqueSessions.size;
    delete stats.uniqueSessions;
    
    return stats;
  }
  
  // 정리
  cleanup() {
    this.observers = [];
    this.isInitialized = false;
  }
}

// 로깅 클래스
class Logger {
  constructor() {
    this.logs = [];
    this.isInitialized = false;
    this.flushInterval = null;
  }
  
  // 초기화
  init() {
    if (this.isInitialized || !MONITORING_CONFIG.LOGGING.ENABLED) {
      return;
    }
    
    this.isInitialized = true;
    
    // 주기적 로그 플러시
    if (MONITORING_CONFIG.LOGGING.REMOTE) {
      this.flushInterval = setInterval(() => {
        this.flushLogs();
      }, MONITORING_CONFIG.LOGGING.FLUSH_INTERVAL);
    }
    
    console.log('[Monitoring] 로깅 시스템 초기화 완료');
  }
  
  // 로그 기록
  log(level, message, data = {}) {
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const currentLevel = logLevels.indexOf(MONITORING_CONFIG.LOGGING.LEVEL);
    const messageLevel = logLevels.indexOf(level);
    
    // 로그 레벨 필터링
    if (messageLevel < currentLevel) {
      return;
    }
    
    const timestamp = Date.now();
    const logId = `log_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    const logData = {
      id: logId,
      level,
      message,
      timestamp,
      data,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
      },
    };
    
    this.logs.push(logData);
    
    // 콘솔 출력
    if (MONITORING_CONFIG.LOGGING.CONSOLE) {
      this.logToConsole(level, message, data);
    }
    
    // 버퍼 크기 제한
    if (this.logs.length > MONITORING_CONFIG.LOGGING.BUFFER_SIZE) {
      this.logs.splice(0, this.logs.length - MONITORING_CONFIG.LOGGING.BUFFER_SIZE);
    }
    
    // 로그 저장
    this.storeLog(logData);
    
    return logData;
  }
  
  // 콘솔 출력
  logToConsole(level, message, data) {
    const styles = {
      debug: 'color: #666;',
      info: 'color: #0066cc;',
      warn: 'color: #ff9900;',
      error: 'color: #cc0000; font-weight: bold;',
    };
    
    const style = styles[level] || styles.info;
    
    if (Object.keys(data).length > 0) {
      console.log(`%c[${level.toUpperCase()}] ${message}`, style, data);
    } else {
      console.log(`%c[${level.toUpperCase()}] ${message}`, style);
    }
  }
  
  // 로그 저장
  storeLog(logData) {
    try {
      const stored = JSON.parse(localStorage.getItem('app_logs') || '[]');
      stored.push(logData);
      
      // 최대 500개만 유지
      if (stored.length > 500) {
        stored.splice(0, stored.length - 500);
      }
      
      localStorage.setItem('app_logs', JSON.stringify(stored));
    } catch (error) {
      console.warn('[Monitoring] 로그 저장 실패:', error);
    }
  }
  
  // 로그 플러시 (원격 서버로 전송)
  flushLogs() {
    if (this.logs.length === 0) return;
    
    const logsToSend = [...this.logs];
    this.logs = [];
    
    // 원격 서버로 전송 (구현 필요)
    // fetch('/api/logs', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(logsToSend),
    // }).catch(error => {
    //   console.warn('[Monitoring] 로그 전송 실패:', error);
    //   // 실패 시 로그 복원
    //   this.logs.unshift(...logsToSend);
    // });
  }
  
  // 로그 가져오기
  getLogs(filter = {}) {
    let logs = [...this.logs];
    
    if (filter.level) {
      logs = logs.filter(l => l.level === filter.level);
    }
    
    if (filter.startTime && filter.endTime) {
      logs = logs.filter(l => 
        l.timestamp >= filter.startTime && l.timestamp <= filter.endTime
      );
    }
    
    return logs;
  }
  
  // 정리
  cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // 남은 로그 플러시
    this.flushLogs();
    
    this.isInitialized = false;
  }
}

// 싱글톤 인스턴스
let performanceMonitor = null;
let errorMonitor = null;
let analyticsMonitor = null;
let logger = null;

// 인스턴스 가져오기
export function getPerformanceMonitor() {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

export function getErrorMonitor() {
  if (!errorMonitor) {
    errorMonitor = new ErrorMonitor();
  }
  return errorMonitor;
}

export function getAnalyticsMonitor() {
  if (!analyticsMonitor) {
    analyticsMonitor = new AnalyticsMonitor();
  }
  return analyticsMonitor;
}

export function getLogger() {
  if (!logger) {
    logger = new Logger();
  }
  return logger;
}

// 모니터링 시스템 초기화
export function initMonitoring() {
  if (typeof window === 'undefined') return;
  
  const performanceMonitor = getPerformanceMonitor();
  const errorMonitor = getErrorMonitor();
  const analyticsMonitor = getAnalyticsMonitor();
  const logger = getLogger();
  
  performanceMonitor.init();
  errorMonitor.init();
  analyticsMonitor.init();
  logger.init();
  
  console.log('[Monitoring] 전체 모니터링 시스템 초기화 완료');
}




