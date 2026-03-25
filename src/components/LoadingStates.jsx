/**
 * 로딩 상태 개선 컴포넌트
 * 스켈레톤 UI, 점진적 로딩, 낙관적 업데이트
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// 로딩 상태 타입
export const LoadingState = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  PARTIAL: 'partial',
};

// 로딩 애니메이션 타입
export const LoadingAnimation = {
  SPINNER: 'spinner',
  SKELETON: 'skeleton',
  PROGRESS: 'progress',
  PULSE: 'pulse',
  FADE: 'fade',
};

// 로딩 상태 관리 훅
export function useLoadingState(initialState = LoadingState.IDLE) {
  const [state, setState] = useState(initialState);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const timeoutRef = useRef(null);
  const startTimeRef = useRef(null);
  
  // 로딩 시작
  const startLoading = useCallback((initialMessage = '로딩 중...') => {
    setState(LoadingState.LOADING);
    setProgress(0);
    setMessage(initialMessage);
    setError(null);
    startTimeRef.current = Date.now();
    
    // 자동 진행률 업데이트 (백업)
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
    
    timeoutRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(timeoutRef.current);
          return prev;
        }
        return prev + 5;
      });
    }, 500);
  }, []);
  
  // 진행률 업데이트
  const updateProgress = useCallback((newProgress, newMessage = '') => {
    setProgress(Math.min(100, Math.max(0, newProgress)));
    if (newMessage) {
      setMessage(newMessage);
    }
  }, []);
  
  // 로딩 성공
  const completeLoading = useCallback((successMessage = '완료되었습니다.') => {
    setState(LoadingState.SUCCESS);
    setProgress(100);
    setMessage(successMessage);
    
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // 성공 메시지 자동 숨김
    setTimeout(() => {
      setState(LoadingState.IDLE);
      setMessage('');
    }, 2000);
  }, []);
  
  // 로딩 실패
  const failLoading = useCallback((errorMessage, errorDetails = null) => {
    setState(LoadingState.ERROR);
    setError({
      message: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString(),
    });
    setMessage(errorMessage);
    
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setRetryCount(prev => prev + 1);
  }, []);
  
  // 부분 로딩
  const partialLoading = useCallback((partialMessage, partialProgress) => {
    setState(LoadingState.PARTIAL);
    setMessage(partialMessage);
    if (partialProgress !== undefined) {
      setProgress(partialProgress);
    }
  }, []);
  
  // 재시도
  const retryLoading = useCallback(() => {
    setError(null);
    setRetryCount(0);
    startLoading('재시도 중...');
  }, [startLoading]);
  
  // 로딩 시간 계산
  const getLoadingTime = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return Date.now() - startTimeRef.current;
  }, []);
  
  // 정리
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  
  // 효과
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  return {
    // 상태
    state,
    progress,
    message,
    error,
    retryCount,
    
    // 함수
    startLoading,
    updateProgress,
    completeLoading,
    failLoading,
    partialLoading,
    retryLoading,
    getLoadingTime,
    cleanup,
    
    // 유틸리티
    isLoading: state === LoadingState.LOADING,
    isSuccess: state === LoadingState.SUCCESS,
    isError: state === LoadingState.ERROR,
    isIdle: state === LoadingState.IDLE,
    isPartial: state === LoadingState.PARTIAL,
    
    // 메타데이터
    metadata: {
      startTime: startTimeRef.current,
      loadingTime: getLoadingTime(),
    },
  };
}

// 스켈레톤 로딩 컴포넌트
export function SkeletonLoader({
  type = 'text',
  width = '100%',
  height = '1em',
  count = 1,
  animation = LoadingAnimation.PULSE,
  borderRadius = '4px',
  className = '',
  style = {},
}) {
  const skeletons = Array.from({ length: count }, (_, i) => {
    const skeletonStyle = {
      width: typeof width === 'string' ? width : `${width}px`,
      height: typeof height === 'string' ? height : `${height}px`,
      borderRadius,
      ...style,
    };
    
    let animationClass = '';
    switch (animation) {
      case LoadingAnimation.PULSE:
        animationClass = 'skeleton-pulse';
        break;
      case LoadingAnimation.FADE:
        animationClass = 'skeleton-fade';
        break;
      default:
        animationClass = 'skeleton-pulse';
    }
    
    return (
      <div
        key={i}
        className={`skeleton-loader ${type} ${animationClass} ${className}`}
        style={skeletonStyle}
        aria-hidden="true"
      >
        <span className="sr-only">로딩 중...</span>
      </div>
    );
  });
  
  return <>{skeletons}</>;
}

// 스켈레톤 그리드 컴포넌트
export function SkeletonGrid({
  rows = 3,
  columns = 1,
  gap = '16px',
  itemHeight = '100px',
  itemWidth = '100%',
  className = '',
}) {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap,
  };
  
  const items = Array.from({ length: rows * columns }, (_, i) => (
    <SkeletonLoader
      key={i}
      type="card"
      width={itemWidth}
      height={itemHeight}
      borderRadius="8px"
    />
  ));
  
  return (
    <div className={`skeleton-grid ${className}`} style={gridStyle}>
      {items}
    </div>
  );
}

// 진행률 표시기 컴포넌트
export function ProgressLoader({
  progress,
  message = '',
  showPercentage = true,
  indeterminate = false,
  size = 'medium',
  color = 'primary',
  className = '',
}) {
  const sizeClass = `progress-${size}`;
  const colorClass = `progress-${color}`;
  
  const progressStyle = {
    width: indeterminate ? '100%' : `${progress}%`,
  };
  
  return (
    <div className={`progress-loader ${sizeClass} ${colorClass} ${className}`}>
      {message && <div className="progress-message">{message}</div>}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={progressStyle}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : progress}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={message || '로딩 진행률'}
        >
          {indeterminate && <div className="progress-indeterminate" />}
        </div>
      </div>
      {showPercentage && !indeterminate && (
        <div className="progress-percentage">{Math.round(progress)}%</div>
      )}
    </div>
  );
}

// 스피너 컴포넌트
export function Spinner({
  size = 'medium',
  color = 'primary',
  thickness = '2px',
  speed = '1s',
  message = '',
  className = '',
}) {
  const sizeMap = {
    small: '16px',
    medium: '32px',
    large: '48px',
    xlarge: '64px',
  };
  
  const spinnerStyle = {
    width: sizeMap[size] || sizeMap.medium,
    height: sizeMap[size] || sizeMap.medium,
    borderWidth: thickness,
    animationDuration: speed,
  };
  
  return (
    <div className={`spinner-container ${className}`}>
      <div
        className={`spinner spinner-${color}`}
        style={spinnerStyle}
        role="status"
        aria-label={message || '로딩 중'}
      >
        <span className="sr-only">{message || '로딩 중'}</span>
      </div>
      {message && <div className="spinner-message">{message}</div>}
    </div>
  );
}

// 점진적 로딩 컴포넌트
export function ProgressiveLoader({
  children,
  fallback = <SkeletonLoader count={3} />,
  delay = 0,
  minDuration = 300,
  onLoadStart,
  onLoadComplete,
  className = '',
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [showFallback, setShowFallback] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  
  const startTimeRef = useRef(null);
  const timeoutRef = useRef(null);
  
  useEffect(() => {
    startTimeRef.current = Date.now();
    
    if (onLoadStart) {
      onLoadStart();
    }
    
    // 최소 지연 시간 설정
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      
      const loadTime = Date.now() - startTimeRef.current;
      const remainingTime = Math.max(0, minDuration - loadTime);
      
      // 최소 표시 시간 보장
      setTimeout(() => {
        setShowFallback(false);
        setHasLoaded(true);
        
        if (onLoadComplete) {
          onLoadComplete();
        }
      }, remainingTime);
    }, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [delay, minDuration, onLoadStart, onLoadComplete]);
  
  if (showFallback) {
    return (
      <div className={`progressive-loader ${className}`}>
        {fallback}
        {isLoading && (
          <div className="progressive-loader-overlay">
            <Spinner size="small" />
          </div>
        )}
      </div>
    );
  }
  
  return hasLoaded ? children : null;
}

// 낙관적 업데이트 컴포넌트
export function OptimisticUpdate({
  children,
  action,
  onSuccess,
  onError,
  optimisticData,
  rollbackOnError = true,
  className = '',
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [optimisticState, setOptimisticState] = useState(null);
  const [originalState, setOriginalState] = useState(null);
  const [error, setError] = useState(null);
  
  const executeAction = useCallback(async () => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    setError(null);
    
    // 원본 상태 저장
    if (rollbackOnError) {
      setOriginalState(children);
    }
    
    // 낙관적 업데이트 적용
    if (optimisticData) {
      setOptimisticState(optimisticData);
    }
    
    try {
      const result = await action();
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      // 성공 시 낙관적 상태 제거
      setOptimisticState(null);
      setIsUpdating(false);
      
    } catch (err) {
      setError(err);
      
      if (onError) {
        onError(err);
      }
      
      // 실패 시 롤백
      if (rollbackOnError) {
        setOptimisticState(null);
      }
      
      setIsUpdating(false);
    }
  }, [action, children, isUpdating, onError, onSuccess, optimisticData, rollbackOnError]);
  
  const rollback = useCallback(() => {
    setOptimisticState(null);
    setError(null);
    setIsUpdating(false);
  }, []);
  
  return (
    <div className={`optimistic-update ${className} ${isUpdating ? 'updating' : ''}`}>
      {optimisticState || children}
      
      {isUpdating && (
        <div className="optimistic-overlay">
          <Spinner size="small" message="업데이트 중..." />
        </div>
      )}
      
      {error && (
        <div className="optimistic-error">
          <div className="error-message">{error.message}</div>
          <button onClick={rollback} className="rollback-button">
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}

// 로딩 상태 컨테이너 컴포넌트
export function LoadingContainer({
  children,
  loadingState,
  skeleton = true,
  errorComponent,
  emptyComponent,
  className = '',
}) {
  const { state, error, message } = loadingState;
  
  if (state === LoadingState.LOADING) {
    return (
      <div className={`loading-container loading ${className}`}>
        {skeleton ? (
          <SkeletonGrid rows={3} columns={1} />
        ) : (
          <Spinner message={message} />
        )}
      </div>
    );
  }
  
  if (state === LoadingState.ERROR) {
    return (
      <div className={`loading-container error ${className}`}>
        {errorComponent || (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <div className="error-message">{error?.message || '오류가 발생했습니다.'}</div>
            <button
              onClick={loadingState.retryLoading}
              className="retry-button"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    );
  }
  
  if (state === LoadingState.IDLE && React.Children.count(children) === 0) {
    return (
      <div className={`loading-container empty ${className}`}>
        {emptyComponent || (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <div className="empty-message">데이터가 없습니다.</div>
          </div>
        )}
      </div>
    );
  }
  
  return <div className={`loading-container ${className}`}>{children}</div>;
}

// 로딩 상태 CSS 스타일
export const loadingStyles = `
  /* 스켈레톤 로딩 스타일 */
  .skeleton-loader {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    display: inline-block;
    position: relative;
    overflow: hidden;
  }
  
  .skeleton-pulse {
    animation: skeleton-pulse 1.5s infinite;
  }
  
  .skeleton-fade {
    animation: skeleton-fade 2s infinite;
  }
  
  @keyframes skeleton-pulse {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
  
  @keyframes skeleton-fade {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  
  /* 스켈레톤 그리드 */
  .skeleton-grid {
    width: 100%;
  }
  
  /* 진행률 표시기 */
  .progress-loader {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }
  
  .progress-bar {
    width: 100%;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0066cc, #0099ff);
    border-radius: 4px;
    transition: width 0.3s ease;
    position: relative;
  }
  
  .progress-indeterminate {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    animation: progress-indeterminate 1.5s infinite;
  }
  
  @keyframes progress-indeterminate {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  
  .progress-message {
    margin-bottom: 8px;
    font-size: 14px;
    color: #666;
    text-align: center;
  }
  
  .progress-percentage {
    margin-top: 8px;
    font-size: 12px;
    color: #999;
    text-align: center;
  }
  
  /* 스피너 스타일 */
  .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  
  .spinner {
    border: 2px solid #f3f3f3;
    border-top: 2px solid #0066cc;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .spinner-primary {
    border-top-color: #0066cc;
  }
  
  .spinner-secondary {
    border-top-color: #666;
  }
  
  .spinner-success {
    border-top-color: #28a745;
  }
  
  .spinner-danger {
    border-top-color: #dc3545;
  }
  
  .spinner-warning {
    border-top-color: #ffc107;
  }
  
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
  
  .spinner-message {
    font-size: 14px;
    color: #666;
    text-align: center;
  }
  
  /* 점진적 로딩 */
  .progressive-loader {
    position: relative;
    min-height: 200px;
  }
  
  .progressive-loader-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  
  /* 낙관적 업데이트 */
  .optimistic-update {
    position: relative;
  }
  
  .optimistic-update.updating {
    opacity: 0.7;
  }
  
  .optimistic-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  
  .optimistic-error {
    margin-top: 12px;
    padding: 12px;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .optimistic-error .error-message {
    color: #c00;
    font-size: 14px;
  }
  
  .optimistic-error .rollback-button {
    padding: 4px 12px;
    background: #c00;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  
  /* 로딩 컨테이너 */
  .loading-container {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .loading-container.loading {
    flex-direction: column;
    gap: 20px;
  }
  
  .loading-container.error {
    flex-direction: column;
    gap: 20px;
    text-align: center;
  }
  
  .loading-container.empty {
    flex-direction: column;
    gap: 20px;
    text-align: center;
  }
  
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  
  .error-icon {
    font-size: 48px;
  }
  
  .error-message {
    font-size: 16px;
    color: #c00;
    max-width: 400px;
  }
  
  .retry-button {
    padding: 8px 24px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .retry-button:hover {
    background: #0052a3;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  
  .empty-icon {
    font-size: 48px;
    opacity: 0.5;
  }
  
  .empty-message {
    font-size: 16px;
    color: #666;
  }
  
  /* 접근성 */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  
  /* 모션 감소 지원 */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-pulse,
    .skeleton-fade,
    .progress-indeterminate,
    .spinner {
      animation: none;
    }
    
    .skeleton-loader {
      background: #f0f0f0;
    }
    
    .progress-fill {
      transition: none;
    }
  }
`;

// 로딩 스타일을 문서에 추가하는 훅
export function useLoadingStyles() {
  useEffect(() => {
    const styleId = 'loading-styles';
    
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = loadingStyles;
      document.head.appendChild(styleElement);
    }
    
    return () => {
      const styleElement = document.getElementById(styleId);
      if (styleElement) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);
}

// 로딩 상태 제공자 컴포넌트
export function LoadingProvider({ children }) {
  useLoadingStyles();
  
  return children;
}

export default LoadingProvider;
