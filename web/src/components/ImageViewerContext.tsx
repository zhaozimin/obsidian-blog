/**
 * [INPUT]: 依赖 React 上下文与 ImageViewer
 * [OUTPUT]: 对外提供 ImageViewerProvider、useImageViewer
 * [POS]: 跨页面图片预览边界，按原图挂载单一预览层；统一封面与正文的动画生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { ImageViewer } from './ImageViewer';
import { safeImageUrl } from '../lib/url';

interface ImageViewerContextType {
    openImage: (src: string, alt?: string) => void;
    closeImage: () => void;
}

const ImageViewerContext = createContext<ImageViewerContextType | undefined>(undefined);

export const ImageViewerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [alt, setAlt] = useState<string>('');

    const openImage = useCallback((imageSrc: string, imageAlt?: string) => {
        const safeSrc = safeImageUrl(imageSrc);
        if (!safeSrc) return;
        setSrc(safeSrc);
        setAlt(imageAlt || '');
    }, []);

    const closeImage = useCallback(() => {
        setSrc(null);
    }, []);

    return (
        <ImageViewerContext.Provider value={{ openImage, closeImage }}>
            {children}
            {src && <ImageViewer
                key={src}
                src={src}
                alt={alt}
                onClose={closeImage}
            />}
        </ImageViewerContext.Provider>
    );
};

export const useImageViewer = () => {
    const context = useContext(ImageViewerContext);
    if (context === undefined) {
        throw new Error('useImageViewer must be used within a ImageViewerProvider');
    }
    return context;
};
