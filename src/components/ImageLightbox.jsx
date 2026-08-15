import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";

const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const WHEEL_SENSITIVITY = 0.0022;

const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/**
 * Full-canvas screenshot viewer.
 *
 * Scroll to zoom toward the cursor, drag to pan, double-click to toggle between
 * fit and 1:1. The transform is held in a ref and written straight to the node so
 * a drag never round-trips through React state — panning a 2600px capture has to
 * stay at frame rate.
 */
export const ImageLightbox = ({ src, alt, meta, onClose }) => {
	const imageRef = useRef(null);
	const surfaceRef = useRef(null);
	const viewRef = useRef({ scale: 1, x: 0, y: 0 });
	const dragRef = useRef(null);

	const [scaleLabel, setScaleLabel] = useState(100);
	const [isDragging, setIsDragging] = useState(false);

	const paint = useCallback(() => {
		const node = imageRef.current;
		if (!node) return;
		const { scale, x, y } = viewRef.current;
		node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
		setScaleLabel(Math.round(scale * 100));
	}, []);

	const reset = useCallback(() => {
		viewRef.current = { scale: 1, x: 0, y: 0 };
		paint();
	}, [paint]);

	// Zoom about an anchor point so the pixel under the cursor stays put
	const zoomAt = useCallback(
		(nextScale, anchorX, anchorY) => {
			const view = viewRef.current;
			const target = clampScale(nextScale);
			if (target === view.scale) return;

			const ratio = target / view.scale;
			viewRef.current = {
				scale: target,
				x: anchorX - (anchorX - view.x) * ratio,
				y: anchorY - (anchorY - view.y) * ratio,
			};
			paint();
		},
		[paint],
	);

	const zoomFromCentre = useCallback((factor) => zoomAt(viewRef.current.scale * factor, 0, 0), [zoomAt]);

	const handleWheel = useCallback(
		(e) => {
			e.preventDefault();
			const rect = surfaceRef.current?.getBoundingClientRect();
			if (!rect) return;

			const anchorX = e.clientX - rect.left - rect.width / 2;
			const anchorY = e.clientY - rect.top - rect.height / 2;
			zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), anchorX, anchorY);
		},
		[zoomAt],
	);

	// Non-passive wheel listener: React's synthetic onWheel is passive, so
	// preventDefault there is ignored and the side panel scrolls behind the overlay.
	useEffect(() => {
		const node = surfaceRef.current;
		if (!node) return;
		node.addEventListener("wheel", handleWheel, { passive: false });
		return () => node.removeEventListener("wheel", handleWheel);
	}, [handleWheel]);

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.key === "Escape") onClose();
			else if (e.key === "0") reset();
			else if (e.key === "+" || e.key === "=") zoomFromCentre(1.25);
			else if (e.key === "-") zoomFromCentre(0.8);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, reset, zoomFromCentre]);

	const startDrag = (e) => {
		if (e.button !== 0) return;
		e.preventDefault();
		dragRef.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			originX: viewRef.current.x,
			originY: viewRef.current.y,
		};
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
	};

	const onDrag = (e) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		viewRef.current = {
			...viewRef.current,
			x: drag.originX + (e.clientX - drag.startX),
			y: drag.originY + (e.clientY - drag.startY),
		};
		paint();
	};

	const endDrag = (e) => {
		if (!dragRef.current) return;
		dragRef.current = null;
		setIsDragging(false);
		e.currentTarget.releasePointerCapture?.(e.pointerId);
	};

	const handleDoubleClick = (e) => {
		if (viewRef.current.scale > 1.05) {
			reset();
			return;
		}
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!rect) return;
		zoomAt(2.5, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
	};

	const controlClass =
		"flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-foreground/20 bg-background/70 text-foreground/70 transition-colors hover:border-foreground/45 hover:text-foreground disabled:opacity-40";

	return (
		<div className="animate-fade-in fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Screenshot viewer">
			{/* Toolbar */}
			<div className="z-10 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 px-2.5 py-2">
				<div className="flex min-w-0 flex-col">
					<span className="font-mono text-[9px] font-bold uppercase tracking-widest text-foreground/50">Screenshot</span>
					<span className="truncate font-mono text-[10px] text-foreground/70" title={alt}>
						{alt}
					</span>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<span className="mr-0.5 w-10 text-right font-mono text-[10px] font-bold tabular-nums text-foreground/60">{scaleLabel}%</span>
					<button type="button" onClick={() => zoomFromCentre(0.8)} className={controlClass} title="Zoom out (-)">
						<ZoomOut className="h-3.5 w-3.5" />
					</button>
					<button type="button" onClick={() => zoomFromCentre(1.25)} className={controlClass} title="Zoom in (+)">
						<ZoomIn className="h-3.5 w-3.5" />
					</button>
					<button type="button" onClick={reset} className={controlClass} title="Reset to fit (0)">
						<Maximize2 className="h-3.5 w-3.5" />
					</button>
					<a href={src} download="screenshot.jpg" className={controlClass} title="Save image">
						<Download className="h-3.5 w-3.5" />
					</a>
					<button type="button" onClick={onClose} className={controlClass} title="Close (Esc)">
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* Canvas */}
			<div
				ref={surfaceRef}
				onPointerDown={startDrag}
				onPointerMove={onDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onDoubleClick={handleDoubleClick}
				className={`relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
			>
				<img ref={imageRef} src={src} alt={alt} draggable={false} className="max-h-full max-w-full origin-center object-contain will-change-transform" />
			</div>

			{/* Footer hints */}
			<div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background/80 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-widest text-foreground/40">
				<span>Scroll zoom · Drag pan · Double-click 1:1</span>
				{meta && (
					<span className="shrink-0">
						{meta.width}&times;{meta.height}
					</span>
				)}
			</div>
		</div>
	);
};
