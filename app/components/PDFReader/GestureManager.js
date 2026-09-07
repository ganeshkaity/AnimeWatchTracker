/**
 * GestureManager.js — Smooth touch, pinch-to-zoom, pan, and swipe handler
 */

export function attachGestureListeners(element, options = {}) {
  const {
    onZoomChange,
    onPanChange,
    onSwipePrev,
    onSwipeNext,
    onWheelScroll,
    onDoubleTap,
    getZoom,
    getPan,
    isZoomed,
  } = options;

  let initialDist = 0;
  let initialZoom = 1;
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let isPanning = false;
  let lastTapTime = 0;
  let pinchCenter = { x: 0, y: 0 };
  let wheelTimeout = null;

  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getCenter(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  let isMouseDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // ── Mouse Drag Panning (when zoomed or in free placement mode) ───────────
  function handleMouseDown(e) {
    // Left click only, ignore if clicking on inputs/buttons
    if (e.button === 0 && isZoomed && isZoomed()) {
      const targetTag = e.target.tagName.toLowerCase();
      if (targetTag === 'button' || targetTag === 'input' || targetTag === 'textarea' || targetTag === 'a') return;
      isMouseDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  }

  function handleMouseMove(e) {
    if (isMouseDragging) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const currentPan = getPan ? getPan() : { x: 0, y: 0 };
      if (onPanChange) {
        onPanChange({
          x: currentPan.x + dx,
          y: currentPan.y + dy,
        });
      }
    }
  }

  function handleMouseUp() {
    isMouseDragging = false;
  }

  // ── Wheel / Trackpad (Desktop & Laptop) ──────────────────────────────────
  function handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const currentZoom = getZoom ? getZoom() : 1.0;
      const change = -e.deltaY * 0.003 * currentZoom;
      const newZoom = Math.min(1000.0, Math.max(0.1, Number((currentZoom + change).toFixed(2))));
      if (onZoomChange) {
        onZoomChange(newZoom, { clientX: e.clientX, clientY: e.clientY });
      }
    } else if (isZoomed && isZoomed()) {
      // Pan with 2-finger trackpad scroll when zoomed
      const currentPan = getPan ? getPan() : { x: 0, y: 0 };
      if (onPanChange) {
        onPanChange({
          x: currentPan.x - e.deltaX,
          y: currentPan.y - e.deltaY,
        });
      }
    } else if (onWheelScroll) {
      if (Math.abs(e.deltaY) > 20) {
        if (!wheelTimeout) {
          if (e.deltaY > 0) {
            onWheelScroll('next');
          } else {
            onWheelScroll('prev');
          }
          wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
          }, 240);
        }
      }
    }
  }

  // ── Touch Start ─────────────────────────────────────────────────────────
  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      // Two-finger pinch zoom
      initialDist = getDistance(e.touches[0], e.touches[1]);
      initialZoom = getZoom();
      pinchCenter = getCenter(e.touches[0], e.touches[1]);
      isPanning = false;
    } else if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      lastTouchX = touchStartX;
      lastTouchY = touchStartY;

      // Double tap detector
      const now = Date.now();
      if (now - lastTapTime < 300) {
        if (onDoubleTap) {
          onDoubleTap({ clientX: touchStartX, clientY: touchStartY });
        }
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      if (isZoomed && isZoomed()) {
        isPanning = true;
      }
    }
  }

  // ── Touch Move ──────────────────────────────────────────────────────────
  function handleTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDist = getDistance(e.touches[0], e.touches[1]);
      if (initialDist > 0) {
        const scaleFactor = currentDist / initialDist;
        const targetZoom = Math.min(1000.0, Math.max(0.1, initialZoom * scaleFactor));
        if (onZoomChange) {
          onZoomChange(targetZoom, pinchCenter);
        }
      }
    } else if (e.touches.length === 1 && isPanning) {
      // Pan when zoomed in
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;

      const currentPan = getPan ? getPan() : { x: 0, y: 0 };
      if (onPanChange) {
        onPanChange({
          x: currentPan.x + dx,
          y: currentPan.y + dy,
        });
      }
    }
  }

  // ── Touch End ────────────────────────────────────────────────────────────
  function handleTouchEnd(e) {
    if (e.touches.length === 0) {
      if (!isPanning && (!isZoomed || !isZoomed())) {
        // Evaluate horizontal swipe
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Ensure swipe is horizontal and prominent (>= 60px)
        if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          if (diffX > 0 && onSwipePrev) {
            onSwipePrev();
          } else if (diffX < 0 && onSwipeNext) {
            onSwipeNext();
          }
        }
      }
      isPanning = false;
      initialDist = 0;
    }
  }

  element.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  element.addEventListener('wheel', handleWheel, { passive: false });
  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  return () => {
    element.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    element.removeEventListener('wheel', handleWheel);
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
  };
}