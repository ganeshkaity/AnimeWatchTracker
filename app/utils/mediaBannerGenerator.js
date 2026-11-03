/**
 * mediaBannerGenerator.js
 * 
 * Generates rich, cinematic 16:9 media preview banners (1280x720) matching Image 1:
 * - High-res backdrop with smooth dark gradient vignetting on the left
 * - Title logo (or stylized typography)
 * - Category / Genre tags: | THRILLER | ACTION
 * - Metadata row: Rating (★), Duration (⏱), Year (📅), Age Rating (U/A 13+)
 * - Synopsis preview text
 * - Cinematic action pills: [ ▶ WATCH NOW ] [ DETAIL ❯ ]
 * 
 * Uploads the generated banner to ImgBB using NEXT_SECRET_IMGBB_API_KEY
 * and returns the public image URL for FCM push notifications.
 */

/**
 * Loads an image into an HTMLImageElement safely with crossOrigin enabled.
 */
function loadImageSafe(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      return reject(new Error('No image source provided'));
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // If direct load fails (due to CORS or remote CDN restrictions), load through our local download-image proxy
      if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))) {
        const proxyImg = new Image();
        proxyImg.crossOrigin = 'anonymous';
        proxyImg.onload = () => resolve(proxyImg);
        proxyImg.onerror = () => reject(new Error('Proxy image load failed: ' + src));
        proxyImg.src = `/api/download-image?url=${encodeURIComponent(src)}`;
      } else {
        reject(new Error('Failed to load image: ' + src));
      }
    };
    img.src = src;
  });
}

