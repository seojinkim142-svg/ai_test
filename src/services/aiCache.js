/**
 * AI 응답 캐싱 시스템
 * Redis나 IndexedDB를 활용한 영구 캐싱 시스템
 */

// 캐시 설정
const CACHE_CONFIG = {
  // 캐시 TTL (Time To Live) - 기본 24시간
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24시간 (밀리초)
  // 최대 캐시 항목 수
  MAX_ITEMS: 100,
  // 캐시 스토리지 타입 (indexeddb, memory, hybrid)
  STORAGE_TYPE: 'hybrid',
  // 캐시 키 프리픽스
  KEY_PREFIX: 'ai_cache_',
  // 캐시 버전 (캐시 무효화용)
  VERSION: 'v1',
};

// 캐시 항목 구조
class CacheItem {
  constructor(key, data, options = {}) {
    this.key = key;
    this.data = data;
    this.timestamp = Date.now();
    this.ttl = options.ttl || CACHE_CONFIG.DEFAULT_TTL;
    this.hits = 0;
    this.size = this.calculateSize(data);
    this.metadata = options.metadata || {};
  }
  
  calculateSize(data) {
    try {
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch {
      return 0;
    }
  }
  
  isExpired() {
    return Date.now() > this.timestamp + this.ttl;
  }
  
  hit() {
    this.hits++;
    return this;
  }
  
  toJSON() {
    return {
      key: this.key,
      data: this.data,
      timestamp: this.timestamp,
      ttl: this.ttl,
      hits: this.hits,
      size: this.size,
      metadata: this.metadata,
    };
  }
}

// IndexedDB 캐시 스토리지
class IndexedDBCache {
  constructor(dbName = 'ai_cache_db', storeName = 'cache_store') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
    this.isInitialized = false;
  }
  
  async init() {
    if (this.isInitialized) return true;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => {
        console.error('IndexedDB 초기화 실패:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve(true);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 캐시 저장소 생성
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('hits', 'hits', { unique: false });
        }
      };
    });
  }
  
  async set(key, cacheItem) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.put(cacheItem.toJSON());
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  async get(key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.get(key);
      
      request.onsuccess = () => {
        if (request.result) {
          const item = request.result;
          const cacheItem = new CacheItem(
            item.key,
            item.data,
            { ttl: item.ttl, metadata: item.metadata }
          );
          cacheItem.timestamp = item.timestamp;
          cacheItem.hits = item.hits;
          cacheItem.size = item.size;
          resolve(cacheItem);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async delete(key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.delete(key);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  async clear() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.clear();
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAll() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result.map(item => {
          const cacheItem = new CacheItem(
            item.key,
            item.data,
            { ttl: item.ttl, metadata: item.metadata }
          );
          cacheItem.timestamp = item.timestamp;
          cacheItem.hits = item.hits;
          cacheItem.size = item.size;
          return cacheItem;
        });
        resolve(items);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async cleanup() {
    const items = await this.getAll();
    const now = Date.now();
    
    for (const item of items) {
      if (item.isExpired()) {
        await this.delete(item.key);
      }
    }
    
    // 항목 수 제한
    if (items.length > CACHE_CONFIG.MAX_ITEMS) {
      const sorted = items
        .filter(item => !item.isExpired())
        .sort((a, b) => {
          // 적게 사용된 항목 우선 삭제
          if (a.hits !== b.hits) return a.hits - b.hits;
          // 오래된 항목 우선 삭제
          return a.timestamp - b.timestamp;
        });
      
      const toDelete = sorted.slice(0, items.length - CACHE_CONFIG.MAX_ITEMS);
      for (const item of toDelete) {
        await this.delete(item.key);
      }
    }
  }
}

// 메모리 캐시 스토리지
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.hits = new Map();
  }
  
  set(key, cacheItem) {
    this.cache.set(key, cacheItem);
    this.hits.set(key, (this.hits.get(key) || 0) + 1);
    return Promise.resolve(true);
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (item) {
      this.hits.set(key, (this.hits.get(key) || 0) + 1);
      item.hits = this.hits.get(key);
      return Promise.resolve(item);
    }
    return Promise.resolve(null);
  }
  
  delete(key) {
    this.cache.delete(key);
    this.hits.delete(key);
    return Promise.resolve(true);
  }
  
  clear() {
    this.cache.clear();
    this.hits.clear();
    return Promise.resolve(true);
  }
  
  getAll() {
    return Promise.resolve(Array.from(this.cache.values()));
  }
  
  async cleanup() {
    const now = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.isExpired()) {
        await this.delete(key);
      }
    }
    
    // 항목 수 제한
    if (this.cache.size > CACHE_CONFIG.MAX_ITEMS) {
      const sorted = Array.from(this.cache.entries())
        .filter(([_, item]) => !item.isExpired())
        .sort(([keyA, itemA], [keyB, itemB]) => {
          // 적게 사용된 항목 우선 삭제
          if (itemA.hits !== itemB.hits) return itemA.hits - itemB.hits;
          // 오래된 항목 우선 삭제
          return itemA.timestamp - itemB.timestamp;
        });
      
      const toDelete = sorted.slice(0, this.cache.size - CACHE_CONFIG.MAX_ITEMS);
      for (const [key] of toDelete) {
        await this.delete(key);
      }
    }
  }
}

