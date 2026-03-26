/**
 * 시험공부AI - Service Worker
 * 오프라인 지원 및 캐싱 강화
 */

const CACHE_NAME = 'exam-study-ai-v2';
const STATIC_CACHE_NAME = 'exam-study-ai-static-v2';
const DYNAMIC_CACHE_NAME = 'exam-study-ai-dynamic-v2';

// 캐시할 정적 자원
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png',
  '/robots.txt',
  '/sitemap.xml',
  '/ads.txt',
];

// 캐시할 API 엔드포인트 (오프라인 지원)
const API_CACHE_ENDPOINTS = [
  '/api/openai/v1/chat/completions',
  '/api/feedback/notify',
];

// 캐시 제외할 경로
const EXCLUDE_FROM_CACHE = [
  '/api/kakaopay',
  '/api/nicepayments',
  '/api/feedback',
];

// 네트워크 우선 정책 적용할 경로
const NETWORK_FIRST_PATHS = [
  '/api/',
];

// 캐시 우선 정책 적용할 경로
const CACHE_FIRST_PATHS = [
  '/assets/',
  '/public/',
  '/legal-html/',
  '/privacy/',
  '/terms/',
  '/study-ai/',
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  console.log('[Service Worker] 설치 중...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] 정적 자원 캐싱 중...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] 설치 완료');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] 설치 중 오류:', error);
      })
  );
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 활성화 중...');
  
  event.waitUntil(
    Promise.all([
      // 오래된 캐시 정리
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[Service Worker] 오래된 캐시 삭제:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 클라이언트 제어권 확보
      self.clients.claim(),
    ])
  );
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNavigationRequest = event.request.mode === 'navigate';
  const acceptsHtml = event.request.headers.get('Accept')?.includes('text/html');

  if (isNavigationRequest || acceptsHtml) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }
  
  // 캐시 제외 경로 확인
  if (EXCLUDE_FROM_CACHE.some(path => url.pathname.startsWith(path))) {
    return;
  }
  
  // 네트워크 우선 정책 적용
  if (NETWORK_FIRST_PATHS.some(path => url.pathname.startsWith(path))) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }
  
  // 캐시 우선 정책 적용
  if (CACHE_FIRST_PATHS.some(path => url.pathname.startsWith(path))) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }
  
  // 기본 정책: 캐시 후 네트워크 폴백
  event.respondWith(cacheThenNetworkStrategy(event.request));
});

// 네트워크 우선 전략
async function networkFirstStrategy(request) {
  try {
    // 네트워크 요청 시도
    const networkResponse = await fetch(request);
    
    // 성공 시 캐시에 저장
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] 네트워크 실패, 캐시에서 응답:', request.url);
    
    // 네트워크 실패 시 캐시에서 응답
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 캐시에도 없으면 오프라인 페이지
    return offlineResponse(request);
  }
}

// 캐시 우선 전략
async function cacheFirstStrategy(request) {
  // 캐시에서 먼저 찾기
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 캐시 히트 시 백그라운드에서 캐시 업데이트
    updateCacheInBackground(request);
    return cachedResponse;
  }
  
  // 캐시 미스 시 네트워크 요청
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 캐시에 저장
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] 네트워크 실패:', request.url);
    return offlineResponse(request);
  }
}

// 캐시 후 네트워크 폴백 전략
async function cacheThenNetworkStrategy(request) {
  // 캐시에서 먼저 찾기
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 캐시 히트 시 백그라운드에서 네트워크 요청으로 캐시 업데이트
    updateCacheInBackground(request);
    return cachedResponse;
  }
  
  // 캐시 미스 시 네트워크 요청
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 캐시에 저장
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] 네트워크 실패:', request.url);
    return offlineResponse(request);
  }
}

// 백그라운드 캐시 업데이트
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    // 백그라운드 업데이트 실패는 무시
    console.log('[Service Worker] 백그라운드 캐시 업데이트 실패:', error);
  }
}

