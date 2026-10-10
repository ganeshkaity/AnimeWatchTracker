# Project Structure

```
watchanime/
├── app
│   ├── [slug]
│   │   └── page.js
│   ├── anime
│   │   └── [slug]
│   │       └── page.js
│   ├── animes
│   │   └── page.js
│   ├── api
│   │   ├── anime
│   │   │   ├── details
│   │   │   │   └── route.js
│   │   │   └── search
│   │   │       └── route.js
│   │   ├── anime-covers
│   │   │   └── route.js
│   │   ├── anime-rating
│   │   │   └── route.js
│   │   ├── audio-story
│   │   │   ├── embedded-art
│   │   │   │   └── route.js
│   │   │   └── scan
│   │   │       └── route.js
│   │   ├── close-vlc
│   │   │   └── route.js
│   │   ├── download-image
│   │   │   └── route.js
│   │   ├── image
│   │   │   └── route.js
│   │   ├── image-base64
│   │   │   └── route.js
│   │   ├── manage-folder
│   │   │   └── route.js
│   │   ├── manga
│   │   │   ├── details
│   │   │   │   └── route.js
│   │   │   ├── download
│   │   │   │   └── route.js
│   │   │   ├── scan
│   │   │   │   └── route.js
│   │   │   ├── search
│   │   │   │   └── route.js
│   │   │   └── stream
│   │   │       └── route.js
│   │   ├── manga-covers
│   │   │   └── route.js
│   │   ├── manga-rating
│   │   │   └── route.js
│   │   ├── media
│   │   │   ├── [mediaId]
│   │   │   │   ├── metadata
│   │   │   │   │   └── route.js
│   │   │   │   ├── stream
│   │   │   │   │   └── route.js
│   │   │   │   └── subtitles
│   │   │   │       └── route.js
│   │   │   ├── health
│   │   │   │   └── route.js
│   │   │   └── resolve
│   │   │       └── route.js
│   │   ├── movies
│   │   │   ├── details
│   │   │   │   └── route.js
│   │   │   ├── search
│   │   │   │   └── route.js
│   │   │   ├── select-file
│   │   │   │   └── route.js
│   │   │   └── verify-file
│   │   │       └── route.js
│   │   ├── play
│   │   │   └── route.js
│   │   ├── scan
│   │   │   └── route.js
│   │   ├── select-folder
│   │   │   └── route.js
│   │   ├── select-image
│   │   │   └── route.js
│   │   ├── stream
│   │   │   ├── host
│   │   │   │   └── route.js
│   │   │   ├── library
│   │   │   │   └── route.js
│   │   │   ├── network
│   │   │   │   └── route.js
│   │   │   ├── pair
│   │   │   │   └── route.js
│   │   │   ├── ping
│   │   │   │   └── route.js
│   │   │   └── store.js
│   │   ├── top-rated
│   │   │   └── route.js
│   │   ├── upload-imgbb
│   │   │   └── route.js
│   │   ├── video
│   │   │   ├── keyframe
│   │   │   │   └── route.js
│   │   │   ├── metadata
│   │   │   │   └── route.js
│   │   │   ├── stream
│   │   │   │   └── route.js
│   │   │   └── subtitles
│   │   │       └── route.js
│   │   ├── vlc-status
│   │   │   └── route.js
│   │   ├── watchlist
│   │   │   ├── details
│   │   │   │   └── route.js
│   │   │   ├── search
│   │   │   │   └── route.js
│   │   │   └── seasons
│   │   │       └── route.js
│   │   └── youtube
│   │       ├── close-stream
│   │       │   └── route.js
│   │       ├── duration
│   │       │   └── route.js
│   │       ├── playlist
│   │       │   └── route.js
│   │       ├── qualities
│   │       │   └── route.js
│   │       └── stream
│   │           └── route.js
│   ├── audio-player
│   │   └── [slug]
│   │       └── page.js
│   ├── audio-story
│   │   └── [slug]
│   │       └── page.js
│   ├── components
│   │   ├── PDFReader
│   │   │   ├── AnnotationLayer.jsx
│   │   │   ├── AnnotationToolbar.jsx
│   │   │   ├── BookmarkPanel.jsx
│   │   │   ├── GestureManager.js
│   │   │   ├── OutlineSidebar.jsx
│   │   │   ├── PageRenderer.jsx
│   │   │   ├── PDFDocument.jsx
│   │   │   ├── PDFReader.jsx
│   │   │   ├── pdfUtils.js
│   │   │   ├── ReaderToolbar.jsx
│   │   │   ├── SearchPanel.jsx
│   │   │   ├── SettingsPanel.jsx
│   │   │   └── ThumbnailSidebar.jsx
│   │   ├── player
│   │   │   ├── AudioStoryPlayer.js
│   │   │   ├── MediaServerPlayer.js
│   │   │   └── YtDlpPlayer.js
│   │   ├── AddMovieModal.js
│   │   ├── AddWatchlistModal.js
│   │   ├── AddWebseriesModal.js
│   │   ├── AnimeCoverSearch.js
│   │   ├── AssignEpisodesModal.js
│   │   ├── CookieConsent.js
│   │   ├── EditAnimeModal.js
│   │   ├── EditMovieModal.js
│   │   ├── EditWatchlistModal.js
│   │   ├── EditWebseriesModal.js
│   │   ├── MangaCoverSearch.js
│   │   ├── MediaPreviewModal.js
│   │   └── TransferWatchlistModal.js
│   ├── context
│   │   ├── AuthContext.js
│   │   └── OfflineContext.js
│   ├── health
│   │   └── route.js
│   ├── lib
│   │   ├── fanartUtils.js
│   │   ├── mediaRegistry.js
│   │   └── youtubeCacheManager.js
│   ├── manga
│   │   └── [slug]
│   │       └── page.js
│   ├── media
│   │   └── [mediaId]
│   │       ├── metadata
│   │       │   └── route.js
│   │       ├── stream
│   │       │   └── route.js
│   │       └── subtitles
│   │           └── route.js
│   ├── movies
│   │   ├── [slug]
│   │   │   └── page.js
│   │   └── page.js
│   ├── notes
│   │   ├── [id]
│   │   │   └── page.js
│   │   └── page.js
│   ├── pages
│   │   ├── AnimeDetail.js
│   │   ├── AnimesLibrary.js
│   │   ├── AudioStoryDetail.js
│   │   ├── AudioStoryPlayerContainer.js
│   │   ├── Dashboard.js
│   │   ├── FirebaseSetup.js
│   │   ├── Login.js
│   │   ├── MangaDetail.js
│   │   ├── MediaServerPlayerContainer.js
│   │   ├── MovieDetail.js
│   │   ├── MoviesLibrary.js
│   │   ├── Stream.js
│   │   ├── WatchlistDetail.js
│   │   ├── WatchlistLibrary.js
│   │   ├── WebseriesDetail.js
│   │   ├── WebseriesLibrary.js
│   │   ├── YoutubePlayerContainer.js
│   │   └── YtDlpPlayerContainer.js
│   ├── player
│   │   └── [playerType]
│   │       └── [slug]
│   │           └── page.js
│   ├── reader
│   │   └── [slug]
│   │       └── page.js
│   ├── stream
│   │   └── page.js
│   ├── utils
│   │   ├── imageCache.js
│   │   ├── indexedDBStore.js
│   │   ├── localStore.js
│   │   ├── parser.js
│   │   └── syncEngine.js
│   ├── watchlist
│   │   ├── [slug]
│   │   │   └── page.js
│   │   └── page.js
│   ├── web-series
│   │   ├── [slug]
│   │   │   └── page.js
│   │   └── page.js
│   ├── webseries
│   │   ├── [slug]
│   │   │   └── page.js
│   │   └── page.js
│   ├── firebase.js
│   ├── globals.css
│   ├── icon.png
│   ├── layout.js
│   ├── not-found.js
│   └── page.js
├── public
│   ├── logo.png
│   └── pdf.worker.min.js
├── cookies.txt
├── firestore.db
├── logo.png
├── main.js
├── next.config.mjs
├── package-lock.json
├── package.json
├── postcss.config.js
├── structure.md
└── tailwind.config.js
```
