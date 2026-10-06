/**
 * Fanart.tv Media URL Utilities
 *
 * Fanart.tv CDN supports three primary image path tiers under assets.fanart.tv:
 * 1. /preview/    - Tiny optimized thumbnails (20-30 KB) perfect for modal result grids / pickers.
 * 2. /bigpreview/ - Medium-large preview (50-80 KB) perfect for sliding banner title logo art.
 * 3. /fanart/     - Full-resolution original artwork (often 2-4 MB) for sharp backdrop banners.
 *
 * NOTE: These transformations ONLY apply to Fanart.tv URLs (domain matching fanart.tv).
 * All other providers (AniList, TMDB, ImgBB, local files) are returned untouched.
 */

export const isFanartUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.toLowerCase().includes('fanart.tv');
};

/**
 * Returns the /preview/ version of a Fanart.tv URL for fast thumbnail grids in modals.
 * Non-fanart URLs are returned as-is.
 */
export const toFanartPreview = (url) => {
  if (!isFanartUrl(url)) return url;
  return url.replace(/\/(fanart|bigpreview)\//gi, '/preview/');
};

/**
 * Returns the /bigpreview/ version of a Fanart.tv URL for banner title logos & card posters.
 * Non-fanart URLs are returned as-is.
 */
export const toFanartBigPreview = (url) => {
  if (!isFanartUrl(url)) return url;
  return url.replace(/\/(fanart|preview)\//gi, '/bigpreview/');
};

/**
 * Returns the full-sized original /fanart/ version for crisp hero backdrop banners.
 * Non-fanart URLs are returned as-is.
 */
export const toFanartFull = (url) => {
  if (!isFanartUrl(url)) return url;
  return url.replace(/\/(preview|bigpreview)\//gi, '/fanart/');
};
