/**
 * [INPUT]: 依赖可选作者图片与 lucide-react 的 UserRound
 * [OUTPUT]: 对外提供 AuthorAvatar 作者头像组件
 * [POS]: 关于页与页脚共用的空头像适配；有上传图片时原样显示，没有图片时保留原布局且不请求空地址
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { UserRound } from 'lucide-react';

export function AuthorAvatar({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  return src ? <img className={className} src={src} alt={alt} /> : <span className={`${className} blog-avatar-placeholder`} role="img" aria-label={alt}><UserRound size={32} strokeWidth={1.25} /></span>;
}
