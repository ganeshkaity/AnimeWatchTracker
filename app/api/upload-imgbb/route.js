import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IMGBB_API_KEY = process.env.NEXT_SECRET_IMGBB_API_KEY || process.env.IMGBB_API_KEY || 'f836d90a7d863714c3ebfd67412a5cbf';

export async function POST(request) {
  let originalImage = null;

  try {
    const body = await request.json().catch(() => ({}));
    const { image } = body || {};
    originalImage = image;

    if (!image) {
      return NextResponse.json({ success: false, error: 'Image data or URL is required' }, { status: 400 });
    }

    let payload = image;

    // If image is a remote URL (e.g. from TMDB, AniList, MAL), download as base64 on server
    if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
      try {
        const imgRes = await fetch(image, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          payload = Buffer.from(arrayBuffer).toString('base64');
        } else {
          return NextResponse.json({ success: true, url: image, fallback: true });
        }
      } catch (dlErr) {
        return NextResponse.json({ success: true, url: image, fallback: true });
      }
    } else if (typeof image === 'string' && image.includes(',')) {
      // Strip data URL header if present (e.g. data:image/jpeg;base64,...)
      payload = image.split(',')[1];
    }

    // ── 1. PRIMARY: Upload to ImgBB ──────────────────────────────────────────
    try {
      const formData = new FormData();
      formData.append('image', payload);

      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(12000)
      });

      // Safely read response as text to never crash on HTML error pages or empty bodies
      const rawText = await imgbbRes.text().catch(() => '');
      if (rawText && rawText.trim().startsWith('{')) {
        const data = JSON.parse(rawText);
        if (data.success && data.data && data.data.url) {
          return NextResponse.json({
            success: true,
            url: data.data.url,
            displayUrl: data.data.display_url || data.data.url,
            provider: 'imgbb'
          });
        }
      }
    } catch (_) {
      // Non-fatal, continue to secondary backup
    }

    // ── 2. SECONDARY: Upload to FreeImage.host (Chevereto API) ──────────────
    try {
      const freeForm = new FormData();
      freeForm.append('key', '6d207e02198a847aa98d0a2a901485a5');
      freeForm.append('action', 'upload');
      freeForm.append('source', payload);
      freeForm.append('format', 'json');

      const freeRes = await fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: freeForm,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(12000)
      });

      const freeText = await freeRes.text().catch(() => '');
      if (freeText && freeText.trim().startsWith('{')) {
        const freeData = JSON.parse(freeText);
        if (freeData?.status_code === 200 && freeData?.image?.url) {
          return NextResponse.json({
            success: true,
            url: freeData.image.url,
            displayUrl: freeData.image.display_url || freeData.image.url,
            provider: 'freeimage'
          });
        }
      }
    } catch (_) {
      // Non-fatal, continue to final fallback
    }

    // ── 3. FINAL SAFE FALLBACK: Return original image URL if available ────────
    if (typeof originalImage === 'string' && (originalImage.startsWith('http://') || originalImage.startsWith('https://'))) {
      return NextResponse.json({ success: true, url: originalImage, fallback: true });
    }

    return NextResponse.json({ success: false, error: 'All image upload providers failed' }, { status: 500 });

  } catch (err) {
    if (typeof originalImage === 'string' && (originalImage.startsWith('http://') || originalImage.startsWith('https://'))) {
      return NextResponse.json({ success: true, url: originalImage, fallback: true });
    }

    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
