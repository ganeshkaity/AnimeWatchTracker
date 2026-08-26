import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 'f836d90a7d863714c3ebfd67412a5cbf';

export async function POST(request) {
  try {
    const body = await request.json();
    const { image } = body || {};

    if (!image) {
      return NextResponse.json({ success: false, error: 'Image data or URL is required' }, { status: 400 });
    }

    let payload = image;

    // If image is a remote URL (e.g. from AniList, MAL, Kitsu), download as base64 on server to bypass CORS and ad-blockers
    if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
      try {
        const imgRes = await fetch(image, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          payload = Buffer.from(arrayBuffer).toString('base64');
        } else {
          // If remote image download fails, return original URL directly as safe fallback
          return NextResponse.json({ success: true, url: image, fallback: true });
        }
      } catch (dlErr) {
        console.warn('[upload-imgbb] Server download failed, returning original URL:', dlErr.message);
        return NextResponse.json({ success: true, url: image, fallback: true });
      }
    } else if (typeof image === 'string' && image.includes(',')) {
      // Strip data URL header if present
      payload = image.split(',')[1];
    }

    // Now upload to ImgBB from server side (no client-side ad blocker or CORS issues)
    const formData = new FormData();
    formData.append('image', payload);

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000)
    });

    const data = await imgbbRes.json();

    if (data.success && data.data && data.data.url) {
      return NextResponse.json({
        success: true,
        url: data.data.url,
        displayUrl: data.data.display_url || data.data.url,
        deleteUrl: data.data.delete_url || ''
      });
    }

    // If ImgBB returns an error or rate limit, fallback to the original image URL if it was an HTTP link
    if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
      return NextResponse.json({ success: true, url: image, fallback: true });
    }

    return NextResponse.json(
      { success: false, error: data.error?.message || 'ImgBB upload rejected' },
      { status: 500 }
    );

  } catch (err) {
    console.error('[upload-imgbb error]', err);
    // If request failed and we have an http URL, return it safely
    try {
      const body = await request.clone().json();
      if (body?.image && typeof body.image === 'string' && body.image.startsWith('http')) {
        return NextResponse.json({ success: true, url: body.image, fallback: true });
      }
    } catch {}

    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
