# 紫微斗数商业版 — Docker 部署（Render / Railway / Fly.io 通用）
# 构建时需要 devDependencies（next build），构建完再裁掉，只留生产依赖运行。
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps：fdir 的可选 peer picomatch ^3||^4 与顶层 picomatch@2.3.2
# （micromatch/tailwindcss 链）放置冲突，严格 npm ci 会报
# "Invalid: lock file's picomatch@2.3.2 does not satisfy picomatch@4.0.7" /
# "Missing: picomatch@2.3.2 from lock file" 而失败（2026-11-19 首次部署）。
# 该 flag 只跳过 peer 依赖的严格校验，不改依赖版本；本地已验证
# npm ci --legacy-peer-deps + build + verify:commercial 34/34 均通过。
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# 免费次数计数文件落在容器内 .data/commercial/；容器重建会丢计数，
# 上量后应改成挂 volume 或数据库（见 BUILD-NOTES）。
CMD ["npm", "run", "start"]
