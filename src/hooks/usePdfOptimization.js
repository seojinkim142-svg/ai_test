/**
 * PDF 처리 최적화 훅
 * 대용량 PDF의 경우 서버 사이드 프리뷰 생성 및 메모리 관리 최적화
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// PDF 최적화 설정
const PDF_OPTIMIZATION_CONFIG = {
  // 서버 사이드 프리뷰 생성 임계값 (MB)
  SERVER_SIDE_THRESHOLD: 10, // 10MB 이상이면 서버 사이드 처리 고려
  // 메모리 사용량 모니터링 간격 (ms)
  MEMORY_MONITOR_INTERVAL: 30000,
  // 캐시된 페이지 수
  CACHED_PAGES: 3,
  // 낮은 메모리 기기 감지
  LOW_MEMORY_THRESHOLD: 1024, // 1GB 미만
};

// 서버 사이드 프리뷰 생성 함수 (가상)
async function generateServerSidePreview(pdfFile, options = {}) {
  const { quality = 'medium', pages = 'all' } = options;
  
  // 실제 구현에서는 서버 API 호출
  // 여기서는 가상 구현
  return {
    success: true,
    previewUrl: null, // 서버에서 생성된 프리뷰 URL
    thumbnailUrl: null, // 썸네일 URL
    pageCount: 0,
    estimatedSize: 'optimized',
  };
}

// 메모리 사용량 체크 (브라우저 지원 시)
function getMemoryInfo() {
  if (window.performance && window.performance.memory) {
    return {
      usedJSHeapSize: window.performance.memory.usedJSHeapSize,
      totalJSHeapSize: window.performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
    };
  }
  
  // 기본값 반환
  return {
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    available: false,
  };
}

// 기기 성능 평가
function assessDevicePerformance() {
  const memoryInfo = getMemoryInfo();
  const isLowMemoryDevice = memoryInfo.totalJSHeapSize < PDF_OPTIMIZATION_CONFIG.LOW_MEMORY_THRESHOLD * 1024 * 1024;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSlowNetwork = navigator.connection 
    ? navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g'
    : false;
  
  return {
    isLowMemoryDevice,
    isMobile,
    isSlowNetwork,
    memoryInfo,
    shouldOptimize: isLowMemoryDevice || isMobile || isSlowNetwork,
  };
}

/**
 * PDF 처리 최적화 훅
 * @param {Object} options - 최적화 옵션
 * @returns {Object} 최적화 상태 및 함수
 */
