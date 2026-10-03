/**
 * [INPUT]: 依赖 React Router、SEO 与统一控件样式
 * [OUTPUT]: 对外提供 NotFound 页面
 * [POS]: 未知内容与未知路由共用的出口，保留明确的回到首页路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '../components/SEO';
export default function NotFound() {
  return <div className="blog-container blog-empty blog-not-found"><SEO title="页面未找到" description="这个页面暂时不在这里，回到首页继续阅读。" /><span className="blog-label">404 / NOT FOUND</span><h1>这页文字，暂时不在这里。</h1><p>回到首页，继续阅读与探索。</p><Link to="/" className="zzm-btn zzm-btn--primary"><ArrowLeft size={14} />回到首页</Link></div>;
}
