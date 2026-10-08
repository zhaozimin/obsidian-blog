/**
 * [INPUT]: 依赖 博客公开快照，受保护正文通过服务器授权后单独读取
 * [OUTPUT]: 对外提供 PostType、Post、TimelineItem
 * [POS]: 跨页面数据契约；复选框置顶保持布尔值，供栏目统一选取和视图消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export enum PostType {
  LONG_READ = 'LONG_READ',
  BOOK_NOTE = 'BOOK_NOTE',
  PRODUCT = 'PRODUCT'
}

export interface Post {
  id: string;
  collectionId?: string;
  type: PostType;
  title: string;
  subtitle?: string;
  description: string;
  category: string;
  tags: string[];
  date: string;
  content: string;
  cover?: string;
  pinned?: boolean;
  isProtected?: boolean;  // 公开数据只含保护标记，密码始终留在服务器
  // Book specific
  author?: string;
  publisher?: string;
  isbn?: string;
  rating?: number;
  doubanUrl?: string;
  readDate?: string;
  // Product specific
  price?: string;
  buyUrl?: string;
  videoUrl?: string;
  launchDate?: string;
}

export interface TimelineItem {
  year: string;
  title: string;
  content: string;
}
