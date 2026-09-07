"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getLocalManga, getLocalChapters } from '../../utils/localStore';
import { naturalChapterSort } from '../../pages/MangaDetail';
import { Loader2 } from 'lucide-react';

const PDFReader = dynamic(() => import('../../components/PDFReader/PDFReader'), {
  loading: () => (
    <div className="fixed inset-0 bg-[#0d1117] flex flex-col items-center justify-center text-white gap-3">
      <Loader2 className="animate-spin text-purple-500" size={36} />
      <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">
        Launching Manga Reader...
      </span>
    </div>
  ),
  ssr: false,
});

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const mangaId = params?.slug;
  const filePathParam = searchParams.get('path');
  const chapterIdParam = searchParams.get('chapter');
  const titleParam = searchParams.get('title');
  const chapterTitleParam = searchParams.get('chapterTitle');

  const [resolvedPath, setResolvedPath] = useState(filePathParam || '');
  const [resolvedTitle, setResolvedTitle] = useState(titleParam || '');
  const [resolvedChapterTitle, setResolvedChapterTitle] = useState(chapterTitleParam || '');
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(!filePathParam);

  useEffect(() => {
    if (mangaId) {
      const chs = getLocalChapters(mangaId);
      if (chs && chs.length > 0) {
        const sorted = [...chs].sort((a, b) => naturalChapterSort(a, b, true));
        setChapters(sorted);
      }
    }
  }, [mangaId]);

  useEffect(() => {
    if (filePathParam) {
      setResolvedPath(filePathParam);
      if (titleParam) setResolvedTitle(titleParam);
      if (chapterTitleParam) setResolvedChapterTitle(chapterTitleParam);
      setLoading(false);
      return;
    }

    if (mangaId) {
      const manga = getLocalManga(mangaId);
      const chs = getLocalChapters(mangaId);

      if (manga) {
        setResolvedTitle(manga.title || 'Manga');
      }

      if (chs && chs.length > 0) {
        const sorted = [...chs].sort((a, b) => naturalChapterSort(a, b, true));
        setChapters(sorted);
        const targetChapter = chapterIdParam
          ? sorted.find((c) => c.id === chapterIdParam) || sorted[0]
          : sorted[0];

        if (targetChapter) {
          setResolvedPath(targetChapter.filePath);
          setResolvedChapterTitle(targetChapter.name || targetChapter.title || '');
        }
      }
      setLoading(false);
    }
  }, [mangaId, filePathParam, chapterIdParam, titleParam, chapterTitleParam]);

  // Compute current chapter index to determine previous and next chapters
  const currentChapterIndex = chapters.findIndex((c) => 
    (chapterIdParam && c.id === chapterIdParam) || 
    (resolvedPath && (c.filePath === resolvedPath || c.filePath?.replace(/\\/g, '/') === resolvedPath?.replace(/\\/g, '/')))
  );

  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  const handleOpenChapter = (targetCh) => {
    if (!targetCh) return;
    setLoading(true);
    setResolvedPath(targetCh.filePath);
    setResolvedChapterTitle(targetCh.name || targetCh.title || '');
    router.push(`/reader/${mangaId}?chapter=${encodeURIComponent(targetCh.id || targetCh.name)}&path=${encodeURIComponent(targetCh.filePath)}&title=${encodeURIComponent(resolvedTitle)}&chapterTitle=${encodeURIComponent(targetCh.name || targetCh.title || '')}`);
  };

  if (loading || !resolvedPath) {
    return (
      <div className="fixed inset-0 bg-[#0d1117] flex flex-col items-center justify-center text-white gap-4 p-6">
        <Loader2 className="animate-spin text-purple-500" size={36} />
        <span className="text-xs text-gray-400 font-mono">Loading chapter...</span>
      </div>
    );
  }

  const streamUrl = `/api/manga/stream?path=${encodeURIComponent(resolvedPath)}`;
  const docId = chapterIdParam || `manga_${mangaId}_${encodeURIComponent(resolvedPath.split(/[\\/]/).pop())}`;

  return (
    <div className="fixed inset-0 bg-[#0d1117] overflow-hidden">
      <PDFReader
        key={resolvedPath}
        sourceUrl={streamUrl}
        documentId={docId}
        mangaId={mangaId}
        title={resolvedTitle || 'Manga Reader'}
        chapterTitle={resolvedChapterTitle}
        onPrevChapter={prevChapter ? () => handleOpenChapter(prevChapter) : undefined}
        onNextChapter={nextChapter ? () => handleOpenChapter(nextChapter) : undefined}
        hasPrevChapter={!!prevChapter}
        hasNextChapter={!!nextChapter}
        prevChapterTitle={prevChapter?.name || prevChapter?.title || ''}
        nextChapterTitle={nextChapter?.name || nextChapter?.title || ''}
        onBack={() => {
          if (mangaId) router.push(`/manga/${mangaId}`);
          else router.push('/');
        }}
      />
    </div>
  );
}
