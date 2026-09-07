"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import MangaDetail from '../../pages/MangaDetail';

export default function MangaPage() {
  const params = useParams();
  const router = useRouter();
  const mangaId = params?.slug;

  return (
    <div className="min-h-screen text-white bg-[#0d1117]">
      <MangaDetail
        mangaId={mangaId}
        onBack={() => router.push('/')}
        onReadChapter={(chapter) => {
          router.push(
            `/reader/${mangaId}?chapter=${encodeURIComponent(chapter.id || chapter.name)}&path=${encodeURIComponent(chapter.filePath)}&chapterTitle=${encodeURIComponent(chapter.name || '')}`
          );
        }}
      />
    </div>
  );
}
