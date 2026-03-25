/**
 * 통합 에러 핸들링 유틸리티
 * 모든 컴포넌트에서 일관된 에러 처리를 제공합니다.
 */

export class AppError extends Error {
  constructor(message, code = 'UNKNOWN', details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export const ErrorCodes = {
  NETWORK: 'NETWORK_ERROR',
  PDF: 'PDF_PROCESSING_ERROR',
  AI: 'AI_SERVICE_ERROR',
  PAYMENT: 'PAYMENT_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
};

// 에러 메시지 매핑 (사용자 친화적인 메시지)
const ErrorMessages = {
  [ErrorCodes.NETWORK]: '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.',
  [ErrorCodes.PDF]: 'PDF 파일 처리 중 오류가 발생했습니다. 파일을 다시 업로드해주세요.',
  [ErrorCodes.AI]: 'AI 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.',
  [ErrorCodes.PAYMENT]: '결제 처리 중 오류가 발생했습니다. 결제 정보를 확인해주세요.',
  [ErrorCodes.VALIDATION]: '입력값을 확인해주세요.',
  [ErrorCodes.UNKNOWN]: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
};

/**
 * 에러를 처리하고 표준화된 형식으로 반환합니다.
 * @param {Error} error - 원본 에러 객체
 * @param {Object} context - 추가 컨텍스트 정보
 * @returns {AppError} 처리된 에러 객체
 */
export function handleError(error, context = {}) {
  // 이미 AppError인 경우 그대로 반환
  if (error instanceof AppError) {
    // 컨텍스트 정보 추가
    if (Object.keys(context).length > 0) {
      error.details = { ...error.details, ...context };
    }
    return error;
  }

  // 에러 코드 추론
  let errorCode = ErrorCodes.UNKNOWN;
  const errorMessage = String(error?.message || '').toLowerCase();
  
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('http')) {
    errorCode = ErrorCodes.NETWORK;
  } else if (errorMessage.includes('pdf') || errorMessage.includes('document')) {
    errorCode = ErrorCodes.PDF;
  } else if (errorMessage.includes('openai') || errorMessage.includes('deepseek') || errorMessage.includes('ai')) {
    errorCode = ErrorCodes.AI;
  } else if (errorMessage.includes('payment') || errorMessage.includes('kakaopay') || errorMessage.includes('nicepay')) {
    errorCode = ErrorCodes.PAYMENT;
  }

  // AppError 생성
  const errorObj = new AppError(
    error?.message || ErrorMessages[errorCode],
    errorCode,
    { originalError: error, ...context }
  );

  // 개발 환경에서 콘솔 로깅
  if (import.meta.env.DEV) {
    console.group(`[Error] ${errorObj.code}`);
    console.error('Message:', errorObj.message);
    console.error('Context:', context);
    console.error('Stack:', errorObj.stack);
    console.groupEnd();
  }

  // 프로덕션 환경에서는 에러 모니터링 서비스로 전송
  if (import.meta.env.PROD) {
    // Sentry나 LogRocket 통합 가능
    // window.Sentry?.captureException(errorObj);
    // window.LogRocket?.captureException(errorObj);
  }

  return errorObj;
}

/**
 * 사용자 친화적인 에러 메시지를 반환합니다.
 * @param {string} errorCode - 에러 코드
 * @returns {string} 사용자 친화적인 메시지
 */
export function getUserFriendlyMessage(errorCode) {
  return ErrorMessages[errorCode] || ErrorMessages[ErrorCodes.UNKNOWN];
}

/**
 * 비동기 함수를 에러 처리 래퍼로 감쌉니다.
 * @param {Function} asyncFn - 비동기 함수
 * @param {Object} options - 옵션
 * @returns {Function} 감싸진 함수
 */
export function withErrorHandling(asyncFn, options = {}) {
  const { componentName = 'Unknown', fallback = null } = options;
  
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      const handledError = handleError(error, { 
        component: componentName,
        function: asyncFn.name || 'anonymous'
      });
      
      if (fallback !== null) {
        return fallback;
      }
      
      throw handledError;
    }
  };
}

/**
 * 동기 함수를 에러 처리 래퍼로 감쌉니다.
 * @param {Function} syncFn - 동기 함수
 * @param {Object} options - 옵션
 * @returns {Function} 감싸진 함수
 */
export function withSyncErrorHandling(syncFn, options = {}) {
  const { componentName = 'Unknown', fallback = null } = options;
  
  return (...args) => {
    try {
      return syncFn(...args);
    } catch (error) {
      const handledError = handleError(error, { 
        component: componentName,
        function: syncFn.name || 'anonymous'
      });
      
      if (fallback !== null) {
        return fallback;
      }
      
      throw handledError;
    }
  };
}

/**
 * React 컴포넌트용 에러 바운더리 유틸리티
 * @param {string} componentName - 컴포넌트 이름
 * @returns {Object} 에러 처리 유틸리티 객체
 */
export function createErrorBoundary(componentName) {
  return {
    /**
     * 비동기 작업을 감싸는 래퍼
     */
    wrap: async (asyncFn, fallback = null) => {
      try {
        return await asyncFn();
      } catch (error) {
        const handledError = handleError(error, { component: componentName });
        
        if (fallback !== null) {
          return fallback;
        }
        
        throw handledError;
      }
    },
    
    /**
     * 동기 작업을 감싸는 래퍼
     */
    wrapSync: (syncFn, fallback = null) => {
      try {
        return syncFn();
      } catch (error) {
        const handledError = handleError(error, { component: componentName });
        
        if (fallback !== null) {
          return fallback;
        }
        
        throw handledError;
      }
    },
    
    /**
     * Promise를 감싸는 래퍼
     */
    wrapPromise: (promise, fallback = null) => {
      return promise
        .catch(error => {
          const handledError = handleError(error, { component: componentName });
          
          if (fallback !== null) {
            return Promise.resolve(fallback);
          }
          
          return Promise.reject(handledError);
        });
    }
  };
}

/**
 * 에러 로깅 유틸리티 (개발용)
 */
export const errorLogger = {
  info: (message, data = {}) => {
    if (import.meta.env.DEV) {
      console.log(`[ErrorInfo] ${message}`, data);
    }
  },
  
  warn: (message, data = {}) => {
    if (import.meta.env.DEV) {
      console.warn(`[ErrorWarn] ${message}`, data);
    }
  },
  
  error: (message, error, data = {}) => {
    const handledError = handleError(error, data);
    if (import.meta.env.DEV) {
      console.error(`[ErrorError] ${message}`, handledError);
    }
  }
};

export default {
  AppError,
  ErrorCodes,
  handleError,
  getUserFriendlyMessage,
  withErrorHandling,
  withSyncErrorHandling,
  createErrorBoundary,
  errorLogger
};