// 하이브리드 캐시 스토리지 (메모리 + IndexedDB)
class HybridCache {
  constructor() {
    this.memoryCache = new MemoryCache();
    this.indexedDBCache = new IndexedDBCache();
    this.storageType = CACHE_CONFIG.STORAGE_TYPE;
    this.initialized = false;
  }
  
  async init() {
    if (this.initialized) return;
    
    try {
      await this.indexedDBCache.init();
      this.initialized = true;
    } catch (error) {
      console.warn('IndexedDB 초기화 실패, 메모리 캐시만 사용:', error);
      this.storageType = 'memory';
      this.initialized = true;
    }
  }
  
  async set(key, cacheItem) {
    await this.init();
    
    // 메모리 캐시에 저장
    await this.memoryCache.set(key, cacheItem);
    
    // IndexedDB에도 저장 (하이브리드 모드일 때)
    if (this.storageType === 'hybrid') {
      try {
        await this.indexedDBCache.set(key, cacheItem);
      } catch (error) {
        console.warn('IndexedDB 저장 실패:', error);
      }
    }
    
    return true;
  }
  
  async get(key) {
    await this.init();
    
    // 1. 메모리 캐시에서 찾기
    let item = await this.memoryCache.get(key);
    
    if (item) {
      if (item.isExpired()) {
        await this.delete(key);
        return null;
      }
      return item;
    }
    
    // 2. IndexedDB에서 찾기 (하이브리드 모드일 때)
    if (this.storageType === 'hybrid') {
      try {
        item = await this.indexedDBCache.get(key);
        
        if (item) {
          if (item.isExpired()) {
            await this.delete(key);
            return null;
          }
          
          // 메모리 캐시에 저장 (다음 접근을 위해)
          await this.memoryCache.set(key, item);
          return item;
        }
      } catch (error) {
        console.warn('IndexedDB 조회 실패:', error);
      }
    }
    
    return null;
  }
  
  async delete(key) {
    await this.init();
    
    await this.memoryCache.delete(key);
    
    if (this.storageType === 'hybrid') {
      try {
        await this.indexedDBCache.delete(key);
      } catch (error) {
        console.warn('IndexedDB 삭제 실패:', error);
      }
    }
    
    return true;
  }
  
  async clear() {
    await this.init();
    
    await this.memoryCache.clear();
    
    if (this.storageType === 'hybrid') {
      try {
        await this.indexedDBCache.clear();
      } catch (error) {
        console.warn('IndexedDB 클리어 실패:', error);
      }
    }
    
    return true;
  }
  
  async getAll() {
    await this.init();
    
    if (this.storageType === 'hybrid') {
      try {
        return await this.indexedDBCache.getAll();
      } catch (error) {
        console.warn('IndexedDB 전체 조회 실패:', error);
      }
    }
    
    return await this.memoryCache.getAll();
  }
  
