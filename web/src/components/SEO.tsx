/**
 * [INPUT]: 依赖 React effect 与浏览器 document
 * [OUTPUT]: 对外提供 SEO 元信息组件
 * [POS]: 页面元信息适配器，由各页面提供标题、摘要与封面，页面无图时清理上一篇封面
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { useEffect } from 'react';
import { SITE } from '../lib/site';

interface SEOProps {
    title: string;
    description: string;
    type?: 'website' | 'article';
    image?: string;
}

export const SEO: React.FC<SEOProps> = ({
    title,
    description,
    type = 'website',
    image
}) => {
    useEffect(() => {
        // 设置页面标题
        document.title = title;

        // 设置 Meta 标签
        const metaTags = [
            { name: 'description', content: description },
            { property: 'og:title', content: title },
            { property: 'og:description', content: description },
            { property: 'og:type', content: type },
        ];

        if (!image) document.querySelector('meta[property="og:image"]')?.remove();
        if (image) {
            metaTags.push({ property: 'og:image', content: image });
        }

        // 更新或创建 Meta 标签
        metaTags.forEach(tag => {
            let element;
            if (tag.name) {
                element = document.querySelector(`meta[name="${tag.name}"]`);
            } else if (tag.property) {
                element = document.querySelector(`meta[property="${tag.property}"]`);
            }

            if (element) {
                element.setAttribute('content', tag.content);
            } else {
                const newElement = document.createElement('meta');
                if (tag.name) newElement.setAttribute('name', tag.name);
                if (tag.property) newElement.setAttribute('property', tag.property);
                newElement.setAttribute('content', tag.content);
                document.head.appendChild(newElement);
            }
        });

        // 注入 JSON-LD 结构化数据 (针对文章)
        let script = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement;
        if (!script) {
            script = document.createElement('script');
            script.type = 'application/ld+json';
            document.head.appendChild(script);
        }

        if (type === 'article') {
            const schemaData = {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "headline": title.split(' - ')[0], // 去掉后缀
                "description": description,
                "image": image ? [image] : [],
                "author": {
                    "@type": "Person",
                    "name": SITE.author
                },
                "publisher": {
                    "@type": "Organization",
                    "name": SITE.author,
                    "logo": {
                        "@type": "ImageObject",
                        "url": "/favicon.svg"
                    }
                }
            };
            script.textContent = JSON.stringify(schemaData);
        } else {
            // 网站类型
            const schemaData = {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": SITE.name,
                "url": window.location.origin,
                "description": description
            };
            script.textContent = JSON.stringify(schemaData);
        }

        // 清理函数
        return () => {
            // 不删除，以免闪烁，下一次 effect 会更新它
        };
    }, [title, description, type, image]);

    return null;
};
