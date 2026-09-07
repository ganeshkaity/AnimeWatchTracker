"use client";

import React, { useEffect, useRef, useState, memo } from 'react';
import AnnotationLayer from './AnnotationLayer';

/**
 * Concurrency coordinator for PDF.js renders
 * Prevents worker thread choke when multiple pages become visible during scrolling
 */
let activeRenderCount = 0;
const MAX_CONCURRENT_RENDERS = 2;
const renderQueue = [];

function queueRender(renderFn) {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeRenderCount++;
      try {
        const res = await renderFn();
        resolve(res);
      } catch (err) {
        reject(err);
      } finally {
        activeRenderCount--;
        if (renderQueue.length > 0) {
          const next = renderQueue.shift();
          next();
        }
      }
    };

    if (activeRenderCount < MAX_CONCURRENT_RENDERS) {
      execute();
    } else {
      renderQueue.push(execute);
    }
  });
}

function PageRenderer({
  pdfDoc,
  pageNumber,
  scale = 1.0,
  rotation = 0,
  isVisible = true,
  isPriority = false,
  readingMode = 'single',
  baseAspectRatio = 1.414,
  activeTool,
  toolColor,
  toolThickness,
  toolOpacity,
  eraserType,
  annotations = [],
  onChangeAnnotations,
  onPageRendered,
  searchQuery = '',
  currentMatchIndex = -1,
}) {
  const canvasRef = useRef(null);
  const containerElementRef = useRef(null);
  const renderTaskRef = useRef(null);
  const hasRenderedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Track base unscaled dimensions (at scale 1.0) so current dimensions update synchronously at 60fps
  const [basePageSize, setBasePageSize] = useState({
    width: 750,
    height: Math.round(750 * (baseAspectRatio || 1.414)),
  });

  // Calculate live display dimensions synchronously from scale!
  const currentWidth = Math.round(basePageSize.width * scale);
  const currentHeight = Math.round(basePageSize.height * scale);

  const [isRendered, setIsRendered] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [inView, setInView] = useState(isVisible || isPriority);

  // IntersectionObserver for lazy virtualization with generous 1600px margin (2 viewports ahead)
  useEffect(() => {
    if (isPriority || isVisible) {
      setInView(true);
      return;
    }

    const el = containerElementRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
          }
        });
      },
      { rootMargin: '1600px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isPriority, isVisible]);

  // Main Render Effect with Double-Buffering (ZERO BLINK)
  useEffect(() => {
    let isCancelled = false;

    if (!pdfDoc || !pageNumber) return;
    if (!inView && !isVisible && !isPriority && !hasRenderedRef.current) return;

    // Debounce re-renders on rapid zoom changes so intermediate zoom values don't queue multiple renders
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        // Cancel any pending render task for this canvas
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const totalRotation = (page.rotate + rotation) % 360;
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });
        const unscaledW = Math.round(unscaledViewport.width);
        const unscaledH = Math.round(unscaledViewport.height);

        setBasePageSize((prev) => {
          if (prev.width !== unscaledW || prev.height !== unscaledH) {
            return { width: unscaledW, height: unscaledH };
          }
          return prev;
        });

        const viewport = page.getViewport({ scale, rotation: totalRotation });
        const targetW = Math.round(viewport.width);
        const targetH = Math.round(viewport.height);

        const mainCanvas = canvasRef.current;
        if (!mainCanvas) return;

        // DOUBLE-BUFFER STRATEGY:
        // If the page was already rendered once, keep the existing canvas bitmap and scale it via CSS
        // while rendering the new high-resolution bitmap onto an off-screen canvas in the background.
        // Once the off-screen render completes, synchronously blit it into the main canvas in 1 atomic frame!
        // This eliminates ALL blinking, black frames, and spinner flashes when zooming or scrolling!

        const dpr = window.devicePixelRatio || 1;
        // Limit raw buffer dimensions to max 4096px (GPU safe limit) while allowing unlimited zoom up to 1000x via CSS
        const MAX_CANVAS_DIM = 4096;
        const idealBufferW = viewport.width * dpr;
        const idealBufferH = viewport.height * dpr;

        let renderViewport = viewport;
        let bufferW = Math.floor(idealBufferW);
        let bufferH = Math.floor(idealBufferH);

        if (idealBufferW > MAX_CANVAS_DIM || idealBufferH > MAX_CANVAS_DIM) {
          const clampFactor = Math.min(MAX_CANVAS_DIM / idealBufferW, MAX_CANVAS_DIM / idealBufferH);
          const clampedScale = Math.max(0.1, scale * clampFactor);
          renderViewport = page.getViewport({ scale: clampedScale, rotation: totalRotation });
          bufferW = Math.max(10, Math.floor(renderViewport.width * dpr));
          bufferH = Math.max(10, Math.floor(renderViewport.height * dpr));
        }

        if (hasRenderedRef.current) {
          // Keep existing image visible, just update CSS dimensions immediately for instantaneous 60fps responsiveness
          mainCanvas.style.width = `${targetW}px`;
          mainCanvas.style.height = `${targetH}px`;
        }

        // Render on offscreen canvas or through concurrency queue
        await queueRender(async () => {
          if (isCancelled) return;

          const offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = bufferW;
          offscreenCanvas.height = bufferH;

          const offCtx = offscreenCanvas.getContext('2d', { alpha: false });
          const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

          const renderContext = {
            canvasContext: offCtx,
            viewport: renderViewport,
            transform,
          };

          const renderTask = page.render(renderContext);
          renderTaskRef.current = renderTask;

          await renderTask.promise;
          renderTaskRef.current = null;

          if (isCancelled) return;

          // Atomically transfer offscreen buffer to main visible canvas
          if (mainCanvas) {
            mainCanvas.width = bufferW;
            mainCanvas.height = bufferH;
            mainCanvas.style.width = `${targetW}px`;
            mainCanvas.style.height = `${targetH}px`;

            const ctx = mainCanvas.getContext('2d', { alpha: false });
            ctx.drawImage(offscreenCanvas, 0, 0);

            hasRenderedRef.current = true;
            setIsRendered(true);

            if (onPageRendered) {
              onPageRendered(pageNumber, { width: targetW, height: targetH });
            }
          }
        });

        // Text layer for search highlight
        if (!isCancelled) {
          try {
            const text = await page.getTextContent();
            if (!isCancelled) {
              setTextContent(text);
            }
          } catch {}
        }
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`[PageRenderer] Error rendering page ${pageNumber}:`, err);
        }
      }
    }, hasRenderedRef.current ? 120 : 0);

    return () => {
      isCancelled = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale, rotation, isVisible, isPriority, inView]);

  const isWebtoon = readingMode === 'vertical';

  return (
    <div
      ref={containerElementRef}
      data-page-number={pageNumber}
      className={`relative mx-auto select-none overflow-hidden flex-shrink-0 transition-none ${
        isWebtoon
          ? 'my-0 p-0 rounded-none shadow-none border-0 bg-black'
          : 'my-auto shadow-2xl rounded-lg bg-[#181c24]'
      }`}
      style={{
        width: `${currentWidth}px`,
        height: `${currentHeight}px`,
        margin: isWebtoon ? '0 auto' : undefined,
        padding: 0,
      }}
    >
      {/* HTML5 PDF Canvas with Double-Buffered Bitmap */}
      <canvas
        ref={canvasRef}
        className="block m-0 p-0 align-top leading-none"
        style={{
          display: 'block',
          margin: 0,
          padding: 0,
          verticalAlign: 'top',
          width: `${currentWidth}px`,
          height: `${currentHeight}px`,
        }}
      />

      {/* Loading Skeleton ONLY if this page has NEVER rendered yet */}
      {!isRendered && !hasRenderedRef.current && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111622] text-gray-400 gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
          <span className="text-[11px] font-mono text-gray-500">Page {pageNumber}</span>
        </div>
      )}

      {/* Text layer for search highlight */}
      {searchQuery && textContent && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ width: `${currentWidth}px`, height: `${currentHeight}px` }}
        >
          {textContent.items
            .filter((item) => item.str.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((item, idx) => (
              <div
                key={`match-${idx}`}
                className="absolute bg-amber-400/40 rounded-xs mix-blend-multiply border border-amber-500"
                style={{
                  left: `${(item.transform[4] / (textContent.items[0]?.transform[0] || 1)) * scale}px`,
                  top: `${currentHeight - (item.transform[5] / (textContent.items[0]?.transform[0] || 1)) * scale}px`,
                  width: `${item.width * scale}px`,
                  height: `${item.height * scale}px`,
                }}
              />
            ))}
        </div>
      )}

      {/* Dynamic Non-destructive Annotation Layer */}
      <AnnotationLayer
        pageNumber={pageNumber}
        pageWidth={currentWidth}
        pageHeight={currentHeight}
        scale={scale}
        rotation={rotation}
        activeTool={activeTool}
        toolColor={toolColor}
        toolThickness={toolThickness}
        toolOpacity={toolOpacity}
        eraserType={eraserType}
        annotations={annotations}
        onChangeAnnotations={onChangeAnnotations}
      />
    </div>
  );
}

export default memo(PageRenderer);
