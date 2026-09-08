"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import PageRenderer from './PageRenderer';
import { attachGestureListeners } from './GestureManager';

export default function PDFDocument({
  pdfDoc,
  totalPages,
  currentPage,
  onPageChange,
  scale,
  onScaleChange,
  rotation = 0,
  pageRotations = {},
  settings,
  activeTool,
  toolColor,
  toolThickness,
  toolOpacity,
  eraserType,
  annotationsMap = {},
  onChangeAnnotations,
  searchQuery,
  centerAlign = true,
  jumpTarget = null,
}) {
  const containerRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const pendingZoomAnchorRef = useRef(null);
  const currentCenterSnapshotRef = useRef(null);
  const prevScaleRef = useRef(scale);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pageDimensions, setPageDimensions] = useState({});
  const [baseAspectRatio, setBaseAspectRatio] = useState(1.414);

  // Pre-fetch Page 1 dimensions to give all placeholder pages exact aspect ratio (0 layout shift)
  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;
    pdfDoc.getPage(1).then((page) => {
      if (isCancelled) return;
      const vp = page.getViewport({ scale: 1.0 });
      if (vp.width && vp.height) {
        setBaseAspectRatio(vp.height / vp.width);
      }
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, [pdfDoc]);

  // Track rendered page size
  const handlePageRendered = useCallback((pageNum, size) => {
    setPageDimensions((prev) => ({
      ...prev,
      [pageNum]: size,
    }));
  }, []);

  // Determine which pages to render based on readingMode
  const visiblePages = useMemo(() => {
    if (!totalPages || totalPages < 1) return [];

    if (settings.readingMode === 'vertical') {
      // In webtoon / vertical scroll mode, all pages exist in the continuous flow
      const list = [];
      for (let i = 1; i <= totalPages; i++) list.push(i);
      return list;
    }

    if (settings.readingMode === 'double') {
      // Two-page spread mode
      if (settings.coverPageOffset && currentPage === 1) {
        return [1];
      }

      let first = currentPage;
      if (settings.coverPageOffset) {
        if (currentPage % 2 !== 0) first = currentPage - 1;
      } else {
        if (currentPage % 2 === 0) first = currentPage - 1;
      }

      const second = first + 1 <= totalPages ? first + 1 : null;
      if (settings.direction === 'rtl' && second) {
        return [second, first];
      }
      return second ? [first, second] : [first];
    }

    // Default Single Page mode
    return [currentPage];
  }, [totalPages, settings.readingMode, settings.coverPageOffset, settings.direction, currentPage]);

  // Reset pan ONLY when page changes in Single/Double mode (never in vertical mode to prevent scroll lagging)
  useEffect(() => {
    if (settings.readingMode === 'vertical') return;
    setPan({ x: 0, y: 0 });
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  }, [currentPage, settings.readingMode]);

  // Handle wheel navigation in single/double page mode
  const handleWheelScroll = useCallback((dir) => {
    if (settings.readingMode === 'vertical') return; // in vertical mode native scrolling handles it
    if (scale > 1.05) return;

    const step = settings.readingMode === 'double' ? 2 : 1;
    if (dir === 'next') {
      onPageChange(Math.min(totalPages, currentPage + step));
    } else {
      onPageChange(Math.max(1, currentPage - step));
    }
  }, [totalPages, currentPage, settings.readingMode, scale, onPageChange]);

  // Keep track of the page and fraction at the center of the viewport during reading
  const updateCenterSnapshot = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;

    const pageEls = container.querySelectorAll('[data-page-number]');
    for (let i = 0; i < pageEls.length; i++) {
      const rect = pageEls[i].getBoundingClientRect();
      if (rect.top <= centerY && rect.bottom >= centerY) {
        currentCenterSnapshotRef.current = {
          pageNum: pageEls[i].getAttribute('data-page-number'),
          fractionY: rect.height > 0 ? (centerY - rect.top) / rect.height : 0.5,
          fractionX: rect.width > 0 ? (centerX - rect.left) / rect.width : 0.5,
          anchorScreenX: centerX,
          anchorScreenY: centerY,
        };
        break;
      }
    }
  }, []);

  // Track active page and update viewport center snapshot on scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (isProgrammaticScrollRef.current) {
            ticking = false;
            return;
          }

          updateCenterSnapshot();

          if (settings.readingMode === 'vertical') {
            const containerRect = container.getBoundingClientRect();
            const targetY = containerRect.top + containerRect.height * 0.45;

            const pageEls = container.querySelectorAll('[data-page-number]');
            let foundPage = null;

            for (let i = 0; i < pageEls.length; i++) {
              const el = pageEls[i];
              const rect = el.getBoundingClientRect();
              if (rect.top <= targetY && rect.bottom >= targetY) {
                foundPage = parseInt(el.getAttribute('data-page-number'), 10);
                break;
              }
            }

            if (foundPage && foundPage !== currentPage) {
              onPageChange(foundPage);
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [settings.readingMode, currentPage, onPageChange, updateCenterSnapshot]);

  // Handle explicit jump requests (from top pill input, thumbnails, bookmarks, search)
  useEffect(() => {
    if (!jumpTarget || !containerRef.current) return;
    const targetPage = jumpTarget.page;

    if (settings.readingMode === 'vertical') {
      const container = containerRef.current;
      const doScroll = (el) => {
        if (!el) return;
        isProgrammaticScrollRef.current = true;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = elRect.top - containerRect.top + container.scrollTop - 75; // 75px clearance for header bar

        container.scrollTo({
          top: Math.max(0, offset),
          behavior: 'smooth',
        });

        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 700);
      };

      const targetEl = container.querySelector(`[data-page-number="${targetPage}"]`);
      if (targetEl) {
        doScroll(targetEl);
      } else {
        // Fallback in next animation frame if DOM element was just mounting
        window.requestAnimationFrame(() => {
          const el = container.querySelector(`[data-page-number="${targetPage}"]`);
          if (el) doScroll(el);
        });
      }
    } else {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  }, [jumpTarget, settings.readingMode]);

  // Mutable refs for gesture listener so listeners NEVER unmount/reset mid-gesture
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const panRef = useRef(pan);
  panRef.current = pan;

  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const centerAlignRef = useRef(centerAlign);
  centerAlignRef.current = centerAlign;

  // Capture anchor point before zoom (either mouse position or current center of viewport)
  const captureZoomAnchor = useCallback((center = null) => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const anchorX = (center && typeof center.clientX === 'number') ? center.clientX : (containerRect.left + containerRect.width / 2);
    const anchorY = (center && typeof center.clientY === 'number') ? center.clientY : (containerRect.top + containerRect.height / 2);

    const pageEls = container.querySelectorAll('[data-page-number]');
    if (pageEls.length === 0) return;

    let targetPage = null;
    let targetRect = null;

    for (let i = 0; i < pageEls.length; i++) {
      const rect = pageEls[i].getBoundingClientRect();
      if (rect.top <= anchorY && rect.bottom >= anchorY) {
        targetPage = pageEls[i];
        targetRect = rect;
        break;
      }
    }

    if (!targetPage) {
      let closestDist = Infinity;
      for (let i = 0; i < pageEls.length; i++) {
        const rect = pageEls[i].getBoundingClientRect();
        const dist = Math.abs((rect.top + rect.bottom) / 2 - anchorY);
        if (dist < closestDist) {
          closestDist = dist;
          targetPage = pageEls[i];
          targetRect = rect;
        }
      }
    }

    if (targetPage && targetRect) {
      pendingZoomAnchorRef.current = {
        pageNum: targetPage.getAttribute('data-page-number'),
        fractionY: targetRect.height > 0 ? (anchorY - targetRect.top) / targetRect.height : 0.5,
        fractionX: targetRect.width > 0 ? (anchorX - targetRect.left) / targetRect.width : 0.5,
        anchorScreenX: anchorX,
        anchorScreenY: anchorY,
      };
    }
  }, []);

  // Synchronously adjust scroll position during zoom changes so the image stays locked on screen
  useLayoutEffect(() => {
    if (prevScaleRef.current === scale) return;
    prevScaleRef.current = scale;

    const container = containerRef.current;
    if (!container) return;

    // Use specific cursor anchor if available, otherwise fall back to viewport center snapshot
    const anchor = pendingZoomAnchorRef.current || currentCenterSnapshotRef.current;
    pendingZoomAnchorRef.current = null;

    if (anchor && anchor.pageNum) {
      const targetEl = container.querySelector(`[data-page-number="${anchor.pageNum}"]`);
      if (targetEl) {
        isProgrammaticScrollRef.current = true;

        const newRect = targetEl.getBoundingClientRect();
        const currentPointY = newRect.top + anchor.fractionY * newRect.height;
        const currentPointX = newRect.left + anchor.fractionX * newRect.width;

        const diffY = currentPointY - anchor.anchorScreenY;
        const diffX = currentPointX - anchor.anchorScreenX;

        container.scrollTop += diffY;
        container.scrollLeft += diffX;

        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 120);
      }
    }
  }, [scale]);

  // Gestures setup — attached once per container, never reset during pinch/drag gestures
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const cleanup = attachGestureListeners(el, {
      getZoom: () => scaleRef.current,
      getPan: () => panRef.current,
      isZoomed: () => !centerAlignRef.current || scaleRef.current > 1.05,
      onZoomChange: (newZoom, center) => {
        captureZoomAnchor(center);
        onScaleChangeRef.current(newZoom);
      },
      onPanChange: (newPan) => {
        if (!centerAlignRef.current || settingsRef.current.readingMode !== 'vertical') {
          setPan(newPan);
        }
      },
      onWheelScroll: (dir) => handleWheelScroll(dir),
      onSwipePrev: () => {
        if (settingsRef.current.readingMode === 'vertical') return;
        if (settingsRef.current.direction === 'rtl') {
          onPageChangeRef.current(Math.min(totalPagesRef.current, currentPageRef.current + 1));
        } else {
          onPageChangeRef.current(Math.max(1, currentPageRef.current - 1));
        }
      },
      onSwipeNext: () => {
        if (settingsRef.current.readingMode === 'vertical') return;
        if (settingsRef.current.direction === 'rtl') {
          onPageChangeRef.current(Math.max(1, currentPageRef.current - 1));
        } else {
          onPageChangeRef.current(Math.min(totalPagesRef.current, currentPageRef.current + 1));
        }
      },
      onDoubleTap: () => {
        captureZoomAnchor();
        if (scaleRef.current > 1.2) {
          onScaleChangeRef.current(1.0);
          setPan({ x: 0, y: 0 });
        } else {
          onScaleChangeRef.current(1.8);
        }
      },
    });

    return cleanup;
  }, [handleWheelScroll, captureZoomAnchor]);

  // Edge click zones on mobile/desktop for navigation when select tool active
  const handleEdgeClick = (zone) => {
    if (activeTool !== 'select' || settings.readingMode === 'vertical') return;
    if (zone === 'left') {
      if (settings.direction === 'rtl') {
        onPageChange(Math.min(totalPages, currentPage + 1));
      } else {
        onPageChange(Math.max(1, currentPage - 1));
      }
    } else if (zone === 'right') {
      if (settings.direction === 'rtl') {
        onPageChange(Math.max(1, currentPage - 1));
      } else {
        onPageChange(Math.min(totalPages, currentPage + 1));
      }
    }
  };

  const bgColors = {
    dark: '#10141d',
    black: '#000000',
    sepia: '#231d16',
    light: '#2b313d',
  };

  // Pre-load active window: in Webtoon mode, keep 2 pages behind and 8 pages ahead actively loaded
  const PRELOAD_BEHIND = 2;
  const PRELOAD_AHEAD = 8;
  const minActive = Math.max(1, currentPage - PRELOAD_BEHIND);
  const maxActive = Math.min(totalPages, currentPage + PRELOAD_AHEAD);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-auto custom-scrollbar select-none overscroll-contain ${centerAlign ? 'flex' : 'block'}`}
      style={{
        backgroundColor: bgColors[settings.background] || '#10141d',
        touchAction: scale > 1.05 || !centerAlign ? 'none' : 'pan-y',
      }}
    >
      {/* Tap zones for quick reading navigation (Single/Double modes only) */}
      {scale <= 1.05 && settings.readingMode !== 'vertical' && centerAlign && (
        <>
          <div
            onClick={() => handleEdgeClick('left')}
            className="absolute left-0 top-16 bottom-20 w-16 md:w-24 z-20 cursor-w-resize opacity-0 hover:opacity-10 bg-white/5 transition"
            title={settings.direction === 'rtl' ? 'Next Page' : 'Previous Page'}
          />
          <div
            onClick={() => handleEdgeClick('right')}
            className="absolute right-0 top-16 bottom-20 w-16 md:w-24 z-20 cursor-e-resize opacity-0 hover:opacity-10 bg-white/5 transition"
            title={settings.direction === 'rtl' ? 'Previous Page' : 'Next Page'}
          />
        </>
      )}

      {/* Pages Container: Centered if centerAlign is true, or Free placement anywhere if false */}
      <div
        className={`${
          !centerAlign
            ? 'inline-flex flex-col items-start justify-start p-16 m-0 min-w-max min-h-max cursor-grab active:cursor-grabbing'
            : settings.readingMode === 'vertical'
            ? 'w-full flex flex-col items-center gap-0 px-0 pt-16 sm:pt-20 pb-28 mx-auto my-0'
            : settings.readingMode === 'double'
            ? 'm-auto flex flex-row items-center justify-center flex-wrap gap-4 pt-16 sm:pt-20 pb-20 px-6'
            : 'm-auto flex flex-col items-center justify-center pt-16 sm:pt-20 pb-20 px-6'
        } ${settings.pageTransition && settings.readingMode !== 'vertical' && centerAlign && scale <= 1.05 ? 'duration-150 transition-transform' : 'duration-0 transition-none'}`}
        style={{
          transform: (!centerAlign || settings.readingMode !== 'vertical') ? `translate(${pan.x}px, ${pan.y}px)` : 'none',
        }}
      >
        {visiblePages.map((pageNum) => {
          // Webtoon preloading window
          const isWithinActiveWindow = settings.readingMode !== 'vertical' || (pageNum >= minActive && pageNum <= maxActive);
          const isPriority = pageNum >= currentPage && pageNum <= currentPage + 2;

          const pageRotation = (((pageRotations && pageRotations[pageNum]) || 0) + (rotation || 0)) % 360;

          return (
            <PageRenderer
              key={`page-${pageNum}`}
              pdfDoc={pdfDoc}
              pageNumber={pageNum}
              scale={scale}
              rotation={pageRotation}
              isVisible={isWithinActiveWindow}
              isPriority={isPriority}
              readingMode={settings.readingMode}
              baseAspectRatio={baseAspectRatio}
              activeTool={activeTool}
              toolColor={toolColor}
              toolThickness={toolThickness}
              toolOpacity={toolOpacity}
              eraserType={eraserType}
              annotations={annotationsMap[pageNum] || []}
              onChangeAnnotations={onChangeAnnotations}
              onPageRendered={handlePageRendered}
              searchQuery={searchQuery}
            />
          );
        })}
      </div>
    </div>
  );
}
