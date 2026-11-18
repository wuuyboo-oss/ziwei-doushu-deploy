# 紫微斗数商业版 — Docker 部署（Render / Railway / Fly.io 通用）
# 构建时需要 devDependencies（next build），构建完再裁掉，只留生产依赖运行。
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# 免费次数计数文件落在容器内 .data/commercial/；容器重建会丢计数，
# 上量后应改成挂 volume 或数据库（见 BUILD-NOTES）。
CMD ["npm", "run", "start"]
