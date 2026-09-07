/**
 * indexedDBStore.js — Robust IndexedDB persistence for Manga Reader
 * Stores: reading_progress, annotations, bookmarks, page_notes, reader_settings
 * Fallback to localStorage if IndexedDB is blocked (e.g. private browsing).
 */

const DB_NAME = 'watchanime_manga_reader_db';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('reading_progress')) {
            db.createObjectStore('reading_progress', { keyPath: 'documentId' });
          }
          if (!db.objectStoreNames.contains('annotations')) {
            db.createObjectStore('annotations', { keyPath: 'key' }); // key = `${docId}_p${page}`
          }
          if (!db.objectStoreNames.contains('bookmarks')) {
            db.createObjectStore('bookmarks', { keyPath: 'documentId' });
          }
          if (!db.objectStoreNames.contains('page_notes')) {
            db.createObjectStore('page_notes', { keyPath: 'documentId' });
          }
          if (!db.objectStoreNames.contains('reader_settings')) {
            db.createObjectStore('reader_settings', { keyPath: 'id' });
          }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => {
          console.warn('[indexedDBStore] Could not open IndexedDB, falling back to localStorage');
          resolve(null);
        };
      } catch (err) {
        console.warn('[indexedDBStore] IndexedDB exception:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

// ─── Reading Progress ──────────────────────────────────────────────────────────

export async function saveReadingProgress(documentId, data) {
  if (!documentId) return;
  const payload = {
    documentId,
    lastPage: data.lastPage || 1,
    totalPages: data.totalPages || 1,
    progress: data.progress !== undefined ? data.progress : Math.round(((data.lastPage || 1) / (data.totalPages || 1)) * 100),
    lastReadAt: new Date().toISOString(),
    zoom: data.zoom || 1.0,
    rotation: data.rotation || 0,
    readingMode: data.readingMode || 'single',
    direction: data.direction || 'rtl',
    background: data.background || 'dark',
    coverPageOffset: !!data.coverPageOffset,
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('reading_progress', 'readwrite');
      tx.objectStore('reading_progress').put(payload);
    } catch (e) {
      console.warn('[indexedDBStore] Error putting progress:', e);
    }
  }

  // Also sync to localStorage for redundancy and fast initial sync
  try {
    localStorage.setItem(`manga_progress_${documentId}`, JSON.stringify(payload));
  } catch {}
}

export async function getReadingProgress(documentId) {
  if (!documentId) return null;

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('reading_progress', 'readonly');
      const req = tx.objectStore('reading_progress').get(documentId);
      const res = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      if (res) return res;
    } catch (e) {
      console.warn('[indexedDBStore] Error reading progress:', e);
    }
  }

  try {
    const raw = localStorage.getItem(`manga_progress_${documentId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Annotations ──────────────────────────────────────────────────────────────

export async function savePageAnnotations(documentId, pageNum, annotations) {
  if (!documentId || !pageNum) return;
  const key = `${documentId}_p${pageNum}`;
  const payload = {
    key,
    documentId,
    page: pageNum,
    annotations: annotations || [],
    updatedAt: Date.now(),
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('annotations', 'readwrite');
      tx.objectStore('annotations').put(payload);
    } catch (e) {
      console.warn('[indexedDBStore] Error putting annotations:', e);
    }
  }

  try {
    localStorage.setItem(`manga_annot_${key}`, JSON.stringify(payload));
  } catch {}
}

export async function getPageAnnotations(documentId, pageNum) {
  if (!documentId || !pageNum) return [];
  const key = `${documentId}_p${pageNum}`;

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('annotations', 'readonly');
      const req = tx.objectStore('annotations').get(key);
      const res = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      if (res && Array.isArray(res.annotations)) return res.annotations;
    } catch (e) {
      console.warn('[indexedDBStore] Error reading annotations:', e);
    }
  }

  try {
    const raw = localStorage.getItem(`manga_annot_${key}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && Array.isArray(parsed.annotations)) ? parsed.annotations : [];
  } catch {
    return [];
  }
}

export async function getAllDocumentAnnotations(documentId) {
  if (!documentId) return {};

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('annotations', 'readonly');
      const store = tx.objectStore('annotations');
      const req = store.getAll();
      const all = await new Promise((res) => {
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });

      const map = {};
      all.forEach((item) => {
        if (item.documentId === documentId && item.page) {
          map[item.page] = item.annotations || [];
        }
      });
      return map;
    } catch (e) {
      console.warn('[indexedDBStore] Error fetching all annotations:', e);
    }
  }

  // LocalStorage fallback scan
  const map = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`manga_annot_${documentId}_p`)) {
        const item = JSON.parse(localStorage.getItem(k));
        if (item && item.page) map[item.page] = item.annotations || [];
      }
    }
  } catch {}
  return map;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export async function saveBookmarks(documentId, bookmarks) {
  if (!documentId) return;
  const payload = {
    documentId,
    bookmarks: bookmarks || [],
    updatedAt: Date.now(),
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('bookmarks', 'readwrite');
      tx.objectStore('bookmarks').put(payload);
    } catch (e) {}
  }

  try {
    localStorage.setItem(`manga_bookmarks_${documentId}`, JSON.stringify(bookmarks || []));
  } catch {}
}

export async function getBookmarks(documentId) {
  if (!documentId) return [];

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('bookmarks', 'readonly');
      const req = tx.objectStore('bookmarks').get(documentId);
      const res = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      if (res && Array.isArray(res.bookmarks)) return res.bookmarks;
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(`manga_bookmarks_${documentId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Page Notes ───────────────────────────────────────────────────────────────

export async function savePageNotes(documentId, notes) {
  if (!documentId) return;
  const payload = {
    documentId,
    notes: notes || [],
    updatedAt: Date.now(),
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('page_notes', 'readwrite');
      tx.objectStore('page_notes').put(payload);
    } catch (e) {}
  }

  try {
    localStorage.setItem(`manga_notes_${documentId}`, JSON.stringify(notes || []));
  } catch {}
}

export async function getPageNotes(documentId) {
  if (!documentId) return [];

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('page_notes', 'readonly');
      const req = tx.objectStore('page_notes').get(documentId);
      const res = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      if (res && Array.isArray(res.notes)) return res.notes;
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(`manga_notes_${documentId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Reader Global Settings ───────────────────────────────────────────────────

export async function saveReaderSettings(settings) {
  const payload = {
    id: 'global',
    ...settings,
    updatedAt: Date.now(),
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('reader_settings', 'readwrite');
      tx.objectStore('reader_settings').put(payload);
    } catch (e) {}
  }

  try {
    localStorage.setItem('watchanime_reader_settings', JSON.stringify(payload));
  } catch {}
}

export async function getReaderSettings() {
  const defaults = {
    direction: 'rtl',           // 'rtl' (Manga) | 'ltr'
    readingMode: 'single',       // 'single' | 'double' | 'vertical'
    background: 'dark',         // 'dark' | 'black' | 'sepia' | 'light'
    zoomMode: 'fit-width',      // 'fit-width' | 'fit-page' | '100'
    pageTransition: true,
    toolbarAutoHide: true,
    coverPageOffset: true,      // Page 1 is cover in two-page mode
  };

  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('reader_settings', 'readonly');
      const req = tx.objectStore('reader_settings').get('global');
      const res = await new Promise((res) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
      if (res) return { ...defaults, ...res };
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem('watchanime_reader_settings');
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}
