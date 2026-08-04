import fs from 'fs';
import path from 'path';
import os from 'os';

const CACHE_DIR = path.join(os.tmpdir(), 'watchanime_yt_cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error('[youtubeCacheManager] Error creating cache directory:', err);
  }
}

// In-memory sessions store
const sessions = new Map();

/**
 * Clean up orphaned files in .youtube_cache on startup
 */
export function cleanOrphanedCaches() {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        } catch {}
      }
    }
  } catch (err) {
    console.error('[youtubeCacheManager] Cleanup error:', err);
  }
}

// Run initial cleanup
cleanOrphanedCaches();

/**
 * Get or initialize a streaming session
 */
export function getOrCreateSession(sessionId) {
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const cacheFilePath = path.join(CACHE_DIR, `${sessionId}.mp4`);
  
  // Ensure fresh cache file
  try {
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
    fs.writeFileSync(cacheFilePath, Buffer.alloc(0));
  } catch (err) {
    console.error('[youtubeCacheManager] Failed to initialize cache file:', err);
  }

  const session = {
    sessionId,
    cacheFilePath,
    bytesDownloaded: 0,
    isFinished: false,
    ytProcess: null,
    ffmpegProcess: null,
    listeners: new Set(),
    createdAt: Date.now()
  };

  sessions.set(sessionId, session);
  return session;
}

/**
 * Append buffer chunk to packet cache file
 */
export function appendChunk(sessionId, chunk) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    fs.appendFileSync(session.cacheFilePath, chunk);
    session.bytesDownloaded += chunk.length;

    // Notify active range stream listeners
    for (const listener of session.listeners) {
      try {
        listener(session.bytesDownloaded, false);
      } catch {}
    }
  } catch (err) {
    console.error('[youtubeCacheManager] Error appending chunk:', err);
  }
}

/**
 * Mark session streaming as finished
 */
export function markSessionFinished(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.isFinished = true;
  for (const listener of session.listeners) {
    try {
      listener(session.bytesDownloaded, true);
    } catch {}
  }
}

/**
 * Get current cached file size
 */
export function getCachedSize(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return 0;
  try {
    if (fs.existsSync(session.cacheFilePath)) {
      return fs.statSync(session.cacheFilePath).size;
    }
  } catch {}
  return session.bytesDownloaded || 0;
}

/**
 * Close and clean up session, processes, and temporary cache file
 */
export function closeSession(sessionId) {
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;

  // Kill child processes if running
  if (session.ytProcess) {
    try { session.ytProcess.kill('SIGKILL'); } catch {}
  }
  if (session.ffmpegProcess) {
    try { session.ffmpegProcess.kill('SIGKILL'); } catch {}
  }

  // Clear listeners
  session.listeners.clear();

  // Delete cache file
  try {
    if (fs.existsSync(session.cacheFilePath)) {
      fs.unlinkSync(session.cacheFilePath);
    }
  } catch (err) {
    console.error('[youtubeCacheManager] Failed to delete cache file:', err);
  }

  sessions.delete(sessionId);
}
