import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Server-side in-memory registry mapping mediaId -> { filePath, animeId, episodeId, fileName, registeredAt }
const memoryRegistry = new Map();

// Secret key for generating and verifying opaque fallback tokens (persists per process)
const REGISTRY_SECRET = process.env.MEDIA_SERVER_SECRET || 'watchanime_media_server_secret_key_9981';

/**
 * Generate a clean, URL-safe stable media ID.
 * Format: e.g. "anime_one_piece_ep_1100_a1b2c3" or an opaque token
 */
export function generateMediaId(animeId = 'anime', episodeId = 'ep', filePath = '') {
  // Create a short hash of the file path for deterministic stability
  const hash = crypto.createHash('sha256').update(`${animeId}:${episodeId}:${filePath}`).digest('hex').slice(0, 12);
  const cleanAnime = (animeId || 'anime').toString().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const cleanEp = (episodeId || 'ep').toString().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  return `${cleanAnime}_${cleanEp}_${hash}`;
}

/**
 * Encrypt a filePath into an opaque base64url token as fallback if server restarts
 */
export function createOpaqueToken(filePath, animeId, episodeId) {
  try {
    const payload = JSON.stringify({ p: filePath, a: animeId, e: episodeId, t: Date.now() });
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(REGISTRY_SECRET).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  } catch (err) {
    console.error('[mediaRegistry] Failed to create opaque token:', err);
    return null;
  }
}

/**
 * Decrypt an opaque token back to payload
 */
export function decodeOpaqueToken(token) {
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const key = crypto.createHash('sha256').update(REGISTRY_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

/**
 * Register a media file in the registry.
 */
export function registerMediaFile({ animeId, episodeId, filePath, fileName }) {
  if (!filePath) return null;

  const mediaId = generateMediaId(animeId, episodeId, filePath);
  const token = createOpaqueToken(filePath, animeId, episodeId);

  const entry = {
    mediaId,
    token,
    animeId: animeId || '',
    episodeId: episodeId || '',
    filePath,
    fileName: fileName || path.basename(filePath),
    registeredAt: Date.now(),
  };

  memoryRegistry.set(mediaId, entry);
  // Also register by token for instant lookup
  if (token) {
    memoryRegistry.set(token, entry);
  }

  return { mediaId, token };
}

/**
 * Resolve a mediaId or token to the physical file information.
 * NEVER exposes the physical path outside the server.
 */
export function resolveMedia(mediaId) {
  if (!mediaId) return null;

  // 1. Check memory registry
  if (memoryRegistry.has(mediaId)) {
    const entry = memoryRegistry.get(mediaId);
    if (fs.existsSync(entry.filePath)) {
      return entry;
    }
  }

  // 2. Try decoding as opaque token
  const decoded = decodeOpaqueToken(mediaId);
  if (decoded && decoded.p && fs.existsSync(decoded.p)) {
    const entry = {
      mediaId,
      filePath: decoded.p,
      animeId: decoded.a || '',
      episodeId: decoded.e || '',
      fileName: path.basename(decoded.p),
      registeredAt: decoded.t || Date.now(),
    };
    memoryRegistry.set(mediaId, entry);
    return entry;
  }

  return null;
}

/**
 * Clean helper to get CORS headers
 */
export function getMediaCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Origin, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
  };
}
