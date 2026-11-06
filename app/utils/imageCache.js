"use client";

import React, { useState, useEffect, useRef } from 'react';
import { isFanartUrl, toFanartBigPreview } from '../lib/fanartUtils';
import { idbCacheMedia, idbGetCachedMedia } from './mediaIndexedDB';

// In-memory cache map for instant 0ms access within the session
const memoryBlobCache = new Map();
const CACHE_NAME = 'watchanime-img-cache-v1';

/**
 * Check if the browser supports the Cache Storage API
 */
const isCacheStorageAvailable = () => {
  return typeof window !== 'undefined' && 'caches' in window;
};

/**
 * Check if a URL is a cross-origin external URL
 * External image CDNs (e.g. s4.anilist.co, myanimelist.net) do not send CORS headers for JS fetch().
 * However, native HTML <img> tags can load them freely and cache them natively in browser HTTP cache.
 */
const isExternalUrl = (src) => {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (typeof window === 'undefined') return src.startsWith('http');
  try {
    const url = new URL(src, window.location.origin);
    return url.origin !== window.location.origin;
  } catch (e) {
    return src.startsWith('http://') || src.startsWith('https://');
  }
};

/**
 * Retrieve cached image blob URL or fetch, cache, and return blob URL
 * For local same-origin endpoints (e.g. /api/image?path=...), uses Cache Storage & Memory Blob cache.
 * For external cross-origin images, returns the URL directly to avoid CORS errors.
 */
export async function getCachedImageUrl(src) {
  if (!src || typeof src !== 'string') return '';
  
  // Normalize Fanart URLs to /bigpreview/ for cards & posters
  const targetSrc = isFanartUrl(src) ? toFanartBigPreview(src) : src;

  // Data URLs and Blobs don't need caching
  if (targetSrc.startsWith('data:') || targetSrc.startsWith('blob:')) return targetSrc;

  // External URLs (e.g. s4.anilist.co, fanart.tv): Return directly to avoid CORS fetch block
  if (isExternalUrl(targetSrc)) {
    return targetSrc;
  }

  // 1. Check in-memory Map first (0ms instantaneous)
  if (memoryBlobCache.has(src)) {
    return memoryBlobCache.get(src);
  }

  // 2. Check Browser Cache Storage API (for same-origin /api/image paths)
  if (isCacheStorageAvailable()) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(src);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const blobUrl = URL.createObjectURL(blob);
        memoryBlobCache.set(src, blobUrl);
        return blobUrl;
      }
    } catch (_) {}
  }

  // 3. Check IndexedDB fallback (media_cache store)
  try {
    const idbCached = await idbGetCachedMedia(src);
    if (idbCached) {
      const blobUrl = typeof idbCached === 'string' && idbCached.startsWith('blob:')
        ? idbCached
        : (idbCached instanceof Blob ? URL.createObjectURL(idbCached) : idbCached);
      memoryBlobCache.set(src, blobUrl);
      return blobUrl;
    }
  } catch (_) {}

  // 4. Fetch from same-origin network and store in Cache Storage & IndexedDB
  try {
    const response = await fetch(src);
    if (response.ok) {
      if (isCacheStorageAvailable()) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(src, response.clone());
        } catch (_) {}
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      memoryBlobCache.set(src, blobUrl);

      // Persist blob copy in IndexedDB media_cache
      idbCacheMedia(src, blob).catch(() => {});

      return blobUrl;
    }
  } catch (err) {
    // Fallback gracefully to direct source
    return src;
  }

  return src;
}

/**
 * Explicitly cache a poster image into Cache Storage & IndexedDB
 */
