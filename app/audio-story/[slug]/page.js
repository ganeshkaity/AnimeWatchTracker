"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import AudioStoryDetail from '../../pages/AudioStoryDetail';

export default function AudioStoryPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = params?.slug;

  return (
    <div className="min-h-screen text-white bg-[#07090f]">
      <AudioStoryDetail
        storyId={storyId}
        onBack={() => router.push('/')}
        onPlayTrack={(trackId) => {
          router.push(`/audio-player/${encodeURIComponent(storyId)}?ep=${encodeURIComponent(trackId)}`);
        }}
      />
    </div>
  );
}
