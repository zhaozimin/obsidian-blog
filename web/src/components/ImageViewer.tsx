/**
 * [INPUT]: 依赖 React Portal、lucide-react 与 overlays.css 的进出场动画
 * [OUTPUT]: 对外提供带平滑打开/关闭、缩放、拖拽与焦点回环的 ImageViewer
 * [POS]: ImageViewerContext 按图片挂载预览；关闭动画结束后才释放滚动和焦点，不影响拖拽即时响应
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Download, RotateCcw } from 'lucide-react';

interface ImageViewerProps {
    src: string;
    alt?: string;
    onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, onClose }) => {
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isClosing, setIsClosing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const dragStartInfo = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
    const hasMoved = useRef(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
    }, []);

    // === 打开预览：锁定滚动并将键盘焦点留在视图内 ===
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.querySelector<HTMLButtonElement>('[title="关闭 (Esc)"]')?.focus();

        // === 键盘关闭与焦点回环 ===
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
            if (e.key === 'Tab') {
                const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') || []);
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleClose]);

    // === 以指针位置为中心缩放，范围为 0.5–10 倍 ===
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(transform.scale * delta, 0.5), 10);

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
        const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

        setTransform({ x: newX, y: newY, scale: newScale });
    };

    // === 拖拽直接更新变换，不叠加过渡延迟 ===
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        dragStartInfo.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: transform.x,
            initialY: transform.y,
        };
        hasMoved.current = false;
        setIsDragging(true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragStartInfo.current) return;

        const dx = e.clientX - dragStartInfo.current.startX;
        const dy = e.clientY - dragStartInfo.current.startY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMoved.current = true;
        }

        setTransform({
            ...transform,
            x: dragStartInfo.current.initialX + dx,
            y: dragStartInfo.current.initialY + dy,
        });
    };

    const handleMouseUp = () => {
        dragStartInfo.current = null;
        setIsDragging(false);
    };

    const resetZoom = () => {
        setTransform({ x: 0, y: 0, scale: 1 });
    };

    return createPortal(
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            className="blog-image-viewer"
            data-closing={isClosing}
            onAnimationEnd={event => {
                if (isClosing && event.target === event.currentTarget) onClose();
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* === 遮罩 === */}
            <div
                className="blog-image-backdrop"
                onClick={handleClose}
            />

            {/* === 工具栏 === */}
            <div className="blog-image-toolbar">
                {/* === 缩放 === */}
                <div className="flex items-center gap-2 border-r border-white/20 pr-4">
                    <button
                        onClick={() => setTransform(t => ({ ...t, scale: Math.max(t.scale - 0.5, 0.5) }))}
                        className="zzm-btn zzm-btn--icon zzm-btn--ondark"
                        title="缩小"
                    >
                        <ZoomOut size={20} />
                    </button>
                    <span className="text-sm font-mono text-slate-400 min-w-[3ch] text-center">{Math.round(transform.scale * 100)}%</span>
                    <button
                        onClick={() => setTransform(t => ({ ...t, scale: Math.min(t.scale + 0.5, 10) }))}
                        className="zzm-btn zzm-btn--icon zzm-btn--ondark"
                        title="放大"
                    >
                        <ZoomIn size={20} />
                    </button>
                </div>

                {/* === 重置、下载与关闭 === */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={resetZoom}
                        className="zzm-btn zzm-btn--icon zzm-btn--ondark"
                        title="重置视图"
                    >
                        <RotateCcw size={20} />
                    </button>
                    <a
                        href={src}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="zzm-btn zzm-btn--icon zzm-btn--ondark"
                        title="下载原图"
                    >
                        <Download size={20} />
                    </a>
                    <button
                        onClick={handleClose}
                        className="zzm-btn zzm-btn--icon zzm-btn--ondark"
                        title="关闭 (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* === 图片入场与拖拽变换分层，避免缩放动画影响移动 === */}
            <div
                ref={containerRef}
                className="relative w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onClick={(e) => {
                    // === 点击空白关闭；拖拽结束不触发关闭 ===
                    if (e.target === containerRef.current && !hasMoved.current) {
                        handleClose();
                    }
                }}
            >
                <div className="blog-image-entry"><div
                    className="will-change-transform"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                >
                    <img
                        src={src}
                        alt={alt || 'Preview'}
                        className="max-w-none max-h-none object-contain pointer-events-none select-none"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                        }}
                        draggable={false}
                    />
                </div></div>
            </div>

            {/* === 操作提示 === */}
            <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none opacity-50">
                <p className="text-white text-xs tracking-widest uppercase">
                    滚轮缩放 · 拖拽移动 · Esc 退出
                </p>
            </div>

        </div>,
        document.body
    );
};
