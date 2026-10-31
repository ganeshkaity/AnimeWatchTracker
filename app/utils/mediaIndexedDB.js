/**
 * mediaIndexedDB.js
 * 
 * High-performance, unlimited-quota offline persistence via browser IndexedDB.
 * Used for full media records:
 *  - Anime, Episodes, Notes
 *  - Movies, Movie Groups
 *  - Web-Series, Web-Series Episodes
 *  - Watchlist (with full season breakdowns, cast, images)
 *  - Manga, Chapters
 *  - Audio Stories, Audio Tracks
 *  - Offline Dirty Sync Queue
 *  - Posters / Media Cache (fallback for Cache Storage API)
 */

const DB_NAME = 'watchanime_offline_db';
const DB_VERSION = 2;

let dbPromise = null;

export function getMediaDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;

          // 1. Anime & Episodes
          if (!db.objectStoreNames.contains('animes')) {
            db.createObjectStore('animes', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('anime_episodes')) {
            const epStore = db.createObjectStore('anime_episodes', { keyPath: 'id' });
            epStore.createIndex('animeId', 'animeId', { unique: false });
          }

          // 2. Movies & Groups
          if (!db.objectStoreNames.contains('movies')) {
            db.createObjectStore('movies', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('movie_groups')) {
            db.createObjectStore('movie_groups', { keyPath: 'id' });
          }

          // 3. Web-Series & Episodes
          if (!db.objectStoreNames.contains('webseries')) {
            db.createObjectStore('webseries', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('webseries_episodes')) {
            const wsEpStore = db.createObjectStore('webseries_episodes', { keyPath: 'id' });
            wsEpStore.createIndex('seriesId', 'seriesId', { unique: false });
          }

          // 4. Watchlist
          if (!db.objectStoreNames.contains('watchlist')) {
            db.createObjectStore('watchlist', { keyPath: 'id' });
          }

          // 5. Manga & Chapters
          if (!db.objectStoreNames.contains('mangas')) {
            db.createObjectStore('mangas', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('manga_chapters')) {
            const chStore = db.createObjectStore('manga_chapters', { keyPath: 'id' });
            chStore.createIndex('mangaId', 'mangaId', { unique: false });
          }

          // 6. Audio Stories & Tracks
          if (!db.objectStoreNames.contains('audio_stories')) {
            db.createObjectStore('audio_stories', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('audio_tracks')) {
            const trStore = db.createObjectStore('audio_tracks', { keyPath: 'id' });
            trStore.createIndex('storyId', 'storyId', { unique: false });
          }

          // 7. Notes
          if (!db.objectStoreNames.contains('notes')) {
            db.createObjectStore('notes', { keyPath: 'id' });
          }

          // 8. Offline Dirty Queue
          if (!db.objectStoreNames.contains('dirty_queue')) {
            db.createObjectStore('dirty_queue', { keyPath: 'id' });
          }

          // 9. Vault Items
          if (!db.objectStoreNames.contains('vault_items')) {
            db.createObjectStore('vault_items', { keyPath: 'id' });
          }

          // 10. Media Posters Cache
          if (!db.objectStoreNames.contains('media_cache')) {
            db.createObjectStore('media_cache', { keyPath: 'key' });
          }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => {
          console.warn('[mediaIndexedDB] Failed to open IndexedDB:', e);
          resolve(null);
        };
      } catch (err) {
        console.warn('[mediaIndexedDB] Open exception:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

// ─── Generic IDB Helpers ─────────────────────────────────────────────────────

export async function idbGetAll(storeName) {
  const db = await getMediaDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function idbGet(storeName, key) {
  if (!key) return null;
  const db = await getMediaDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(String(key));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbPut(storeName, record) {
  if (!record || typeof record !== 'object') return false;
  const item = { ...record };
  if (!item.id && !item.key) {
    item.id = String(Date.now() + Math.random());
  }
  const db = await getMediaDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbPutBatch(storeName, records) {
  if (!Array.isArray(records) || records.length === 0) return true;
  const db = await getMediaDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      records.forEach((r) => {
        if (r && typeof r === 'object') {
          const item = { ...r };
          if (!item.id && !item.key) {
            item.id = String(Date.now() + Math.random());
          }
          store.put(item);
        }
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(storeName, key) {
  if (!key) return;
  const db = await getMediaDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(String(key));
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbClear(storeName) {
  const db = await getMediaDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbGetByIndex(storeName, indexName, value) {
  if (!value) return [];
  const db = await getMediaDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

// ─── Poster / Media Cache Helpers (IndexedDB fallback for Cache Storage) ────

export async function idbCacheMedia(url, base64OrBlob) {
  if (!url || !base64OrBlob) return;
  const db = await getMediaDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('media_cache', 'readwrite');
      const store = tx.objectStore('media_cache');
      store.put({ key: url, data: base64OrBlob, cachedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbGetCachedMedia(url) {
  if (!url) return null;
  const record = await idbGet('media_cache', url);
  return record?.data || null;
}
