import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get('path');

    if (!rawPath) {
      return NextResponse.json({ success: false, error: 'File path is required' }, { status: 400 });
    }

    // Security: Reject null bytes or empty strings
    if (rawPath.indexOf('\0') !== -1 || !rawPath.trim()) {
      return NextResponse.json({ success: false, error: 'Invalid file path' }, { status: 400 });
    }

    // Normalize and resolve canonical path
    const resolvedPath = path.resolve(rawPath.trim());

    // Security: Extension validation
    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== '.pdf') {
      return NextResponse.json({ success: false, error: 'Only PDF files are supported' }, { status: 403 });
    }

    // Check existence and ensure it is a file
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ success: false, error: 'PDF file not found on disk' }, { status: 404 });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return NextResponse.json({ success: false, error: 'Specified path is not a valid file' }, { status: 400 });
    }

    const fileSize = stat.size;
    const range = request.headers.get('range');
    const filename = path.basename(resolvedPath);

    // Common security and performance headers
    const baseHeaders = {
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'X-Content-Type-Options': 'nosniff',
    };

    // ── HTTP 206 Partial Content (Range Request) ──────────────────────────
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || (parts[1] && (isNaN(end) || start > end))) {
        return new Response('Requested Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(resolvedPath, { start, end });

      return new Response(fileStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
        },
      });
    }

    // ── Full File Stream (No Range Header) ────────────────────────────────
    const fileStream = fs.createReadStream(resolvedPath);
    return new Response(fileStream, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(fileSize),
      },
    });
  } catch (err) {
    console.error('[manga/stream] Error streaming PDF:', err);
    return NextResponse.json({ success: false, error: 'Internal server error while streaming PDF' }, { status: 500 });
  }
}
