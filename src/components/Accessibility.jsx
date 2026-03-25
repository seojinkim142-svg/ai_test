/**
 * 접근성 개선 컴포넌트
 * ARIA 속성, 키보드 네비게이션, 색상 대비 검증 등
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../theme/ThemeContext';

// 접근성 설정 타입
export const AccessibilitySettings = {
  FONT_SIZE: 'fontSize',
  CONTRAST: 'contrast',
  REDUCE_MOTION: 'reduceMotion',
  KEYBOARD_NAVIGATION: 'keyboardNavigation',
  SCREEN_READER: 'screenReader',
  FOCUS_INDICATOR: 'focusIndicator',
};

// 접근성 훅
export function useAccessibility() {
  const [settings, setSettings] = useState(() => {
    // 로컬 스토리지에서 설정 불러오기
    const saved = localStorage.getItem('accessibility_settings');
    return saved ? JSON.parse(saved) : {
      [AccessibilitySettings.FONT_SIZE]: 'medium', // small, medium, large, xlarge
      [AccessibilitySettings.CONTRAST]: 'normal', // normal, high, inverted
      [AccessibilitySettings.REDUCE_MOTION]: false,
      [AccessibilitySettings.KEYBOARD_NAVIGATION]: true,
      [AccessibilitySettings.SCREEN_READER]: false,
      [AccessibilitySettings.FOCUS_INDICATOR]: true,
    };
  });

  const [isKeyboardUser, setIsKeyboardUser] = useState(false);
  const [currentFocus, setCurrentFocus] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  // 설정 저장
  useEffect(() => {
    localStorage.setItem('accessibility_settings', JSON.stringify(settings));
    applySettings(settings);
  }, [settings]);

  // 키보드 사용자 감지
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        setIsKeyboardUser(true);
      }
    };

    const handleMouseDown = () => {
      setIsKeyboardUser(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // 포커스 추적
  useEffect(() => {
    const handleFocus = (e) => {
      setCurrentFocus(e.target);
      
      // 스크린 리더 모드일 경우 포커스된 요소 알림
      if (settings[AccessibilitySettings.SCREEN_READER]) {
        const label = e.target.getAttribute('aria-label') || 
                     e.target.textContent || 
                     e.target.getAttribute('alt') || 
                     e.target.tagName;
        announce(`포커스: ${label}`);
      }
    };

    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [settings]);

  // 설정 적용
  const applySettings = (newSettings) => {
    const root = document.documentElement;
    
    // 폰트 크기
    const fontSizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px',
      xlarge: '20px',
    };
    root.style.setProperty('--font-size-base', fontSizeMap[newSettings.fontSize] || '16px');
    
    // 대비 모드
    if (newSettings.contrast === 'high') {
      root.classList.add('high-contrast');
      root.classList.remove('inverted-contrast');
    } else if (newSettings.contrast === 'inverted') {
      root.classList.add('inverted-contrast');
      root.classList.remove('high-contrast');
    } else {
      root.classList.remove('high-contrast', 'inverted-contrast');
    }
    
    // 모션 감소
    if (newSettings.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    
    // 포커스 인디케이터
    if (newSettings.focusIndicator) {
      root.classList.add('show-focus');
    } else {
      root.classList.remove('show-focus');
    }
  };

  // 스크린 리더 알림
  const announce = (message, priority = 'polite') => {
    const announcement = {
      id: Date.now(),
      message,
      priority,
      timestamp: new Date().toISOString(),
    };
    
    setAnnouncements(prev => [...prev, announcement]);
    
    // 5초 후 알림 제거
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== announcement.id));
    }, 5000);
    
    // 실제 스크린 리더 알림 (aria-live)
    const liveRegion = document.getElementById('a11y-live-region');
    if (liveRegion) {
      liveRegion.textContent = message;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    }
  };

  // 설정 업데이트
  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  // 키보드 트랩 관리
  const createFocusTrap = (element) => {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      
      // Esc 키로 모달 닫기
      if (e.key === 'Escape') {
        const closeButton = element.querySelector('[data-close-modal]');
        if (closeButton) {
          closeButton.click();
        }
      }
    };
    
    element.addEventListener('keydown', handleKeyDown);
    
    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  };

  // 색상 대비 검사
  const checkColorContrast = (foreground, background) => {
    // 간단한 대비 비율 계산 (WCAG 2.1 기준)
    const luminance = (color) => {
      const rgb = color.match(/\d+/g);
      if (!rgb) return 0;
      
      const [r, g, b] = rgb.map(c => {
        c = parseInt(c) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    
    const lum1 = luminance(foreground);
    const lum2 = luminance(background);
    
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    
    return (brightest + 0.05) / (darkest + 0.05);
  };

  return {
    settings,
    isKeyboardUser,
    currentFocus,
    announcements,
    updateSetting,
    announce,
    createFocusTrap,
    checkColorContrast,
    applySettings: () => applySettings(settings),
  };
}

// 접근성 제공자 컴포넌트
export function AccessibilityProvider({ children }) {
  const accessibility = useAccessibility();
  const { theme } = useTheme();

  // 접근성 설정에 따른 테마 적용
  useEffect(() => {
    const root = document.documentElement;
    
    // 대비 모드와 테마 결합
    if (accessibility.settings.contrast === 'high') {
      root.setAttribute('data-theme', 'high-contrast');
    } else if (accessibility.settings.contrast === 'inverted') {
      root.setAttribute('data-theme', 'inverted');
    } else {
      root.setAttribute('data-theme', theme);
    }
    
    // 모션 감소
    if (accessibility.settings.reduceMotion) {
      root.style.setProperty('--animation-duration', '0.01s');
      root.style.setProperty('--transition-duration', '0.01s');
    } else {
      root.style.setProperty('--animation-duration', '0.3s');
      root.style.setProperty('--transition-duration', '0.3s');
    }
  }, [accessibility.settings, theme]);

  return (
    <AccessibilityContext.Provider value={accessibility}>
      {children}
      {/* 스크린 리더용 라이브 영역 */}
      <div
        id="a11y-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      />
      {/* 접근성 알림 영역 */}
      <AccessibilityAnnouncements announcements={accessibility.announcements} />
    </AccessibilityContext.Provider>
  );
}