export function usePdfOptimization(options = {}) {
  const {
    file = null,
    pdfUrl = null,
    enableServerSide = true,
    enableCaching = true,
    enableMemoryMonitoring = true,
  } = options;
  
  const [optimizationState, setOptimizationState] = useState({
    isOptimizing: false,
    optimizationLevel: 'none', // 'none', 'light', 'medium', 'heavy'
    serverSidePreview: null,
    cachedPages: new Map(),
    memoryUsage: { used: 0, total: 0, percentage: 0 },
    devicePerformance: assessDevicePerformance(),
    errors: [],
  });
  
  const memoryMonitorRef = useRef(null);
  const cachedPagesRef = useRef(new Map());
  const abortControllerRef = useRef(null);
  
  // 파일 크기 체크
  const checkFileSize = useCallback(() => {
    if (!file) return 0;
    
    const sizeInMB = file.size / (1024 * 1024);
    return sizeInMB;
  }, [file]);
  
  // 최적화 레벨 결정
  const determineOptimizationLevel = useCallback(() => {
    const fileSizeMB = checkFileSize();
    const devicePerf = optimizationState.devicePerformance;
    
    if (fileSizeMB > PDF_OPTIMIZATION_CONFIG.SERVER_SIDE_THRESHOLD && enableServerSide) {
      return 'heavy'; // 서버 사이드 처리 필요
    }
    
    if (devicePerf.shouldOptimize) {
      if (devicePerf.isLowMemoryDevice || devicePerf.isSlowNetwork) {
        return 'medium';
      }
      return 'light';
    }
    
    return 'none';
  }, [checkFileSize, optimizationState.devicePerformance, enableServerSide]);
  
  // 서버 사이드 프리뷰 생성
  const generateServerPreview = useCallback(async () => {
    if (!file || !enableServerSide) return null;
    
    const fileSizeMB = checkFileSize();
    if (fileSizeMB < PDF_OPTIMIZATION_CONFIG.SERVER_SIDE_THRESHOLD) {
      return null;
    }
    
    setOptimizationState(prev => ({ ...prev, isOptimizing: true }));
    
    try {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      const preview = await generateServerSidePreview(file, {
        quality: optimizationState.devicePerformance.isSlowNetwork ? 'low' : 'medium',
        pages: 'first-5', // 처음 5페이지만
        signal,
      });
      
      if (!signal.aborted) {
        setOptimizationState(prev => ({
          ...prev,
          serverSidePreview: preview,
          optimizationLevel: 'heavy',
          isOptimizing: false,
        }));
        
        return preview;
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setOptimizationState(prev => ({
          ...prev,
          errors: [...prev.errors, { type: 'server_preview', error: error.message }],
          isOptimizing: false,
        }));
      }
    }
    
    return null;
  }, [file, enableServerSide, checkFileSize, optimizationState.devicePerformance]);
  
  // 페이지 캐싱 관리
  const managePageCache = useCallback((pageNumber, pageData) => {
    if (!enableCaching) return;
    
    const cache = cachedPagesRef.current;
    
    // 캐시 크기 제한
    if (cache.size >= PDF_OPTIMIZATION_CONFIG.CACHED_PAGES) {
      // LRU (Least Recently Used) 방식으로 오래된 항목 제거
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    // 페이지 캐싱
    cache.set(pageNumber, {
      data: pageData,
      timestamp: Date.now(),
      accessCount: 1,
    });
    
    setOptimizationState(prev => ({
      ...prev,
      cachedPages: new Map(cache),
    }));
  }, [enableCaching]);
  
  // 캐시된 페이지 가져오기
  const getCachedPage = useCallback((pageNumber) => {
    if (!enableCaching) return null;
    
    const cache = cachedPagesRef.current;
    const cached = cache.get(pageNumber);
    
    if (cached) {
      // 접근 횟수 증가 및 타임스탬프 업데이트
      cached.accessCount++;
      cached.timestamp = Date.now();
      cache.set(pageNumber, cached);
      
      return cached.data;
    }
    
    return null;
  }, [enableCaching]);
  
  // 메모리 사용량 모니터링
  const startMemoryMonitoring = useCallback(() => {
    if (!enableMemoryMonitoring || memoryMonitorRef.current) return;
    
    memoryMonitorRef.current = setInterval(() => {
      const memoryInfo = getMemoryInfo();
      
      if (memoryInfo.available) {
        const percentage = (memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100;
        
        setOptimizationState(prev => ({
          ...prev,
          memoryUsage: {
            used: Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024)), // MB
            total: Math.round(memoryInfo.totalJSHeapSize / (1024 * 1024)), // MB
            percentage: Math.round(percentage),
          },
        }));
        
        // 메모리 사용량이 80% 이상이면 캐시 정리
        if (percentage > 80) {
          cachedPagesRef.current.clear();
          setOptimizationState(prev => ({
            ...prev,
            cachedPages: new Map(),
          }));
          
          // 가비지 컬렉션 강제 실행 (브라우저 지원 시)
          if (window.gc) {
            window.gc();
          }
        }
      }
    }, PDF_OPTIMIZATION_CONFIG.MEMORY_MONITOR_INTERVAL);
  }, [enableMemoryMonitoring]);
  
  // 최적화 초기화
  const initializeOptimization = useCallback(async () => {
    const optimizationLevel = determineOptimizationLevel();
    
    setOptimizationState(prev => ({
      ...prev,
      optimizationLevel,
      isOptimizing: optimizationLevel === 'heavy',
    }));
    
    // 서버 사이드 프리뷰 생성 필요 시
    if (optimizationLevel === 'heavy' && enableServerSide) {
      await generateServerPreview();
    }
    
    // 메모리 모니터링 시작
    if (enableMemoryMonitoring) {
      startMemoryMonitoring();
    }
  }, [determineOptimizationLevel, enableServerSide, generateServerPreview, enableMemoryMonitoring, startMemoryMonitoring]);
  
  // 정리 함수
  const cleanup = useCallback(() => {
    if (memoryMonitorRef.current) {
      clearInterval(memoryMonitorRef.current);
      memoryMonitorRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    cachedPagesRef.current.clear();
  }, []);
  
  // 효과
  useEffect(() => {
    if (file || pdfUrl) {
      initializeOptimization();
    }
    
    return cleanup;
  }, [file, pdfUrl, initializeOptimization, cleanup]);
  
  // 네이티브 플랫폼 최적화
  const isNativePlatform = Capacitor.isNativePlatform();
  const nativeOptimizations = isNativePlatform ? {
    useNativePdfRenderer: true,
    disableComplexGraphics: optimizationState.devicePerformance.isLowMemoryDevice,
    preloadNextPage: true,
  } : null;
  
  return {
    // 상태
    ...optimizationState,
    
    // 함수
    initializeOptimization,
    generateServerPreview,
    managePageCache,
    getCachedPage,
    cleanup,
    
    // 최적화 설정
    config: {
      ...PDF_OPTIMIZATION_CONFIG,
      isNativePlatform,
      nativeOptimizations,
    },
    
    // 최적화 권장사항
    recommendations: {
      useLowQualityPreview: optimizationState.devicePerformance.isSlowNetwork,
      limitConcurrentOperations: optimizationState.devicePerformance.isLowMemoryDevice,
      enableProgressiveLoading: true,
      useWebWorkers: !optimizationState.devicePerformance.isLowMemoryDevice,
    },
    
    // 성능 메트릭
    performanceMetrics: {
      fileSizeMB: checkFileSize(),
      shouldUseServerSide: checkFileSize() > PDF_OPTIMIZATION_CONFIG.SERVER_SIDE_THRESHOLD,
      estimatedLoadTime: optimizationState.devicePerformance.isSlowNetwork ? 'slow' : 'normal',
    },
  };
}

/**
 * 간단한 PDF 최적화 훅 (기본 사용)
 */
export function useSimplePdfOptimization(file) {
  const [optimized, setOptimized] = useState(false);
  const [recommendation, setRecommendation] = useState('none');
  
  useEffect(() => {
    if (!file) return;
    
    const fileSizeMB = file.size / (1024 * 1024);
    const devicePerf = assessDevicePerformance();
    
    let rec = 'none';
    
    if (fileSizeMB > 20 || devicePerf.isLowMemoryDevice) {
      rec = 'server-side';
    } else if (fileSizeMB > 10 || devicePerf.isMobile) {
      rec = 'optimized-client';
    } else if (devicePerf.isSlowNetwork) {
      rec = 'low-quality';
    }
    
    setRecommendation(rec);
    setOptimized(true);
  }, [file]);
  
  return {
    optimized,
    recommendation,
    shouldOptimize: recommendation !== 'none',
  };
}

export default usePdfOptimization;