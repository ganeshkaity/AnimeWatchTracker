"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { screenToPageCoords } from './pdfUtils';

export default function AnnotationLayer({
  pageNumber,
  pageWidth,
  pageHeight,
  scale,
  rotation,
  activeTool,         // 'select' | 'highlight' | 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'underline' | 'strikethrough' | 'eraser'
  toolColor = '#ffff00',
  toolThickness = 4,
  toolOpacity = 0.5,
  eraserType = 'object', // 'object' | 'stroke'
  annotations = [],
  onChangeAnnotations,
  onSaveStatusChange,
}) {
  const containerRef = useRef(null);
  const [currentDraft, setCurrentDraft] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const isDrawingRef = useRef(false);

  // Convert normalized coordinate to pixel coordinate in rendered layer
  const toPx = useCallback((normVal, dimension) => normVal * dimension, []);

  // ─── Pointer Event Handlers ──────────────────────────────────────────────────

  const handlePointerDown = (e) => {
    if (activeTool === 'select' || !containerRef.current) return;
    const { x, y } = screenToPageCoords(e.clientX, e.clientY, containerRef.current);

    if (activeTool === 'eraser') {
      return; // handled by click on individual items
    }

    if (activeTool === 'text') {
      const newTextAnnot = {
        id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'text',
        x,
        y,
        text: 'New Note',
        color: toolColor,
        fontSize: Math.max(12, toolThickness * 3),
        createdAt: Date.now(),
      };
      const updated = [...annotations, newTextAnnot];
      onChangeAnnotations(pageNumber, updated);
      setEditingTextId(newTextAnnot.id);
      return;
    }

    isDrawingRef.current = true;

    if (activeTool === 'pen' || activeTool === 'marker' || activeTool === 'highlight') {
      const opacity = activeTool === 'highlight' ? 0.35 : activeTool === 'marker' ? 0.7 : toolOpacity;
      const width = activeTool === 'highlight' ? Math.max(12, toolThickness * 2) : toolThickness;

      setCurrentDraft({
        id: `draw_${Date.now()}`,
        type: 'drawing',
        tool: activeTool,
        points: [{ x, y }],
        color: toolColor,
        thickness: width,
        opacity,
      });
    } else if (['rect', 'circle', 'line', 'arrow', 'underline', 'strikethrough'].includes(activeTool)) {
      setCurrentDraft({
        id: `shape_${Date.now()}`,
        type: 'shape',
        shapeType: activeTool,
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        color: toolColor,
        thickness: toolThickness,
        opacity: toolOpacity,
      });
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || !currentDraft || !containerRef.current) return;
    const { x, y } = screenToPageCoords(e.clientX, e.clientY, containerRef.current);

    if (currentDraft.type === 'drawing') {
      setCurrentDraft((prev) => ({
        ...prev,
        points: [...prev.points, { x, y }],
      }));
    } else if (currentDraft.type === 'shape') {
      setCurrentDraft((prev) => ({
        ...prev,
        endX: x,
        endY: y,
      }));
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !currentDraft) return;
    isDrawingRef.current = false;

    // Commit draft to parent annotations list
    const updated = [...annotations, currentDraft];
    setCurrentDraft(null);
    onChangeAnnotations(pageNumber, updated);
  };

  // Erase Annotation
  const handleEraseItem = (annotId, e) => {
    e.stopPropagation();
    if (activeTool !== 'eraser') return;
    const updated = annotations.filter((a) => a.id !== annotId);
    onChangeAnnotations(pageNumber, updated);
  };

  // Text Annotation Edit
  const handleUpdateText = (id, newText) => {
    const updated = annotations.map((a) => (a.id === id ? { ...a, text: newText } : a));
    onChangeAnnotations(pageNumber, updated);
  };

  // Render SVG Path for smooth drawings
  const renderPathD = (points) => {
    if (!points || points.length === 0) return '';
    const first = points[0];
    let d = `M ${first.x * pageWidth} ${first.y * pageHeight}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      d += ` L ${p.x * pageWidth} ${p.y * pageHeight}`;
    }
    return d;
  };

  // Render Arrow Head
  const renderArrowHead = (x1, y1, x2, y2, color, thickness) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, thickness * 2.5);
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;

    const x3 = x2 - headLen * Math.cos(a1);
    const y3 = y2 - headLen * Math.sin(a1);
    const x4 = x2 - headLen * Math.cos(a2);
    const y4 = y2 - headLen * Math.sin(a2);

    return (
      <polygon
        points={`${x2},${y2} ${x3},${y3} ${x4},${y4}`}
        fill={color}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute inset-0 select-none ${
        activeTool === 'select' ? 'pointer-events-none' : 'pointer-events-auto cursor-crosshair'
      }`}
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        touchAction: activeTool === 'select' ? 'auto' : 'none',
      }}
    >
      <svg
        className="w-full h-full absolute inset-0 overflow-visible"
        width={pageWidth}
        height={pageHeight}
      >
        {/* Render Saved Annotations */}
        {annotations.map((annot) => {
          if (annot.type === 'drawing') {
            return (
              <path
                key={annot.id}
                d={renderPathD(annot.points)}
                stroke={annot.color}
                strokeWidth={annot.thickness * (scale || 1)}
                strokeOpacity={annot.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                onClick={(e) => handleEraseItem(annot.id, e)}
                className={activeTool === 'eraser' ? 'cursor-pointer hover:opacity-40 transition' : ''}
              />
            );
          }

          if (annot.type === 'shape') {
            const x1 = annot.startX * pageWidth;
            const y1 = annot.startY * pageHeight;
            const x2 = annot.endX * pageWidth;
            const y2 = annot.endY * pageHeight;

            const strokeW = annot.thickness * (scale || 1);

            if (annot.shapeType === 'rect') {
              const rx = Math.min(x1, x2);
              const ry = Math.min(y1, y2);
              const rw = Math.abs(x2 - x1);
              const rh = Math.abs(y2 - y1);
              return (
                <rect
                  key={annot.id}
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  stroke={annot.color}
                  strokeWidth={strokeW}
                  strokeOpacity={annot.opacity}
                  fill="none"
                  onClick={(e) => handleEraseItem(annot.id, e)}
                  className={activeTool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
                />
              );
            }

            if (annot.shapeType === 'circle') {
              const cx = (x1 + x2) / 2;
              const cy = (y1 + y2) / 2;
              const rx = Math.abs(x2 - x1) / 2;
              const ry = Math.abs(y2 - y1) / 2;
              return (
                <ellipse
                  key={annot.id}
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  stroke={annot.color}
                  strokeWidth={strokeW}
                  strokeOpacity={annot.opacity}
                  fill="none"
                  onClick={(e) => handleEraseItem(annot.id, e)}
                  className={activeTool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
                />
              );
            }

            if (annot.shapeType === 'line' || annot.shapeType === 'underline' || annot.shapeType === 'strikethrough') {
              return (
                <line
                  key={annot.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={annot.color}
                  strokeWidth={strokeW}
                  strokeOpacity={annot.opacity}
                  strokeLinecap="round"
                  onClick={(e) => handleEraseItem(annot.id, e)}
                  className={activeTool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
                />
              );
            }

            if (annot.shapeType === 'arrow') {
              return (
                <g
                  key={annot.id}
                  onClick={(e) => handleEraseItem(annot.id, e)}
                  className={activeTool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
                >
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={annot.color}
                    strokeWidth={strokeW}
                    strokeOpacity={annot.opacity}
                    strokeLinecap="round"
                  />
                  {renderArrowHead(x1, y1, x2, y2, annot.color, strokeW)}
                </g>
              );
            }
          }

          return null;
        })}

        {/* Render Current Active Draft */}
        {currentDraft && currentDraft.type === 'drawing' && (
          <path
            d={renderPathD(currentDraft.points)}
            stroke={currentDraft.color}
            strokeWidth={currentDraft.thickness * (scale || 1)}
            strokeOpacity={currentDraft.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}

        {currentDraft && currentDraft.type === 'shape' && (() => {
          const x1 = currentDraft.startX * pageWidth;
          const y1 = currentDraft.startY * pageHeight;
          const x2 = currentDraft.endX * pageWidth;
          const y2 = currentDraft.endY * pageHeight;
          const strokeW = currentDraft.thickness * (scale || 1);

          if (currentDraft.shapeType === 'rect') {
            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            return (
              <rect
                x={rx}
                y={ry}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                stroke={currentDraft.color}
                strokeWidth={strokeW}
                strokeOpacity={currentDraft.opacity}
                fill="none"
              />
            );
          }

          if (currentDraft.shapeType === 'circle') {
            return (
              <ellipse
                cx={(x1 + x2) / 2}
                cy={(y1 + y2) / 2}
                rx={Math.abs(x2 - x1) / 2}
                ry={Math.abs(y2 - y1) / 2}
                stroke={currentDraft.color}
                strokeWidth={strokeW}
                strokeOpacity={currentDraft.opacity}
                fill="none"
              />
            );
          }

          if (currentDraft.shapeType === 'arrow') {
            return (
              <g>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={currentDraft.color}
                  strokeWidth={strokeW}
                  strokeOpacity={currentDraft.opacity}
                />
                {renderArrowHead(x1, y1, x2, y2, currentDraft.color, strokeW)}
              </g>
            );
          }

          return (
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={currentDraft.color}
              strokeWidth={strokeW}
              strokeOpacity={currentDraft.opacity}
              strokeLinecap="round"
            />
          );
        })()}
      </svg>

      {/* Render HTML Text Notes Layer */}
      {annotations
        .filter((a) => a.type === 'text')
        .map((textAnnot) => {
          const isEditing = editingTextId === textAnnot.id;
          return (
            <div
              key={textAnnot.id}
              onClick={(e) => {
                if (activeTool === 'eraser') {
                  handleEraseItem(textAnnot.id, e);
                } else {
                  setEditingTextId(textAnnot.id);
                }
              }}
              style={{
                left: `${textAnnot.x * pageWidth}px`,
                top: `${textAnnot.y * pageHeight}px`,
                fontSize: `${textAnnot.fontSize || 13}px`,
                color: textAnnot.color || '#fff',
              }}
              className={`absolute transform -translate-x-2 -translate-y-2 p-1.5 rounded-lg shadow-lg border backdrop-blur-md transition ${
                activeTool === 'eraser'
                  ? 'cursor-pointer hover:border-red-500 bg-red-500/20'
                  : 'cursor-text bg-black/85 border-white/20'
              }`}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={textAnnot.text}
                  onChange={(e) => handleUpdateText(textAnnot.id, e.target.value)}
                  onBlur={() => setEditingTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingTextId(null);
                  }}
                  autoFocus
                  className="bg-transparent border-none outline-none text-white font-medium min-w-[80px]"
                />
              ) : (
                <span className="font-semibold">{textAnnot.text}</span>
              )}
            </div>
          );
        })}
    </div>
  );
}
