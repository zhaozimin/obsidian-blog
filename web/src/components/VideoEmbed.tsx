/**
 * [INPUT]: 依赖 React 状态、视频平台嵌入地址与冻结播放控件
 * [OUTPUT]: 对外提供 VideoEmbed 视频组件
 * [POS]: 正文视频适配器，用户点击后才创建第三方播放器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useState } from 'react';
import { Play } from 'lucide-react';

interface VideoEmbedProps { type: 'bilibili' | 'youtube'; id: string; }
export const VideoEmbed = ({ type, id }: VideoEmbedProps) => {
  const [playing, setPlaying] = useState(false);
  const source = type === 'bilibili'
    ? `https://player.bilibili.com/player.html?bvid=${id}&high_quality=1&danmaku=0&autoplay=1`
    : `https://www.youtube.com/embed/${id}?autoplay=1`;
  return <div className="blog-video">
    {playing ? <iframe title={`${type === 'bilibili' ? '哔哩哔哩' : 'YouTube'} 视频`} src={source} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /> : <>
      {type === 'youtube' && <img className="blog-video-poster" src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />}
      <span className="blog-video-label">{type === 'bilibili' ? 'BILIBILI' : 'YOUTUBE'}</span>
      <button className="zzm-video-play zzm-video-play--center" aria-label="播放视频" onClick={() => setPlaying(true)}><Play className="zzm-video-play__icon" /></button>
    </>}
  </div>;
};
