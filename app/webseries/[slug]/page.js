"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import WebseriesDetail from '../../pages/WebseriesDetail';

export default function WebseriesPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params?.slug;

  return (
    <div className="min-h-screen text-white bg-[#07090f]">
      <WebseriesDetail
        seriesId={seriesId}
        onBack={() => router.push('/webseries')}
      />
    </div>
  );
}