  async cleanup() {
    await this.init();
    
    await this.memoryCache.cleanup();
    
    if (this.storageType === 'hybrid') {
      try {
        await this.indexedDBCache.cleanup();
      } catch (error) {
        console.warn('IndexedDB 정리 실패:', error);
      }
    }
  }
  
  async getStats() {
    await this.init();
    
    const items = await this.getAll();
    const now = Date.now();
    
    const stats = {
      totalItems: items.length,
      expiredItems: items.filter(item => item.isExpired()).length,
      totalSize: items.reduce((sum, item) => sum + item.size, 0),
      averageHits: items.length > 0 
        ? items.reduce((sum, item) => sum + item.hits, 0) / items.length 
        : 0,
      storageType: this.storageType,
      memoryCacheSize: this.memoryCache.cache.size,
    };
    
    return stats;
  }
}

// 캐시 키 생성 함수
function generateCacheKey(service, params) {
  const paramsString = JSON.stringify(params);
  const hash = simpleHash(paramsString);
  return `${CACHE_CONFIG.KEY_PREFIX}${service}_${hash}_${CACHE_CONFIG.VERSION}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32비트 정수로 변환
  }
  return Math.abs(hash).toString(16);
}

// AI 캐시 서비스
class AICacheService {
  constructor() {
    this.cache = new HybridCache();
    this.cleanupInterval = null;
    this.stats = {
      hits: 0,
      misses: 0,
      saves: 0,
      errors: 0,
    };
  }
  
  async init() {
    await this.cache.init();
    
    // 정리 작업 주기적 실행 (30분마다)
    this.cleanupInterval = setInterval(() => {
      this.cache.cleanup().catch(console.error);
    }, 30 * 60 * 1000);
    
    // 초기 정리
    await this.cache.cleanup();
    
    console.log('AI 캐시 서비스 초기화 완료');
  }
  
  async getCachedResponse(service, params, options = {}) {
    const key = generateCacheKey(service, params);
    
    try {
      const cachedItem = await this.cache.get(key);
      
      if (cachedItem) {
        this.stats.hits++;
        
        // 캐시 히트 통계 업데이트
        cachedItem.hit();
        await this.cache.set(key, cachedItem);
        
        return {
          cached: true,
          data: cachedItem.data,
          timestamp: cachedItem.timestamp,
          hits: cachedItem.hits,
          metadata: cachedItem.metadata,
        };
      }
      
      this.stats.misses++;
      return { cached: false };
      
    } catch (error) {
      this.stats.errors++;
      console.error('캐시 조회 중 오류:', error);
      return { cached: false, error: error.message };
    }
  }
  
  async cacheResponse(service, params, data, options = {}) {
    const key = generateCacheKey(service, params);
    const ttl = options.ttl || CACHE_CONFIG.DEFAULT_TTL;
    
    const cacheItem = new CacheItem(key, data, {
      ttl,
      metadata: {
        service,
        params: JSON.stringify(params),
        cachedAt: new Date().toISOString(),
        ...options.metadata,
      },
    });
    
    try {
      await this.cache.set(key, cacheItem);
      this.stats.saves++;
      
      return {
        success: true,
        key,
        size: cacheItem.size,
        expiresAt: cacheItem.timestamp + cacheItem.ttl,
      };
      
    } catch (error) {
      this.stats.errors++;
      console.error('캐시 저장 중 오류:', error);
      return { success: false, error: error.message };
    }
  }
  
  async invalidateCache(service, params = null) {
    try {
      if (params) {
        // 특정 파라미터의 캐시만 무효화
        const key = generateCacheKey(service, params);
        await this.cache.delete(key);
      } else {
        // 서비스 전체 캐시 무효화
        const allItems = await this.cache.getAll();
        const serviceItems = allItems.filter(item => 
          item.metadata.service === service
        );
        
        for (const item of serviceItems) {
          await this.cache.delete(item.key);
        }
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('캐시 무효화 중 오류:', error);
      return { success: false, error: error.message };
    }
  }
  
  async getStats() {
    const cacheStats = await this.cache.getStats();
    
    return {
      ...this.stats,
      ...cacheStats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
        : 0,
    };
  }
  
  async clearAll() {
    try {
      await this.cache.clear();
      this.stats = { hits: 0, misses: 0, saves: 0, errors: 0 };
      return { success: true };
    } catch (error) {
      console.error('캐시 전체 삭제 중 오류:', error);
      return { success: false, error: error.message };
    }
  }
  
  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    await this.cache.cleanup();
  }
}

// 싱글톤 인스턴스
let aiCacheInstance = null;

export function getAICache() {
  if (!aiCacheInstance) {
    aiCacheInstance = new AICacheService();
    // 비동기 초기화 (애플리케이션 시작 시)
    aiCacheInstance.init().catch(console.error);
  }
  return aiCacheInstance;
}

// React 훅
export function useAICache() {
  const [cache, setCache] = useState(null);
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    const cacheInstance = getAICache();
    setCache(cacheInstance);
    
    // 초기 통계 가져오기
    cacheInstance.getStats().then(setStats).catch(console.error);
    
    // 주기적 통계 업데이트
    const interval = setInterval(() => {
      cacheInstance.getStats().then(setStats).catch(console.error);
    }, 60000); // 1분마다
    
    return () => {
      clearInterval(interval);
    };
  }, []);
  
  const getCached = useCallback(async (service, params, options = {}) => {
    if (!cache) return { cached: false };
    return await cache.getCachedResponse(service, params, options);
  }, [cache]);
  
  const setCached = useCallback(async (service, params, data, options = {}) => {
    if (!cache) return { success: false, error: 'Cache not initialized' };
    return await cache.cacheResponse(service, params, data, options);
  }, [cache]);
  
  const invalidate = useCallback(async (service, params = null) => {
    if (!cache) return { success: false, error: 'Cache not initialized' };
    return await cache.invalidateCache(service, params);
  }, [cache]);
  
  const clear = useCallback(async () => {
    if (!cache) return { success: false, error: 'Cache not initialized' };
    return await cache.clearAll();
  }, [cache]);
  
  const refreshStats = useCallback(async () => {
    if (!cache) return null;
    const newStats = await cache.getStats();
    setStats(newStats);
    return newStats;
  }, [cache]);
  
  return {
    cache,
    stats,
    getCached,
    setCached,
    invalidate,
    clear,
    refreshStats,
    isInitialized: !!cache,
  };
}

// 캐시된 AI 요청 래퍼
export function withAICaching(aiServiceFunction, serviceName, options = {}) {
  return async function(...args) {
    const cache = getAICache();
    const params = args.length === 1 ? args[0] : args;
    
    // 캐시된 응답 확인
    const cached = await cache.getCachedResponse(serviceName, params, options);
    
    if (cached.cached) {
      console.log(`[Cache Hit] ${serviceName}:`, cached.hits, 'hits');
      return cached.data;
    }
    
    console.log(`[Cache Miss] ${serviceName}: fetching fresh data`);
    
    // 새로운 데이터 가져오기
    try {
      const data = await aiServiceFunction(...args);
      
      // 캐시에 저장
      await cache.cacheResponse(serviceName, params, data, options);
      
      return data;
    } catch (error) {
      console.error(`[Cache Error] ${serviceName}:`, error);
      throw error;
    }
  };
}

// 캐시 관리 UI 컴포넌트용 유틸리티
export const cacheUtils = {
  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  },
  
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
      return `${minutes}분 전`;
    } else if (hours < 24) {
      return `${hours}시간 전`;
    } else {
      return `${days}일 전`;
    }
  },
  
  getCacheHealth(stats) {
    if (!stats) return 'unknown';
    
    const hitRate = stats.hitRate || 0;
    
    if (hitRate > 70) return 'excellent';
    if (hitRate > 50) return 'good';
    if (hitRate > 30) return 'fair';
    return 'poor';
  },
};

export default getAICache;
   