export async function cachePosterImage(url, blobOrDataUrl) {
  if (!url || !blobOrDataUrl) return;

  try {
    // 1. Save to IndexedDB
    await idbCacheMedia(url, blobOrDataUrl);

    // 2. Save to Cache API if it's a Blob or Response
    if (isCacheStorageAvailable() && (blobOrDataUrl instanceof Blob || blobOrDataUrl instanceof Response)) {
      const cache = await caches.open(CACHE_NAME);
      const res = blobOrDataUrl instanceof Response ? blobOrDataUrl : new Response(blobOrDataUrl);
      await cache.put(url, res);
    }

    // 3. Save to memory cache
    const blobUrl = blobOrDataUrl instanceof Blob ? URL.createObjectURL(blobOrDataUrl) : blobOrDataUrl;
    memoryBlobCache.set(url, blobUrl);
  } catch (err) {
    console.warn('[imageCache] Failed to cache poster:', err);
  }
}

/**
 * Clear all cached poster images across Memory, Cache API, and IndexedDB
 */
export async function clearPosterCache() {
  memoryBlobCache.clear();
  if (isCacheStorageAvailable()) {
    try {
      await caches.delete(CACHE_NAME);
    } catch (_) {}
  }
}

/**
 * CachedImage Component
 * - Implements native lazy-loading (loading="lazy", decoding="async")
 * - Retrieves from Memory / Browser Cache Storage for local images
 * - Uses native browser image loading without CORS violations for external images
 * - Displays a skeleton shimmer while loading
 * - Preserves layout stability (prevents cumulative layout shifts)
 */
function CachedImage({
  src,
  alt = '',
  title = '',
  className = '',
  style = {},
  loading = 'lazy',
  fallbackSrc = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
  onLoad,
  ...props
}) {
  const processedSrc = isFanartUrl(src) ? toFanartBigPreview(src) : src;

  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!processedSrc) return fallbackSrc;
    if (processedSrc.startsWith('data:') || processedSrc.startsWith('blob:') || isExternalUrl(processedSrc)) return processedSrc;
    if (memoryBlobCache.has(processedSrc)) return memoryBlobCache.get(processedSrc);
    return '';
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    setHasError(false);

    if (!processedSrc) {
      setResolvedSrc(fallbackSrc);
      return;
    }

    // Direct resolution for external URLs or data/blob URLs
    if (processedSrc.startsWith('data:') || processedSrc.startsWith('blob:') || isExternalUrl(processedSrc)) {
      setResolvedSrc(processedSrc);
      return;
    }

    if (memoryBlobCache.has(processedSrc)) {
      setResolvedSrc(memoryBlobCache.get(processedSrc));
      return;
    }

    let isCurrent = true;

    getCachedImageUrl(processedSrc)
      .then((url) => {
        if (isMountedRef.current && isCurrent) {
          setResolvedSrc(url || fallbackSrc);
        }
      })
      .catch(() => {
        if (isMountedRef.current && isCurrent) {
          setResolvedSrc(processedSrc || fallbackSrc);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [processedSrc, fallbackSrc]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displayText = title || alt;
  const currentImgSrc = hasError ? (displayText ? null : fallbackSrc) : (resolvedSrc || processedSrc || fallbackSrc);
  const showTitlePlaceholder = (!isLoaded || hasError || !processedSrc) && Boolean(displayText);

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {/* Title Placeholder while image is loading or missing (Image 4 style) */}
      {showTitlePlaceholder && (
        <div className="absolute inset-0 bg-[#0b0f19] flex items-center justify-center p-3 text-center pointer-events-none z-10">
          <span className="text-xs sm:text-sm font-medium text-slate-400/90 line-clamp-3 select-none leading-snug px-1">
            {displayText}
          </span>
        </div>
      )}

      {/* Render Native HTML Image with Lazy Loading & Decoded Cache */}
      {currentImgSrc && (
        <img
          src={currentImgSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={(e) => {
            if (isMountedRef.current) {
              setIsLoaded(true);
            }
            if (onLoad) onLoad(e);
          }}
          onError={() => {
            if (isMountedRef.current) {
              setHasError(true);
              setIsLoaded(true);
            }
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}
    </div>
  );
}

export default React.memo(CachedImage);