function formatDuration(duration) {
  if (!duration) return '';
  if (typeof duration === 'string' && (duration.includes('h') || duration.includes('m') || duration.includes('Ep'))) {
    return duration;
  }
  const mins = parseInt(duration, 10);
  if (isNaN(mins) || mins <= 0) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  if (!text) return;
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      lineCount++;
      if (lineCount >= maxLines) {
        ctx.fillText(line.trim() + '...', x, y);
        return;
      }
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates the cinematic 16:9 banner on a client-side HTML5 canvas
 * and uploads to ImgBB.
 */
export async function generateCinematicBanner({
  title = 'WatchAnime Feature',
  backdropUrl,
  posterUrl,
  logoUrl,
  genres = [],
  rating,
  duration,
  year,
  ageRating,
  overview = '',
  mediaType = 'movie',
} = {}) {
  if (typeof window === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fill base dark background
    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Backdrop Image
    const backgroundSrc = backdropUrl || posterUrl;
    if (backgroundSrc) {
      try {
        const bgImg = await loadImageSafe(backgroundSrc);
        // Draw image covering canvas (object-fit: cover)
        const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height);
        const x = (canvas.width - bgImg.width * scale) / 2;
        const y = (canvas.height - bgImg.height * scale) / 2;
        ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
      } catch (err) {
        console.warn('[BannerGenerator] Backdrop load fallback:', err.message);
      }
    }

    // 3. Cinematic Vignette & Gradient Overlays (exact match to Image 1)
    // Left-to-right gradient for text legibility
    const leftGrad = ctx.createLinearGradient(0, 0, canvas.width * 0.75, 0);
    leftGrad.addColorStop(0, 'rgba(7, 9, 15, 0.96)');
    leftGrad.addColorStop(0.35, 'rgba(7, 9, 15, 0.88)');
    leftGrad.addColorStop(0.58, 'rgba(7, 9, 15, 0.55)');
    leftGrad.addColorStop(0.82, 'rgba(7, 9, 15, 0.15)');
    leftGrad.addColorStop(1, 'rgba(7, 9, 15, 0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Bottom-to-top subtle gradient
    const bottomGrad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * 0.5);
    bottomGrad.addColorStop(0, 'rgba(7, 9, 15, 0.9)');
    bottomGrad.addColorStop(0.6, 'rgba(7, 9, 15, 0.3)');
    bottomGrad.addColorStop(1, 'rgba(7, 9, 15, 0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 4. Draw Logo or Stylized Title (Left Column)
    const startX = 64;
    let currentY = 190;

    let logoDrawn = false;
    if (logoUrl) {
      try {
        const logoImg = await loadImageSafe(logoUrl);
        const maxLogoW = 320;
        const maxLogoH = 110;
        const logoRatio = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
        const logoW = logoImg.width * logoRatio;
        const logoH = logoImg.height * logoRatio;

        ctx.drawImage(logoImg, startX, currentY - logoH + 40, logoW, logoH);
        currentY += 60;
        logoDrawn = true;
      } catch (_) {}
    }

    if (!logoDrawn) {
      // Draw stylized glowing title
      ctx.font = '900 42px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 16;
      ctx.fillText(title, startX, currentY);
      ctx.shadowBlur = 0;
      currentY += 28;
    }

    // 5. Category / Genre Tags (e.g. | THRILLER   | ACTION)
    const genreList = Array.isArray(genres)
      ? genres
      : typeof genres === 'string'
      ? genres.split(',').map((g) => g.trim())
      : [];

    if (genreList.length > 0) {
      currentY += 24;
      ctx.font = '800 13px Inter, sans-serif';
      ctx.fillStyle = '#e2e8f0';

      const tagsText = genreList
        .slice(0, 3)
        .map((g) => `| ${g.toUpperCase()}`)
        .join('    ');
      ctx.fillText(tagsText, startX, currentY);
    }

    // 6. Metadata Row: Rating (★), Duration (⏱), Year (📅), Age Rating (🔞)
    currentY += 34;
    let metaX = startX;

    // Rating
    if (rating) {
      const parsedRating = typeof rating === 'number' ? rating.toFixed(1) : String(rating);
      ctx.font = 'bold 15px Inter, sans-serif';
      ctx.fillStyle = '#eab308'; // Amber-500
      ctx.fillText(`★ ${parsedRating}`, metaX, currentY);
      metaX += ctx.measureText(`★ ${parsedRating}`).width + 22;
    }

    // Duration / Episodes
    const formattedDuration = formatDuration(duration);
    if (formattedDuration) {
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#fde047'; // Yellow-300
      ctx.fillText(`⏱ ${formattedDuration}`, metaX, currentY);
      metaX += ctx.measureText(`⏱ ${formattedDuration}`).width + 22;
    }

    // Year
    const yearStr = year ? String(year).slice(0, 4) : '';
    if (yearStr) {
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#38bdf8'; // Sky-400
      ctx.fillText(`📅 ${yearStr}`, metaX, currentY);
      metaX += ctx.measureText(`📅 ${yearStr}`).width + 22;
    }

    // Age Rating
    const safeAgeRating = ageRating || (mediaType === 'anime' ? 'U/A 13+' : 'PG-13');
    if (safeAgeRating) {
      ctx.font = '800 13px Inter, sans-serif';
      ctx.fillStyle = '#fb7185'; // Rose-400
      ctx.fillText(safeAgeRating, metaX, currentY);
    }

    // 7. Overview Text (Word wrapped, max 3 lines)
    if (overview) {
      currentY += 32;
      ctx.font = 'normal 13px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8'; // Slate-400
      wrapText(ctx, overview, startX, currentY, 490, 21, 3);
      currentY += 56;
    } else {
      currentY += 28;
    }

    // 8. Action Pills / Buttons (Matching Image 1)
    currentY += 28;

    // Pill 1: Orange/Red Gradient "▶ WATCH NOW"
    const btn1Width = 145;
    const btn1Height = 40;
    const btn1Grad = ctx.createLinearGradient(startX, 0, startX + btn1Width, 0);
    btn1Grad.addColorStop(0, '#f97316'); // Orange-500
    btn1Grad.addColorStop(1, '#e11d48'); // Rose-600

    ctx.save();
    ctx.shadowColor = 'rgba(234, 88, 12, 0.4)';
    ctx.shadowBlur = 14;
    drawRoundedRect(ctx, startX, currentY, btn1Width, btn1Height, 20);
    ctx.fillStyle = btn1Grad;
    ctx.fill();
    ctx.restore();

    ctx.font = '800 12px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('▶  WATCH NOW', startX + 22, currentY + 25);

    // Pill 2: Glass Translucent "DETAIL ❯"
    const btn2X = startX + btn1Width + 14;
    const btn2Width = 105;
    const btn2Height = 40;

    ctx.save();
    drawRoundedRect(ctx, btn2X, currentY, btn2Width, btn2Height, 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
    ctx.restore();

    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('DETAIL  ❯', btn2X + 22, currentY + 25);

    // 9. Export to JPEG Base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    // 10. Upload to ImgBB via our local API route (uses NEXT_SECRET_IMGBB_API_KEY)
    const uploadRes = await fetch('/api/upload-imgbb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });

    const uploadData = await uploadRes.json();
    if (uploadData && uploadData.url) {
      console.log('[BannerGenerator] Uploaded cinematic banner to ImgBB:', uploadData.url);
      return uploadData.url;
    }

    // If ImgBB failed, fallback to original backdrop URL
    return backdropUrl || posterUrl || null;
  } catch (err) {
    console.warn('[BannerGenerator] Banner generation error:', err);
    return backdropUrl || posterUrl || null;
  }
}

