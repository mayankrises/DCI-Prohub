"use client";

import React, { forwardRef, useMemo } from "react";
import { Page } from "react-pdf";

interface PDFPageSurfaceProps {
  pageNumber: number;
  /**
   * Final rendered page width in CSS pixels. This already includes zoom.
   */
  width: number;
  intrinsicWidth: number;
  intrinsicHeight: number;
  rotation: number;
  annotationMode: boolean;
  persistedLayer: React.ReactNode;
  interactiveLayer: React.ReactNode;
  onPageLoad: (width: number, height: number) => void;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

/**
 * One PDF page = one coordinate system.
 *
 * The PDF canvas, persisted annotations and live drawing layer always share
 * exactly the same explicit width and height. The wrapper is intentionally
 * allowed to become wider than its scroll viewport when zooming.
 */
const PDFPageSurface = forwardRef<HTMLDivElement, PDFPageSurfaceProps>(
  function PDFPageSurface(
    {
      pageNumber,
      width,
      intrinsicWidth,
      intrinsicHeight,
      rotation,
      annotationMode,
      persistedLayer,
      interactiveLayer,
      onPageLoad,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
    },
    interactionRef,
  ) {
    const dimensions = useMemo(() => {
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      const isQuarterTurn =
        normalizedRotation === 90 || normalizedRotation === 270;

      const sourceWidth = isQuarterTurn ? intrinsicHeight : intrinsicWidth;
      const sourceHeight = isQuarterTurn ? intrinsicWidth : intrinsicHeight;

      const safeSourceWidth =
        Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 612;
      const safeSourceHeight =
        Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 792;
      const safeRenderedWidth =
        Number.isFinite(width) && width > 0 ? Math.round(width) : 612;

      return {
        width: safeRenderedWidth,
        height: Math.round(
          safeRenderedWidth * (safeSourceHeight / safeSourceWidth),
        ),
      };
    }, [intrinsicHeight, intrinsicWidth, rotation, width]);

    return (
      <>
        {/*
          A global canvas/max-width rule elsewhere in the dashboard was
          shrinking react-pdf back to the viewport width. These narrowly scoped
          overrides keep the canvas at the exact dimensions requested here.
        */}
        <style jsx global>{`
          .prohub-pdf-page-surface,
          .prohub-pdf-page-surface .react-pdf__Page,
          .prohub-pdf-page-surface .react-pdf__Page__canvas {
            width: auto;
            max-width: none !important;
            min-width: 0;
          }

          .prohub-pdf-page-surface .react-pdf__Page {
            display: block;
          }

          .prohub-pdf-page-surface .react-pdf__Page__canvas {
            display: block !important;
            width: ${dimensions.width}px !important;
            height: ${dimensions.height}px !important;
          }

          .prohub-pdf-page-surface .react-pdf__Page__textContent,
          .prohub-pdf-page-surface .react-pdf__Page__annotations {
            width: ${dimensions.width}px !important;
            height: ${dimensions.height}px !important;
          }
        `}</style>

        <div
          className="prohub-pdf-page-surface"
          data-pdf-page={pageNumber}
          style={{
            position: "relative",
            width: dimensions.width,
            minWidth: dimensions.width,
            maxWidth: "none",
            height: dimensions.height,
            flex: `0 0 ${dimensions.width}px`,
            margin: "0 auto",
            background: "white",
            boxShadow: "0 8px 30px rgba(0,0,0,.35)",
            overflow: "hidden",
            lineHeight: 0,
          }}
        >
          <Page
            key={`${pageNumber}-${dimensions.width}-${rotation}`}
            pageNumber={pageNumber}
            width={dimensions.width}
            rotate={rotation}
            renderAnnotationLayer={false}
            renderTextLayer={!annotationMode}
            devicePixelRatio={
              typeof window !== "undefined"
                ? Math.min(window.devicePixelRatio || 1, 2)
                : 1
            }
            onLoadSuccess={(page) => {
              onPageLoad(page.originalWidth, page.originalHeight);
            }}
            loading={
              <div
                style={{
                  width: dimensions.width,
                  height: dimensions.height,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#475569",
                  background: "white",
                  lineHeight: "normal",
                }}
              >
                Rendering page…
              </div>
            }
            error={
              <div
                style={{
                  width: dimensions.width,
                  height: dimensions.height,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                  color: "#b91c1c",
                  background: "white",
                  lineHeight: "normal",
                  textAlign: "center",
                }}
              >
                This PDF page could not be rendered.
              </div>
            }
          />

          {/* Always visible; never intercepts scrolling or pointer input. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: dimensions.width,
              height: dimensions.height,
              zIndex: 2,
              pointerEvents: "none",
              overflow: "hidden",
              lineHeight: "normal",
            }}
          >
            {persistedLayer}
          </div>

          {/* Exists only during annotation mode. */}
          {annotationMode && (
            <div
              ref={interactionRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              style={{
                position: "absolute",
                inset: 0,
                width: dimensions.width,
                height: dimensions.height,
                zIndex: 5,
                pointerEvents: "auto",
                cursor: "crosshair",
                touchAction: "none",
                lineHeight: "normal",
              }}
            >
              {interactiveLayer}
            </div>
          )}
        </div>
      </>
    );
  },
);

export default PDFPageSurface;
