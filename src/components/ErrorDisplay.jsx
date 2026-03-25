import { useState } from 'react';
import { ErrorCodes, getUserFriendlyMessage } from '../utils/errorHandler';

/**
 * 통합 에러 디스플레이 컴포넌트
 * 모든 컴포넌트에서 일관된 에러 UI를 제공합니다.
 */

const ErrorDisplay = ({ 
  error, 
  onRetry = null, 
  onClose = null,
  className = '',
  showDetails = false,
  compact = false
}) => {
  const [localShowDetails, setLocalShowDetails] = useState(showDetails);
  
  if (!error) return null;
  
  // 에러 코드와 메시지 추출
  const errorCode = error?.code || ErrorCodes.UNKNOWN;
  const userMessage = getUserFriendlyMessage(errorCode);
  const errorMessage = error?.message || userMessage;
  const isUserError = errorCode === ErrorCodes.VALIDATION;
  const isNetworkError = errorCode === ErrorCodes.NETWORK;
  const isPdfError = errorCode === ErrorCodes.PDF;
  const isAiError = errorCode === ErrorCodes.AI;
  const isPaymentError = errorCode === ErrorCodes.PAYMENT;
  
  // 에러 타입에 따른 스타일 결정
  let containerStyle = '';
  let icon = '❌';
  let title = '오류 발생';
  
  if (isUserError) {
    containerStyle = 'border-amber-500/30 bg-amber-950/20';
    icon = '⚠️';
    title = '입력 확인 필요';
  } else if (isNetworkError) {
    containerStyle = 'border-blue-500/30 bg-blue-950/20';
    icon = '📡';
    title = '네트워크 오류';
  } else if (isPdfError) {
    containerStyle = 'border-purple-500/30 bg-purple-950/20';
    icon = '📄';
    title = '파일 처리 오류';
  } else if (isAiError) {
    containerStyle = 'border-emerald-500/30 bg-emerald-950/20';
    icon = '🤖';
    title = 'AI 서비스 오류';
  } else if (isPaymentError) {
    containerStyle = 'border-rose-500/30 bg-rose-950/20';
    icon = '💳';
    title = '결제 오류';
  } else {
    containerStyle = 'border-rose-500/30 bg-rose-950/20';
    icon = '❌';
    title = '오류 발생';
  }
  
  // 컴팩트 모드
  if (compact) {
    return (
      <div className={`rounded-lg border ${containerStyle} p-3 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <p className="flex-1 text-sm font-medium text-slate-100">{userMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-slate-100 hover:bg-white/20"
            >
              재시도
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // 전체 모드
  return (
    <div className={`rounded-xl border ${containerStyle} p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-slate-200">{userMessage}</p>
              
              {/* 추가 에러 메시지가 있는 경우 */}
              {errorMessage && errorMessage !== userMessage && (
                <p className="mt-2 text-sm text-slate-300">{errorMessage}</p>
              )}
              
              {/* 에러 상세 정보가 있는 경우 */}
              {error?.details?.originalError?.message && (
                <p className="mt-1 text-xs text-slate-400">
                  상세: {error.details.originalError.message}
                </p>
              )}
            </div>
          </div>
          
          {/* 액션 버튼들 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/20 hover:shadow-md"
              >
                다시 시도
              </button>
            )}
            
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
              >
                닫기
              </button>
            )}
            
            {/* 개발 환경에서 상세 정보 토글 */}
            {import.meta.env.DEV && error?.stack && (
              <button
                type="button"
                onClick={() => setLocalShowDetails(!localShowDetails)}
                className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm text-slate-400 transition hover:bg-white/5"
              >
                {localShowDetails ? '상세 정보 숨기기' : '상세 정보 보기'}
              </button>
            )}
          </div>
        </div>
        
        {/* 닫기 버튼 (오른쪽 상단) */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* 상세 정보 (개발 환경에서만) */}
      {localShowDetails && error?.stack && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400">에러 상세 정보</p>
            <button
              type="button"
              onClick={() => setLocalShowDetails(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              숨기기
            </button>
          </div>
          
          <div className="space-y-2">
            {error.code && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">코드:</span>
                <code className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                  {error.code}
                </code>
              </div>
            )}
            
            {error.timestamp && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">시간:</span>
                <span className="text-xs text-slate-400">{error.timestamp}</span>
              </div>
            )}
            
            {error.details?.component && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">컴포넌트:</span>
                <span className="text-xs text-slate-400">{error.details.component}</span>
              </div>
            )}
            
            {/* 스택 트레이스 */}
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">스택 트레이스:</p>
              <pre className="max-h-60 overflow-auto rounded bg-black/60 p-2 text-xs text-slate-300">
                {error.stack}
              </pre>
            </div>
            
            {/* 추가 디테일 */}
            {error.details && Object.keys(error.details).length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">추가 정보:</p>
                <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-xs text-slate-300">
                  {JSON.stringify(error.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 네트워크 오류인 경우 추가 도움말 */}
      {isNetworkError && (
        <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-950/10 p-3">
          <p className="text-sm font-medium text-blue-200">네트워크 문제 해결 방법:</p>
          <ul className="mt-1 space-y-1 text-xs text-blue-300">
            <li>• 인터넷 연결 상태를 확인해주세요</li>
            <li>• Wi-Fi 또는 모바일 데이터를 재연결해보세요</li>
            <li>• 방화벽이나 VPN 설정을 확인해주세요</li>
            <li>• 브라우저를 새로고침해보세요</li>
          </ul>
        </div>
      )}
      
      {/* PDF 오류인 경우 추가 도움말 */}
      {isPdfError && (
        <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-950/10 p-3">
          <p className="text-sm font-medium text-purple-200">PDF 파일 문제 해결 방법:</p>
          <ul className="mt-1 space-y-1 text-xs text-purple-300">
            <li>• PDF 파일이 손상되지 않았는지 확인해주세요</li>
            <li>• 다른 PDF 파일로 시도해보세요</li>
            <li>• 파일 크기가 너무 크지 않은지 확인해주세요 (권장: 50MB 이하)</li>
            <li>• 암호로 보호된 PDF는 지원되지 않습니다</li>
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * 로딩 상태 컴포넌트
 */
export const LoadingState = ({ message = '로딩 중...', className = '' }) => (
  <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
    <div className="relative">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-transparent"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-transparent"></div>
      </div>
    </div>
    <p className="mt-4 text-sm text-slate-300">{message}</p>
  </div>
);

/**
 * 빈 상태 컴포넌트
 */
export const EmptyState = ({ 
  message = '데이터가 없습니다.', 
  icon = '📭',
  action = null,
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
    <span className="text-4xl">{icon}</span>
    <p className="mt-3 text-slate-300">{message}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/**
 * 성공 상태 컴포넌트
 */
export const SuccessState = ({ 
  message = '작업이 완료되었습니다!', 
  icon = '✅',
  className = ''
}) => (
  <div className={`rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 ${className}`}>
    <div className="flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <p className="font-medium text-emerald-100">{message}</p>
    </div>
  </div>
);

/**
 * 경고 상태 컴포넌트
 */
export const WarningState = ({ 
  message = '주의가 필요합니다.', 
  icon = '⚠️',
  className = ''
}) => (
  <div className={`rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 ${className}`}>
    <div className="flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <p className="font-medium text-amber-100">{message}</p>
    </div>
  </div>
);

/**
 * 정보 상태 컴포넌트
 */
export const InfoState = ({ 
  message = '정보를 확인해주세요.', 
  icon = 'ℹ️',
  className = ''
}) => (
  <div className={`rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 ${className}`}>
    <div className="flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <p className="font-medium text-blue-100">{message}</p>
    </div>
  </div>
);

export default ErrorDisplay;
