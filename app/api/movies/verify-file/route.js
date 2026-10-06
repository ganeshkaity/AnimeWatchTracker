import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const filePath = body?.filePath;

    if (!filePath) {
      return NextResponse.json(
        { success: false, exists: false, error: 'File path is required' },
        { status: 400 }
      );
    }

    const cleanPath = filePath.trim();
    const exists = fs.existsSync(cleanPath);

    if (!exists) {
      return NextResponse.json({
        success: true,
        exists: false,
        error: 'File does not exist on disk',
      });
    }

    const stats = fs.statSync(cleanPath);
    if (!stats.isFile()) {
      return NextResponse.json({
        success: true,
        exists: false,
        error: 'Path is a directory, not a video file',
      });
    }

    const fileName = path.basename(cleanPath);
    const ext = path.extname(cleanPath).toLowerCase();
    const supportedExts = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'];

    return NextResponse.json({
      success: true,
      exists: true,
      fileName,
      extension: ext,
      fileSize: stats.size,
      isSupportedVideo: supportedExts.includes(ext),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      exists: false,
      error: err.message,
    });
  }
}
