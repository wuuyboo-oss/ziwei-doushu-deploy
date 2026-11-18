# 紫微斗数排盘 + AI 解盘（静态版）

在线打开：启用 GitHub Pages 后访问 `https://wuuyboo-oss.github.io/ziwei-doushu-deploy/`
（仓库 Settings → Pages → Build and deployment → Source 选择 Deploy from a branch，分支 main，目录 /(root)，保存即可）

## 这是什么

抖音视频《命理学界的天也要塌了吗？紫微斗数都被开源出来了》里提到的开源紫微斗数，
这里是**能直接打开用的静态版本**：输入出生年月日时即可排盘，并可做 AI 深度解盘。

- 排盘引擎：真一紫微（ZHENYI-ORG/zhenyi-ziwei，MIT），自研天文历法 + 排盘引擎，
  0 依赖，单文件 `index.html`（约 200KB），离线也能打开。
- 读盘立场：倪海厦《天纪》体系——生年四化终身固定、论宫看三方四正、空宫借对宫。
- 功能：十二宫排盘、主星/四化/格局/大限/流年/流月/流日、体质分析、命例保存、导出图片/JSON。

## AI 解盘

「AI 解盘」页签有两种模式：

1. **DeepSeek AI 解盘**：在页签里填入 DeepSeek API Key（sk-…），点「生成解盘」。
   Key 只保存在你自己的浏览器 localStorage 里，调用时只发给 `api.deepseek.com`，
   不会上传到任何其他服务器。Key 在 DeepSeek 开放平台充值后创建。
   没 Key 时点「生成解盘」会提示，也可以直接用规则版。
2. **规则版深度解读**：不填 Key 也能用，由排盘数据与《天纪》读盘规则拼成，
   分命格/性格/事业财运/感情/健康/大限/修身七节。不是 AI 生成，但每句话都有盘上依据。

## 完整版（带服务端 /api/interpret）

本仓库是静态版，AI 解盘在浏览器里直连 DeepSeek。
完整 Next.js 版（Renhuai123/ziwei-doushu + 自实现的 `/api/interpret`，
服务端经 DeepSeek 连接器调用，失败自动降级到规则版）在本地运行：

```bash
npm install
npm run build
npm run start   # 打开 http://localhost:3000/chart
```

## 局限（诚实说明）

- 开源版只有排盘引擎 + 规则断语；原站（ouranic.cn）的 AI 深度解盘、
  877 万段完整解读文本、断语库、后端、会员支付**都不开源**，这里没有。
- AI 解盘是通用大模型按盘面现写，不是原站的断语库；解读仅供参考。
- 命理解读不构成医疗、投资、法律建议；身体不适请及时就医。

## 来源

- 排盘引擎：https://github.com/ZHENYI-ORG/zhenyi-ziwei （MIT）
- 视频同款完整项目：https://github.com/Renhuai123/ziwei-doushu （MIT）