// 접근성 컨텍스트
const AccessibilityContext = React.createContext(null);

export function useAccessibilityContext() {
  const context = React.useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibilityContext must be used within AccessibilityProvider');
  }
  return context;
}

// 접근성 알림 컴포넌트
function AccessibilityAnnouncements({ announcements }) {
  if (announcements.length === 0) return null;

  return (
    <div className="a11y-announcements" aria-live="polite" aria-atomic="true">
      {announcements.map(announcement => (
        <div key={announcement.id} className="sr-only">
          {announcement.message}
        </div>
      ))}
    </div>
  );
}

// 접근성 패널 컴포넌트
export function AccessibilityPanel() {
  const accessibility = useAccessibilityContext();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // 키보드 트랩 설정
  useEffect(() => {
    if (isOpen && panelRef.current) {
      return accessibility.createFocusTrap(panelRef.current);
    }
  }, [isOpen, accessibility]);

  const togglePanel = () => {
    setIsOpen(!isOpen);
    accessibility.announce(isOpen ? '접근성 설정 패널 닫힘' : '접근성 설정 패널 열림');
  };

  const handleFontSizeChange = (size) => {
    accessibility.updateSetting(AccessibilitySettings.FONT_SIZE, size);
    accessibility.announce(`글자 크기 ${size}로 변경`);
  };

  const handleContrastChange = (contrast) => {
    accessibility.updateSetting(AccessibilitySettings.CONTRAST, contrast);
    accessibility.announce(`대비 모드 ${contrast}로 변경`);
  };

  const handleToggle = (setting, label) => {
    const newValue = !accessibility.settings[setting];
    accessibility.updateSetting(setting, newValue);
    accessibility.announce(`${label} ${newValue ? '켜짐' : '꺼짐'}`);
  };

  return (
    <>
      <button
        className="accessibility-toggle"
        onClick={togglePanel}
        aria-label="접근성 설정"
        aria-expanded={isOpen}
        aria-controls="accessibility-panel"
      >
        <span aria-hidden="true">♿</span>
      </button>

      {isOpen && (
        <div
          id="accessibility-panel"
          ref={panelRef}
          className="accessibility-panel"
          role="dialog"
          aria-labelledby="accessibility-panel-title"
          aria-modal="true"
        >
          <div className="accessibility-panel-header">
            <h2 id="accessibility-panel-title">접근성 설정</h2>
            <button
              onClick={togglePanel}
              aria-label="접근성 설정 패널 닫기"
              data-close-modal
            >
              ✕
            </button>
          </div>

          <div className="accessibility-panel-content">
            {/* 글자 크기 설정 */}
            <div className="accessibility-setting">
              <h3>글자 크기</h3>
              <div className="setting-options">
                {['small', 'medium', 'large', 'xlarge'].map(size => (
                  <button
                    key={size}
                    onClick={() => handleFontSizeChange(size)}
                    className={accessibility.settings.fontSize === size ? 'active' : ''}
                    aria-pressed={accessibility.settings.fontSize === size}
                  >
                    {size === 'small' && '작게'}
                    {size === 'medium' && '보통'}
                    {size === 'large' && '크게'}
                    {size === 'xlarge' && '매우 크게'}
                  </button>
                ))}
              </div>
            </div>

            {/* 대비 설정 */}
            <div className="accessibility-setting">
              <h3>색상 대비</h3>
              <div className="setting-options">
                {['normal', 'high', 'inverted'].map(contrast => (
                  <button
                    key={contrast}
                    onClick={() => handleContrastChange(contrast)}
                    className={accessibility.settings.contrast === contrast ? 'active' : ''}
                    aria-pressed={accessibility.settings.contrast === contrast}
                  >
                    {contrast === 'normal' && '보통'}
                    {contrast === 'high' && '높은 대비'}
                    {contrast === 'inverted' && '반전'}
                  </button>
                ))}
              </div>
            </div>

            {/* 토글 설정 */}
            <div className="accessibility-setting">
              <h3>기타 설정</h3>
              <div className="setting-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.settings.reduceMotion}
                    onChange={() => handleToggle(AccessibilitySettings.REDUCE_MOTION, '모션 감소')}
                  />
                  모션 감소
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.settings.keyboardNavigation}
                    onChange={() => handleToggle(AccessibilitySettings.KEYBOARD_NAVIGATION, '키보드 네비게이션')}
                  />
                  키보드 네비게이션 강조
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.settings.focusIndicator}
                    onChange={() => handleToggle(AccessibilitySettings.FOCUS_INDICATOR, '포커스 표시')}
                  />
                  포커스 표시
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accessibility.settings.screenReader}
                    onChange={() => handleToggle(AccessibilitySettings.SCREEN_READER, '스크린 리더 모드')}
                  />
                  스크린 리더 모드
                </label>
              </div>
            </div>

            {/* 키보드 단축키 안내 */}
            <div className="accessibility-shortcuts">
              <h3>키보드 단축키</h3>
              <ul>
                <li><kbd>Tab</kbd> - 다음 요소로 이동</li>
                <li><kbd>Shift</kbd> + <kbd>Tab</kbd> - 이전 요소로 이동</li>
                <li><kbd>Enter</kbd> - 선택/확인</li>
                <li><kbd>Space</kbd> - 토글/체크박스</li>
                <li><kbd>Esc</kbd> - 닫기/취소</li>
              </ul>
            </div>
          </div>

          <div className="accessibility-panel-footer">
            <button onClick={() => {
              localStorage.removeItem('accessibility_settings');
              window.location.reload();
            }}>
              설정 초기화
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// 접근성 개선 버튼 컴포넌트
export function AccessibleButton({
  children,
  onClick,
  ariaLabel,
  ariaDescribedby,
  ariaExpanded,
  ariaControls,
  ariaPressed,
  disabled,
  className = '',
  ...props
}) {
  const accessibility = useAccessibilityContext();
  
  const handleClick = (e) => {
    if (onClick) onClick(e);
    
    // 스크린 리더 모드일 경우 클릭 알림
    if (accessibility.settings.screenReader && ariaLabel) {
      accessibility.announce(`${ariaLabel} 버튼 클릭됨`);
    }
  };
  
  const handleKeyDown = (e) => {
    // Enter나 Space 키로도 클릭 가능
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };
  
  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-pressed={ariaPressed}
      disabled={disabled}
      className={`accessible-button ${className} ${
        accessibility.isKeyboardUser ? 'keyboard-focus' : ''
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

// 접근성 개선 입력 컴포넌트
export function AccessibleInput({
  label,
  id,
  type = 'text',
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  const accessibility = useAccessibilityContext();
  const inputRef = useRef(null);
  
  const handleChange = (e) => {
    if (onChange) onChange(e);
    
    // 스크린 리더 모드일 경우 변경 알림
    if (accessibility.settings.screenReader && label) {
      accessibility.announce(`${label} 입력값 변경됨`);
    }
  };
  
  const handleFocus = () => {
    if (accessibility.settings.screenReader && label) {
      accessibility.announce(`${label} 입력란 포커스됨`);
    }
  };
  
  const handleBlur = () => {
    if (accessibility.settings.screenReader && label) {
      accessibility.announce(`${label} 입력란 포커스 해제됨`);
    }
  };
  
  return (
    <div className={`accessible-input ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(필수)</span>}
      </label>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        className={error ? 'error' : ''}
        {...props}
      />
      {helperText && !error && (
        <div id={`${id}-helper`} className="helper-text">
          {helperText}
        </div>
      )}
      {error && (
        <div id={`${id}-error`} className="error-text" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

// 접근성 개선 모달 컴포넌트
export function AccessibleModal({
  isOpen,
  onClose,
  title,
  children,
  ariaLabel,
  className = '',
}) {
  const accessibility = useAccessibilityContext();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  
  // 키보드 트랩 설정
  useEffect(() => {
    if (isOpen && modalRef.current) {
      return accessibility.createFocusTrap(modalRef.current);
    }
  }, [isOpen, accessibility]);
  
  // 모달 열릴 때 포커스 이동
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
      accessibility.announce(`${title || ariaLabel} 모달 열림`);
    }
  }, [isOpen, title, ariaLabel, accessibility]);
  
  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="accessible-modal-overlay" role="dialog" aria-modal="true">
      <div
        ref={modalRef}
        className={`accessible-modal ${className}`}
        aria-label={ariaLabel || title}
      >
        <div className="accessible-modal-header">
          {title && <h2>{title}</h2>}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="모달 닫기"
            data-close-modal
          >
            ✕
          </button>
        </div>
        <div className="accessible-modal-content">
          {children}
        </div>
      </div>
    </div>
  );
}

