"use client";

import React, { useState, useEffect, useRef } from 'react';

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
  
  // Data URLs and Blobs don't need caching
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;

  // External URLs (e.g. s4.anilist.co): Return directly to avoid CORS fetch block
  if (isExternalUrl(src)) {
    return src;
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

      // 3. Fetch from same-origin network and store in Cache Storage
      const response = await fetch(src);

      if (response.ok) {
        // Clone response before consuming for cache
        await cache.put(src, response.clone());
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        memoryBlobCache.set(src, blobUrl);
        return blobUrl;
      }
    } catch (err) {
      // Fallback gracefully to direct source
      return src;
    }
  }

  return src;
}

/**
 * CachedImage Component
 * - Implements native lazy-loading (loading="lazy", decoding="async")
 * - Retrieves from Memory / Browser Cache Storage for local images
 * - Uses native browser image loading without CORS violations for external images
 * - Displays a skeleton shimmer while loading
 * - Preserves layout stability (prevents cumulative layout shifts)
 */
export default function CachedImage({
  src,
  alt = '',
  className = '',
  style = {},
  loading = 'lazy',
  fallbackSrc = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
  onLoad,
  ...props
}) {
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!src) return fallbackSrc;
    if (src.startsWith('data:') || src.startsWith('blob:') || isExternalUrl(src)) return src;
    if (memoryBlobCache.has(src)) return memoryBlobCache.get(src);
    return '';
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    setHasError(false);

    if (!src) {
      setResolvedSrc(fallbackSrc);
      return;
    }

    // Direct resolution for external URLs or data/blob URLs
    if (src.startsWith('data:') || src.startsWith('blob:') || isExternalUrl(src)) {
      setResolvedSrc(src);
      return;
    }

    if (memoryBlobCache.has(src)) {
      setResolvedSrc(memoryBlobCache.get(src));
      return;
    }

    let isCurrent = true;

    getCachedImageUrl(src)
      .then((url) => {
        if (isMountedRef.current && isCurrent) {
          setResolvedSrc(url || fallbackSrc);
        }
      })
      .catch(() => {
        if (isMountedRef.current && isCurrent) {
          setResolvedSrc(src || fallbackSrc);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [src, fallbackSrc]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentImgSrc = hasError ? fallbackSrc : (resolvedSrc || src || fallbackSrc);

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {/* Shimmer Placeholder while image is loading */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center pointer-events-none z-0">
          <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-transparent animate-spin" />
        </div>
      )}

      {/* Render Native HTML Image with Lazy Loading & Decoded Cache */}
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
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...props}
      />
    </div>
  );
}
