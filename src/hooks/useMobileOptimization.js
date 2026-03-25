/**
 * 모바일 UX 최적화 훅
 * 터치 인터랙션 최적화, 모바일 전용 레이아웃 개선
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// 모바일 최적화 설정
const MOBILE_OPTIMIZATION_CONFIG = {
  // 터치 영역 최소 크기 (px)
  MIN_TOUCH_TARGET: 44,
  // 스와이프 감도 (px)
  SWIPE_THRESHOLD: 50,
  // 더블 탭 간격 (ms)
  DOUBLE_TAP_INTERVAL: 300,
  // 롱 프레스 시간 (ms)
  LONG_PRESS_DURATION: 500,
  // 가상 키보드 높이 추정 (px)
  VIRTUAL_KEYBOARD_HEIGHT: 300,
  // 안전 영역 (notch, home indicator 등)
  SAFE_AREA_INSETS: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
};

// 기기 정보 가져오기
function getDeviceInfo() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /android/i.test(userAgent);
  const isMobile = isIOS || isAndroid || /Mobile|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(userAgent);
  const isDesktop = !isMobile && !isTablet;
  
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  
  const isLandscape = screenWidth > screenHeight;
  const isPortrait = !isLandscape;
  
  const isRetina = pixelRatio >= 2;
  const isHighDPI = pixelRatio > 1;
  
  // 네이티브 플랫폼 확인
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  
  return {
    isIOS,
    isAndroid,
    isMobile,
    isTablet,
    isDesktop,
    isLandscape,
    isPortrait,
    isRetina,
    isHighDPI,
    isNative,
    platform,
    screenWidth,
    screenHeight,
    pixelRatio,
    userAgent,
  };
}

// 안전 영역 계산
function calculateSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  
  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top')) || 0,
    right: parseInt(style.getPropertyValue('--safe-area-inset-right')) || 0,
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom')) || 0,
    left: parseInt(style.getPropertyValue('--safe-area-inset-left')) || 0,
  };
}

// 터치 이벤트 지원 확인
function supportsTouchEvents() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// 가상 키보드 상태 확인
function getKeyboardState() {
  const visualViewport = window.visualViewport;
  
  if (visualViewport) {
    const viewportHeight = visualViewport.height;
    const windowHeight = window.innerHeight;
    const keyboardHeight = windowHeight - viewportHeight;
    
    return {
      isVisible: keyboardHeight > 100, // 키보드가 100px 이상 올라왔을 때
      height: keyboardHeight,
      viewportHeight,
      windowHeight,
    };
  }
  
  return {
    isVisible: false,
    height: 0,
    viewportHeight: window.innerHeight,
    windowHeight: window.innerHeight,
  };
}

// 모바일 최적화 훅
export function useMobileOptimization(options = {}) {
  const {
    enableTouchOptimization = true,
    enableKeyboardDetection = true,
    enableOrientationDetection = true,
    enableSafeArea = true,
    enablePerformanceMonitoring = true,
  } = options;
  
  const [deviceInfo, setDeviceInfo] = useState(getDeviceInfo());
  const [safeAreaInsets, setSafeAreaInsets] = useState(calculateSafeAreaInsets());
  const [keyboardState, setKeyboardState] = useState(getKeyboardState());
  const [orientation, setOrientation] = useState(deviceInfo.isLandscape ? 'landscape' : 'portrait');
  const [touchEvents, setTouchEvents] = useState({
    lastTap: 0,
    lastTapPosition: { x: 0, y: 0 },
    swipeStart: null,
    longPressTimer: null,
  });
  
  const performanceMetricsRef = useRef({
    touchLatency: [],
    renderTime: [],
    memoryUsage: [],
  });
  
  const resizeObserverRef = useRef(null);
  const visualViewportRef = useRef(null);
  
  // 기기 정보 업데이트
  const updateDeviceInfo = useCallback(() => {
    setDeviceInfo(getDeviceInfo());
  }, []);
  
  // 안전 영역 업데이트
  const updateSafeAreaInsets = useCallback(() => {
    setSafeAreaInsets(calculateSafeAreaInsets());
  }, []);
  
  // 키보드 상태 업데이트
  const updateKeyboardState = useCallback(() => {
    setKeyboardState(getKeyboardState());
  }, []);
  
  // 방향 변경 감지
  const handleOrientationChange = useCallback(() => {
    const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    setOrientation(newOrientation);
    updateDeviceInfo();
  }, [updateDeviceInfo]);
  
  // 터치 이벤트 핸들러
  const handleTouchStart = useCallback((event) => {
    if (!enableTouchOptimization) return;
    
    const touch = event.touches[0];
    const position = { x: touch.clientX, y: touch.clientY };
    
    // 롱 프레스 타이머 시작
    const longPressTimer = setTimeout(() => {
      event.target.dispatchEvent(new CustomEvent('longpress', {
        bubbles: true,
        detail: { position },
      }));
    }, MOBILE_OPTIMIZATION_CONFIG.LONG_PRESS_DURATION);
    
    setTouchEvents(prev => ({
      ...prev,
      swipeStart: position,
      longPressTimer,
    }));
    
    // 터치 지연 시간 측정
    const touchStartTime = Date.now();
    const handleTouchEnd = () => {
      const latency = Date.now() - touchStartTime;
      performanceMetricsRef.current.touchLatency.push(latency);
      
      // 최근 10개만 유지
      if (performanceMetricsRef.current.touchLatency.length > 10) {
        performanceMetricsRef.current.touchLatency.shift();
      }
      
      document.removeEventListener('touchend', handleTouchEnd);
    };
    
    document.addEventListener('touchend', handleTouchEnd, { once: true });
  }, [enableTouchOptimization]);
  
  const handleTouchMove = useCallback((event) => {
    if (!enableTouchOptimization || !touchEvents.swipeStart) return;
    
    const touch = event.touches[0];
    const currentPosition = { x: touch.clientX, y: touch.clientY };
    const startPosition = touchEvents.swipeStart;
    
    const deltaX = currentPosition.x - startPosition.x;
    const deltaY = currentPosition.y - startPosition.y;
    
    // 스와이프 감지
    if (Math.abs(deltaX) > MOBILE_OPTIMIZATION_CONFIG.SWIPE_THRESHOLD ||
        Math.abs(deltaY) > MOBILE_OPTIMIZATION_CONFIG.SWIPE_THRESHOLD) {
      
      // 롱 프레스 타이머 취소
      if (touchEvents.longPressTimer) {
        clearTimeout(touchEvents.longPressTimer);
      }
      
      const direction = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up');
      
      event.target.dispatchEvent(new CustomEvent('swipe', {
        bubbles: true,
        detail: {
          direction,
          deltaX,
          deltaY,
          startPosition,
          currentPosition,
        },
      }));
      
      setTouchEvents(prev => ({
        ...prev,
        swipeStart: null,
        longPressTimer: null,
      }));
    }
  }, [enableTouchOptimization, touchEvents]);
  
  const handleTouchEnd = useCallback((event) => {
    if (!enableTouchOptimization) return;
    
    // 롱 프레스 타이머 취소
    if (touchEvents.longPressTimer) {
      clearTimeout(touchEvents.longPressTimer);
    }
    
    const touch = event.changedTouches[0];
    const position = { x: touch.clientX, y: touch.clientY };
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - touchEvents.lastTap;
    
    // 더블 탭 감지
    if (timeSinceLastTap < MOBILE_OPTIMIZATION_CONFIG.DOUBLE_TAP_INTERVAL) {
      const distance = Math.sqrt(
        Math.pow(position.x - touchEvents.lastTapPosition.x, 2) +
        Math.pow(position.y - touchEvents.lastTapPosition.y, 2)
      );
      
      if (distance < MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET) {
        event.target.dispatchEvent(new CustomEvent('doubletap', {
          bubbles: true,
          detail: { position },
        }));
        
        setTouchEvents(prev => ({
          ...prev,
          lastTap: 0,
          lastTapPosition: { x: 0, y: 0 },
        }));
        return;
      }
    }
    
    // 일반 탭
    event.target.dispatchEvent(new CustomEvent('tap', {
      bubbles: true,
      detail: { position },
    }));
    
    setTouchEvents(prev => ({
      ...prev,
      lastTap: currentTime,
      lastTapPosition: position,
      swipeStart: null,
      longPressTimer: null,
    }));
  }, [enableTouchOptimization, touchEvents]);
  
  // 터치 최적화 적용
  const applyTouchOptimization = useCallback(() => {
    if (!enableTouchOptimization) return;
    
    // 모든 터치 타겟에 최소 크기 적용
    const touchTargets = document.querySelectorAll('button, a, input, select, [role="button"]');
    
    touchTargets.forEach(target => {
      const rect = target.getBoundingClientRect();
      const isTooSmall = rect.width < MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET ||
                        rect.height < MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET;
      
      if (isTooSmall) {
        target.style.minWidth = `${MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET}px`;
        target.style.minHeight = `${MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET}px`;
        target.style.padding = '12px';
      }
    });
    
    // 터치 액션 설정
    document.documentElement.style.touchAction = 'manipulation';
    
    // 스크롤 성능 최적화
    document.documentElement.style.webkitOverflowScrolling = 'touch';
  }, [enableTouchOptimization]);
  
  // 모바일 레이아웃 최적화
  const optimizeMobileLayout = useCallback(() => {
    if (!deviceInfo.isMobile) return;
    
    const root = document.documentElement;
    
    // 모바일 전용 CSS 변수 설정
    if (deviceInfo.isMobile) {
      root.style.setProperty('--mobile-padding', '16px');
      root.style.setProperty('--mobile-font-size', '16px');
      root.style.setProperty('--mobile-line-height', '1.5');
      
      // 안전 영역 적용
      if (enableSafeArea) {
        root.style.setProperty('--safe-area-inset-top', `${safeAreaInsets.top}px`);
        root.style.setProperty('--safe-area-inset-right', `${safeAreaInsets.right}px`);
        root.style.setProperty('--safe-area-inset-bottom', `${safeAreaInsets.bottom}px`);
        root.style.setProperty('--safe-area-inset-left', `${safeAreaInsets.left}px`);
      }
    }
    
    // 키보드가 보일 때 레이아웃 조정
    if (keyboardState.isVisible) {
      root.style.setProperty('--keyboard-height', `${keyboardState.height}px`);
      
      // 입력 필드가 키보드에 가려지지 않도록 스크롤
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        setTimeout(() => {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [deviceInfo.isMobile, enableSafeArea, safeAreaInsets, keyboardState]);
  
  // 성능 모니터링
  const startPerformanceMonitoring = useCallback(() => {
    if (!enablePerformanceMonitoring) return;
    
    // 렌더링 시간 측정
    const measureRenderTime = () => {
      const startTime = performance.now();
      
      requestAnimationFrame(() => {
        const renderTime = performance.now() - startTime;
        performanceMetricsRef.current.renderTime.push(renderTime);
        
        if (performanceMetricsRef.current.renderTime.length > 10) {
          performanceMetricsRef.current.renderTime.shift();
        }
      });
    };
    
    // 메모리 사용량 측정 (브라우저 지원 시)
    const measureMemoryUsage = () => {
      if (window.performance && window.performance.memory) {
        const memory = window.performance.memory;
        performanceMetricsRef.current.memoryUsage.push({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          timestamp: Date.now(),
        });
        
        if (performanceMetricsRef.current.memoryUsage.length > 10) {
          performanceMetricsRef.current.memoryUsage.shift();
        }
      }
    };
    
    // 주기적 측정
    const interval = setInterval(() => {
      measureRenderTime();
      measureMemoryUsage();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [enablePerformanceMonitoring]);
  
  // 효과
  useEffect(() => {
    updateDeviceInfo();
    updateSafeAreaInsets();
    applyTouchOptimization();
    optimizeMobileLayout();
    
    // 리사이즈 감지
    const handleResize = () => {
      updateDeviceInfo();
      updateSafeAreaInsets();
      updateKeyboardState();
      handleOrientationChange();
      applyTouchOptimization();
      optimizeMobileLayout();
    };
    
    window.addEventListener('resize', handleResize);
    
    // 비주얼 뷰포트 변경 감지 (모바일 키보드)
    if (window.visualViewport) {
      visualViewportRef.current = window.visualViewport;
      visualViewportRef.current.addEventListener('resize', updateKeyboardState);
      visualViewportRef.current.addEventListener('scroll', updateKeyboardState);
    }
    
    // 터치 이벤트 리스너
    if (supportsTouchEvents()) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
    
    // 성능 모니터링 시작
    const stopPerformanceMonitoring = startPerformanceMonitoring();
    
    // ResizeObserver 설정
    if ('ResizeObserver' in window) {
      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(document.body);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (visualViewportRef.current) {
        visualViewportRef.current.removeEventListener('resize', updateKeyboardState);
        visualViewportRef.current.removeEventListener('scroll', updateKeyboardState);
      }
      
      if (supportsTouchEvents()) {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      }
      
      if (stopPerformanceMonitoring) {
        stopPerformanceMonitoring();
      }
      
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [
    updateDeviceInfo,
    updateSafeAreaInsets,
    updateKeyboardState,
    handleOrientationChange,
    applyTouchOptimization,
    optimizeMobileLayout,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    startPerformanceMonitoring,
  ]);
  
  // 성능 메트릭 계산
  const getPerformanceMetrics = useCallback(() => {
    const touchLatency = performanceMetricsRef.current.touchLatency;
    const renderTime = performanceMetricsRef.current.renderTime;
    const memoryUsage = performanceMetricsRef.current.memoryUsage;
    
    const avgTouchLatency = touchLatency.length > 0
      ? touchLatency.reduce((a, b) => a + b, 0) / touchLatency.length
      : 0;
    
    const avgRenderTime = renderTime.length > 0
      ? renderTime.reduce((a, b) => a + b, 0) / renderTime.length
      : 0;
    
    const latestMemoryUsage = memoryUsage.length > 0
      ? memoryUsage[memoryUsage.length - 1]
      : null;
    
    return {
      touchLatency: {
        average: avgTouchLatency,
        samples: touchLatency.length,
        latest: touchLatency.length > 0 ? touchLatency[touchLatency.length - 1] : 0,
      },
      renderTime: {
        average: avgRenderTime,
        samples: renderTime.length,
        latest: renderTime.length > 0 ? renderTime[renderTime.length - 1] : 0,
      },
      memoryUsage: latestMemoryUsage,
      deviceInfo,
      keyboardState,
      orientation,
    };
  }, [deviceInfo, keyboardState, orientation]);
  
  // 모바일 최적화 권장사항
  const getOptimizationRecommendations = useCallback(() => {
    const recommendations = [];
    
    if (deviceInfo.isMobile) {
      // 터치 타겟 크기 검사
      const touchTargets = document.querySelectorAll('button, a, input, select, [role="button"]');
      const smallTargets = Array.from(touchTargets).filter(target => {
        const rect = target.getBoundingClientRect();
        return rect.width < MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET ||
               rect.height < MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET;
      });
      
      if (smallTargets.length > 0) {
        recommendations.push({
          type: 'touch_target',
          severity: 'medium',
          message: `${smallTargets.length}개의 터치 요소가 최소 크기(${MOBILE_OPTIMIZATION_CONFIG.MIN_TOUCH_TARGET}px)보다 작습니다.`,
          fix: 'min-width와 min-height 스타일을 추가하세요.',
        });
      }
      
      // 폰트 크기 검사
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (rootFontSize < 16) {
        recommendations.push({
          type: 'font_size',
          severity: 'high',
          message: `기본 폰트 크기(${rootFontSize}px)가 모바일에서 읽기 어려울 수 있습니다.`,
          fix: '기본 폰트 크기를 16px 이상으로 설정하세요.',
        });
      }
      
      // 대비 검사 (간단한 검사)
      const bodyColor = getComputedStyle(document.body).color;
      const bodyBgColor = getComputedStyle(document.body).backgroundColor;
      
      // 간단한 대비 계산 (실제로는 더 정교한 계산 필요)
      if (bodyColor && bodyBgColor && bodyColor === bodyBgColor) {
        recommendations.push({
          type: 'contrast',
          severity: 'high',
          message: '텍스트와 배경 색상이 동일하여 가독성이 떨어집니다.',
          fix: '텍스트와 배경의 색상 대비를 높이세요.',
        });
      }
    }
    
    // 성능 권장사항
    const metrics = getPerformanceMetrics();
    if (metrics.touchLatency.average > 100) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        message: `평균 터치 지연 시간(${metrics.touchLatency.average.toFixed(2)}ms)이 높습니다.`,
        fix: '이벤트 핸들러 최적화 및 CSS will-change 속성 사용을 고려하세요.',
      });
    }
    
    if (metrics.renderTime.average > 16.67) { // 60fps 기준
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        message: `평균 렌더링 시간(${metrics.renderTime.average.toFixed(2)}ms)이 높습니다.`,
        fix: '렌더링 성능 최적화 및 불필요한 리렌더링 방지를 고려하세요.',
      });
    }
    
    return recommendations;
  }, [deviceInfo, getPerformanceMetrics]);
  
  // 모바일 전용 유틸리티 함수
  const mobileUtils = {
    // 안전 영역 스타일 적용
    applySafeAreaStyles: (element, sides = ['top', 'right', 'bottom', 'left']) => {
      if (!element || !deviceInfo.isMobile) return;
      
      sides.forEach(side => {
        const inset = safeAreaInsets[side];
        if (inset > 0) {
          element.style[`padding${side.charAt(0).toUpperCase() + side.slice(1)}`] = 
            `calc(${element.style[`padding${side.charAt(0).toUpperCase() + side.slice(1)}`] || '0px'} + ${inset}px)`;
        }
      });
    },
    
    // 키보드 감지 시 스크롤 조정
    scrollToInput: (inputElement) => {
      if (!inputElement || !keyboardState.isVisible) return;
      
      setTimeout(() => {
        inputElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }, 100);
    },
    
    // 터치 피드백 추가
    addTouchFeedback: (element, feedbackType = 'highlight') => {
      if (!element || !supportsTouchEvents()) return;
      
      const originalStyles = {
        transition: element.style.transition,
        opacity: element.style.opacity,
        transform: element.style.transform,
      };
      
      const handleTouchStart = () => {
        if (feedbackType === 'highlight') {
          element.style.opacity = '0.7';
        } else if (feedbackType === 'scale') {
          element.style.transform = 'scale(0.95)';
        }
      };
      
      const handleTouchEnd = () => {
        element.style.opacity = originalStyles.opacity;
        element.style.transform = originalStyles.transform;
      };
      
      element.addEventListener('touchstart', handleTouchStart);
      element.addEventListener('touchend', handleTouchEnd);
      element.addEventListener('touchcancel', handleTouchEnd);
      
      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchend', handleTouchEnd);
        element.removeEventListener('touchcancel', handleTouchEnd);
        
        element.style.transition = originalStyles.transition;
        element.style.opacity = originalStyles.opacity;
        element.style.transform = originalStyles.transform;
      };
    },
    
    // 모바일 브라우저 호환성 체크
    checkBrowserCompatibility: () => {
      const compatibility = {
        supportsTouch: supportsTouchEvents(),
        supportsVisualViewport: !!window.visualViewport,
        supportsResizeObserver: 'ResizeObserver' in window,
        supportsPerformanceAPI: 'performance' in window && 'memory' in performance,
        supportsCSSVariables: CSS.supports('(--test: 0)'),
        supportsFlexbox: CSS.supports('display', 'flex'),
        supportsGrid: CSS.supports('display', 'grid'),
      };
      
      return compatibility;
    },
  };
  
  return {
    // 상태
    deviceInfo,
    safeAreaInsets,
    keyboardState,
    orientation,
    touchEvents,
    
    // 함수
    updateDeviceInfo,
    updateSafeAreaInsets,
    updateKeyboardState,
    applyTouchOptimization,
    optimizeMobileLayout,
    getPerformanceMetrics,
    getOptimizationRecommendations,
    
    // 유틸리티
    mobileUtils,
    
    // 설정
    config: MOBILE_OPTIMIZATION_CONFIG,
    
    // 최적화 상태
    isOptimized: deviceInfo.isMobile ? 
      (performanceMetricsRef.current.touchLatency.length > 0 &&
       performanceMetricsRef.current.renderTime.length > 0) : 
      true,
    
    // 권장사항
    recommendations: getOptimizationRecommendations(),
    
    // 호환성 정보
    compatibility: mobileUtils.checkBrowserCompatibility(),
  };
}

// 간단한 모바일 최적화 훅 (기본 사용)
export function useSimpleMobileOptimization() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const mobile = /Mobile|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      setIsMobile(mobile);
      setIsTouch(touch);
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    checkDevice();
    
    const handleResize = () => {
      checkDevice();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const isSmallScreen = screenSize.width < 768;
  const isMediumScreen = screenSize.width >= 768 && screenSize.width < 1024;
  const isLargeScreen = screenSize.width >= 1024;
  
  const isPortrait = screenSize.height > screenSize.width;
  const isLandscape = !isPortrait;
  
  return {
    isMobile,
    isTouch,
    screenSize,
    isSmallScreen,
    isMediumScreen,
    isLargeScreen,
    isPortrait,
    isLandscape,
    shouldOptimize: isMobile || isTouch || isSmallScreen,
  };
}

// 모바일 최적화 컴포넌트
export function MobileOptimizationProvider({ children, options = {} }) {
  const mobileOptimization = useMobileOptimization(options);
  
  // 모바일 최적화 스타일 적용
  useEffect(() => {
    const styleId = 'mobile-optimization-styles';
    
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        /* 모바일 최적화 CSS */
        @media (max-width: 768px) {
          :root {
            --mobile-padding: 16px;
            --mobile-font-size: 16px;
            --mobile-line-height: 1.5;
            --mobile-touch-target: 44px;
          }
          
          body {
            font-size: var(--mobile-font-size);
            line-height: var(--mobile-line-height);
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
          
          button, a, input, select, [role="button"] {
            min-height: var(--mobile-touch-target);
            min-width: var(--mobile-touch-target);
          }
          
          input, textarea, select {
            font-size: 16px; /* iOS zoom 방지 */
          }
        }
        
        /* 터치 액션 최적화 */
        * {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        
        /* 스크롤 성능 최적화 */
        .scroll-container {
          -webkit-overflow-scrolling: touch;
          overflow-scrolling: touch;
        }
        
        /* 안전 영역 지원 */
        .safe-area-top {
          padding-top: env(safe-area-inset-top);
        }
        
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }
        
        .safe-area-left {
          padding-left: env(safe-area-inset-left);
        }
        
        .safe-area-right {
          padding-right: env(safe-area-inset-right);
        }
        
        /* 모바일 전용 레이아웃 */
        .mobile-only {
          display: none;
        }
        
        .desktop-only {
          display: block;
        }
        
        @media (max-width: 768px) {
          .mobile-only {
            display: block;
          }
          
          .desktop-only {
            display: none;
          }
        }
        
        /* 키보드가 보일 때 레이아웃 조정 */
        .keyboard-visible {
          padding-bottom: var(--keyboard-height, 300px);
        }
      `;
      
      document.head.appendChild(styleElement);
    }
    
    return () => {
      const styleElement = document.getElementById(styleId);
      if (styleElement) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);
  
  // 모바일 최적화 적용
  useEffect(() => {
    mobileOptimization.applyTouchOptimization();
    mobileOptimization.optimizeMobileLayout();
  }, [mobileOptimization]);
  
  return children;
}

export default useMobileOptimization;
     