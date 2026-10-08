/**
 * [INPUT]: 依赖公开 Post 的栏目身份、复选框置顶标记与发布日期
 * [OUTPUT]: 对外提供 collectionPosts，返回同一规则选出的置顶文章和完整列表
 * [POS]: 栏目展示的唯一排序边界；最多四个置顶席位按日期选择，封面与列表共用身份，原始标记不被改写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Post } from '../types';

const PINNED_LIMIT = 4;

export function collectionPosts(posts: Post[], collectionId: string) {
  const chronological = posts.filter(post => post.collectionId === collectionId).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const pinned = chronological.filter(post => post.pinned === true).slice(0, PINNED_LIMIT);
  const pinnedIds = new Set(pinned.map(post => post.id));
  return { pinned, pinnedIds, ordered: [...pinned, ...chronological.filter(post => !pinnedIds.has(post.id))] };
}
