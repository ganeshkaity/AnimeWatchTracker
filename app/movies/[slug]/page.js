"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import MovieDetail from '../../pages/MovieDetail';

export default function MoviePage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params?.slug;

  return (
    <div className="min-h-screen text-white bg-[#07090f]">
      <MovieDetail
        movieId={movieId}
        onBack={() => router.push('/')}
        onPlayMovie={(movie, playerType) => {
          if (playerType === 'mediaserver' || !playerType) {
            router.push(`/player/mediaserver/${encodeURIComponent(movie.id)}?type=movie`);
          }
        }}
      />
    </div>
  );
}