// 접근성 개선 스켈레톤 로딩 컴포넌트
export function AccessibleSkeleton({
  type = 'text',
  width = '100%',
  height = '1em',
  count = 1,
  className = '',
}) {
  const accessibility = useAccessibilityContext();
  
  const skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`accessible-skeleton ${type} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      {accessibility.settings.screenReader && (
        <span className="sr-only">로딩 중...</span>
      )}
    </div>
  ));
  
  return <>{skeletons}</>;
}

// 접근성 CSS 스타일 (인라인으로 추가)
export const accessibilityStyles = `
  /* 접근성 관련 CSS 변수 */
  :root {
    --font-size-small: 14px;
    --font-size-medium: 16px;
    --font-size-large: 18px;
    --font-size-xlarge: 20px;
    
    --focus-ring-color: #0066cc;
    --focus-ring-width: 3px;
    --focus-ring-offset: 2px;
  }
  
  /* 키보드 포커스 스타일 */
  .keyboard-focus:focus {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }
  
  /* 높은 대비 모드 */
  .high-contrast {
    --text-color: #000000;
    --background-color: #ffffff;
    --primary-color: #0000ff;
    --secondary-color: #008000;
    color-scheme: light dark;
  }
  
  /* 반전 대비 모드 */
  .inverted-contrast {
    --text-color: #ffffff;
    --background-color: #000000;
    --primary-color: #ffff00;
    --secondary-color: #00ffff;
    color-scheme: dark;
  }
  
  /* 모션 감소 */
  .reduce-motion *,
  .reduce-motion *::before,
  .reduce-motion *::after {
    animation-duration: 0.01s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01s !important;
  }
  
  /* 스크린 리더 전용 */
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
  
  /* 접근성 패널 스타일 */
  .accessibility-toggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #0066cc;
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.3s, box-shadow 0.3s;
  }
  
  .accessibility-toggle:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
  
  .accessibility-toggle:focus {
    outline: 3px solid #0066cc;
    outline-offset: 2px;
  }
  
  .accessibility-panel {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 1000;
    width: 350px;
    max-width: 90vw;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }
  
  .accessibility-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #0066cc;
    color: white;
  }
  
  .accessibility-panel-header h2 {
    margin: 0;
    font-size: 18px;
  }
  
  .accessibility-panel-header button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
  }
  
  .accessibility-panel-content {
    padding: 20px;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .accessibility-setting {
    margin-bottom: 24px;
  }
  
  .accessibility-setting h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #333;
  }
  
  .setting-options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .setting-options button {
    padding: 8px 16px;
    border: 2px solid #ddd;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .setting-options button.active {
    border-color: #0066cc;
    background: #0066cc;
    color: white;
  }
  
  .setting-options button:focus {
    outline: 2px solid #0066cc;
    outline-offset: 1px;
  }
  
  .setting-toggles {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .setting-toggles label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  
  .setting-toggles input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }
  
  .accessibility-shortcuts {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #eee;
  }
  
  .accessibility-shortcuts h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #333;
  }
  
  .accessibility-shortcuts ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  
  .accessibility-shortcuts li {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .accessibility-shortcuts kbd {
    padding: 2px 6px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
  }
  
  .accessibility-panel-footer {
    padding: 16px 20px;
    border-top: 1px solid #eee;
    text-align: center;
  }
  
  .accessibility-panel-footer button {
    padding: 8px 16px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .accessibility-panel-footer button:hover {
    background: #e5e5e5;
  }
  
  /* 접근성 개선 컴포넌트 기본 스타일 */
  .accessible-button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: #0066cc;
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
  }
  
  .accessible-button:hover {
    background: #0052a3;
  }
  
  .accessible-button:active {
    transform: translateY(1px);
  }
  
  .accessible-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .accessible-input {
    margin-bottom: 16px;
  }
  
  .accessible-input label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #333;
  }
  
  .accessible-input .required {
    color: #d32f2f;
    margin-left: 4px;
  }
  
  .accessible-input input {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 16px;
    transition: border-color 0.2s;
  }
  
  .accessible-input input:focus {
    border-color: #0066cc;
    outline: none;
  }
  
  .accessible-input input.error {
    border-color: #d32f2f;
  }
  
  .helper-text {
    margin-top: 4px;
    font-size: 14px;
    color: #666;
  }
  
  .error-text {
    margin-top: 4px;
    font-size: 14px;
    color: #d32f2f;
  }
  
  /* 접근성 모달 스타일 */
  .accessible-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  }
  
  .accessible-modal {
    background: white;
    border-radius: 12px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  
  .accessible-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #eee;
  }
  
  .accessible-modal-header h2 {
    margin: 0;
    font-size: 20px;
    color: #333;
  }
  
  .accessible-modal-header button {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    padding: 4px;
    color: #666;
  }
  
  .accessible-modal-content {
    padding: 20px;
    overflow-y: auto;
  }
  
  /* 접근성 스켈레톤 스타일 */
  .accessible-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s infinite;
    border-radius: 4px;
  }
  
  @keyframes skeleton-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
  
  .reduce-motion .accessible-skeleton {
    animation: none;
    background: #f0f0f0;
  }
`;

// 접근성 스타일을 문서에 추가하는 훅
export function useAccessibilityStyles() {
  useEffect(() => {
    const styleId = 'accessibility-styles';
    
    // 이미 스타일이 추가되었는지 확인
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = accessibilityStyles;
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

export default AccessibilityProvider;
