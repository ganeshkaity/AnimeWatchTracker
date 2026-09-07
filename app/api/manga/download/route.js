import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get('path');

    if (!rawPath) {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }

    if (rawPath.indexOf('\0') !== -1) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
    }

    const resolvedPath = path.resolve(rawPath.trim());
    const ext = path.extname(resolvedPath).toLowerCase();

    if (ext !== '.pdf') {
      return NextResponse.json({ success: false, error: 'Only PDF files can be downloaded' }, { status: 403 });
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const stat = fs.statSync(resolvedPath);
    const filename = path.basename(resolvedPath);
    const fileStream = fs.createReadStream(resolvedPath);

    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[manga/download] Download error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