// 오프라인 응답 생성
function offlineResponse(request) {
  const url = new URL(request.url);
  
  // HTML 요청인 경우 오프라인 페이지 반환
  if (request.headers.get('Accept')?.includes('text/html')) {
    return caches.match('/offline.html')
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // 오프라인 페이지가 없으면 기본 오프라인 메시지
        return new Response(
          `
          <!DOCTYPE html>
          <html lang="ko">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>오프라인 - 시험공부AI</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
              }
              .container {
                max-width: 500px;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              }
              h1 {
                font-size: 2.5rem;
                margin-bottom: 20px;
              }
              p {
                font-size: 1.2rem;
                line-height: 1.6;
                margin-bottom: 30px;
                opacity: 0.9;
              }
              .icon {
                font-size: 4rem;
                margin-bottom: 20px;
              }
              .button {
                display: inline-block;
                background: white;
                color: #667eea;
                padding: 12px 30px;
                border-radius: 50px;
                text-decoration: none;
                font-weight: bold;
                font-size: 1.1rem;
                transition: transform 0.3s, box-shadow 0.3s;
              }
              .button:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">📶</div>
              <h1>오프라인 상태</h1>
              <p>인터넷 연결이 끊겼습니다. 네트워크 연결을 확인하고 다시 시도해주세요.</p>
              <p>이미 캐시된 콘텐츠는 계속 사용할 수 있습니다.</p>
              <a href="/" class="button">홈으로 돌아가기</a>
            </div>
          </body>
          </html>
          `,
          {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      });
  }
  
  // API 요청인 경우 오프라인 에러 반환
  if (url.pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: '네트워크 연결이 없습니다. 오프라인 모드에서는 이 기능을 사용할 수 없습니다.',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // 기타 요청은 기본 오프라인 응답
  return new Response(
    '오프라인 상태입니다. 네트워크 연결을 확인해주세요.',
    {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    }
  );
}

// 백그라운드 동기화
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] 백그라운드 동기화:', event.tag);
  
  if (event.tag === 'sync-feedback') {
    event.waitUntil(syncFeedback());
  }
  
  if (event.tag === 'sync-ai-responses') {
    event.waitUntil(syncAIResponses());
  }
});

// 푸시 알림
self.addEventListener('push', (event) => {
  console.log('[Service Worker] 푸시 알림 수신');
  
  const data = event.data?.json() || {
    title: '시험공부AI',
    body: '새로운 알림이 있습니다.',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/pwa-192.png',
      badge: data.badge || '/pwa-192.png',
      tag: data.tag || 'default',
      data: data.data || {},
      actions: data.actions || [],
    })
  );
});

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] 알림 클릭:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 탭이 있는지 확인
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // 새 탭 열기
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// 피드백 동기화 함수
async function syncFeedback() {
  console.log('[Service Worker] 피드백 동기화 시작');
  
  try {
    const cache = await caches.open('pending-feedback');
    const keys = await cache.keys();
    
    for (const request of keys) {
      try {
        const response = await fetch(request);
        
        if (response.ok) {
          // 동기화 성공 시 캐시에서 제거
          await cache.delete(request);
          console.log('[Service Worker] 피드백 동기화 성공:', request.url);
        }
      } catch (error) {
        console.error('[Service Worker] 피드백 동기화 실패:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] 피드백 동기화 중 오류:', error);
  }
}

// AI 응답 동기화 함수
async function syncAIResponses() {
  console.log('[Service Worker] AI 응답 동기화 시작');
  
  try {
    const cache = await caches.open('pending-ai-responses');
    const keys = await cache.keys();
    
    for (const request of keys) {
      try {
        const response = await fetch(request);
        
        if (response.ok) {
          // 동기화 성공 시 캐시에서 제거
          await cache.delete(request);
          console.log('[Service Worker] AI 응답 동기화 성공:', request.url);
        }
      } catch (error) {
        console.error('[Service Worker] AI 응답 동기화 실패:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] AI 응답 동기화 중 오류:', error);
  }
}

// 주기적 백그라운드 작업
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] 주기적 동기화:', event.tag);
  
  if (event.tag === 'cleanup-cache') {
    event.waitUntil(cleanupCache());
  }
});

// 캐시 정리 함수
async function cleanupCache() {
  console.log('[Service Worker] 캐시 정리 시작');
  
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const requests = await cache.keys();
    const now = Date.now();
    
    for (const request of requests) {
      try {
        const response = await cache.match(request);
        if (!response) continue;
        
        const dateHeader = response.headers.get('date');
        if (!dateHeader) continue;
        
        const cachedDate = new Date(dateHeader).getTime();
        const age = now - cachedDate;
        
        // 7일 이상된 캐시 삭제
        if (age > 7 * 24 * 60 * 60 * 1000) {
          await cache.delete(request);
          console.log('[Service Worker] 오래된 캐시 삭제:', request.url);
        }
      } catch (error) {
        console.error('[Service Worker] 캐시 정리 중 오류:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] 캐시 정리 중 오류:', error);
  }
}

// 메시지 수신
self.addEventListener('message', (event) => {
  console.log('[Service Worker] 메시지 수신:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(DYNAMIC_CACHE_NAME)
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
  
  if (event.data.type === 'GET_CACHE_STATS') {
    caches.open(DYNAMIC_CACHE_NAME)
      .then((cache) => cache.keys())
      .then((keys) => {
        event.ports[0].postMessage({
          success: true,
          stats: {
            cacheName: DYNAMIC_CACHE_NAME,
            itemCount: keys.length,
          },
        });
      })
      .catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
});