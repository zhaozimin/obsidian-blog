# [INPUT]: 锁定的依赖、网站、插件和服务端源码。
# [OUTPUT]: 单服务器网站与接收服务镜像，不包含用户笔记或密钥。
# [POS]: 可选容器部署入口。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund && npm run build && mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "server/index.cjs"]
