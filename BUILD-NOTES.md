本文件只写紫微，不提其他项目。

# 紫微斗数商业版 — 建造记录（2026-11-19）

## 这是什么

在免费版（`../renhuai-ziwei/`）基础上做的商业版，放在 `~/workspace/make-money/ziwei/commercial/`。
免费版、已发布的静态版（`../deploy/`）都没有动。没有上线 URL——什么都没部署，
下面写的所有链接都是代码来源署名，不是已上线的紫微站点。

商业模式（一句话）：排盘免费；AI 深度解盘收费，首次免费 1 次且只给命格总览前半段，
之后付费解锁全文。全份报告 ¥19.9，单维（事业或感情二选一）¥9.9。

## 紫微的用户是谁、为什么会付钱、去哪里找他们

只按紫微本身想，不借用任何别的产品、账号、流量或收款：

- **用户是谁**：对紫微斗数本来就感兴趣、愿意在网上搜“紫微排盘 / 命盘解读”的人；
  刚排完盘、看到命宫主星和格局、想知道“这对我具体意味着什么”的人；
  关心事业、感情、大限这三类具体问题的人。
- **为什么点进来**：免费排盘是钩子——输入生日就出一张看得懂的盘，
  不用先付钱、不用先注册。命格总览的前半段免费试读是第二个钩子：
  先看到解读是贴着自己盘面写的，再决定要不要为后半段付钱。
- **为什么付钱**：后半段才是“对我有什么用”的部分（优势、注意、大限走向、
  具体建议）。¥9.9 单维够低，对应一个具体问题（事业或感情）；¥19.9 全份对应
  “一次看完”。定价锚点就是这两个数字，不搞满减、不搞会员先行。
- **去哪里找他们**：搜紫微、命理、排盘的人聚集的地方——短视频与图文平台的
  命理内容区（发排盘演示、命格小知识短视频，挂紫微站链接）、命理问答与
  论坛、搜索引擎的“紫微排盘”相关词。获客内容只讲紫微本身（例如一张盘怎么看、
  某个主星坐命是什么意思），不蹭别的产品、不买别人的流量。
- **转化关键**：免费排盘必须又快又准（这是本产品的口碑）；试读前半段必须
  真正贴合盘面（不说空话）；付费按钮点开后如果支付还没通，必须如实说
  “支付开通审核中”，不能假装能付。

## 改了什么（相对免费版）

- `lib/ziwei/commercial.ts`（新增）：定价、免责声明、出生日期校验、
  限流（每 IP 每分钟 3 次 AI 请求、每日 20 次）、免费次数（IP + 设备指纹，
  本地 JSON 文件 `.data/commercial/free-uses.json` 持久化，写失败退化为内存）、
  试读截断（全文一半处按段落切）、付费墙响应体。`hasPaidAccess()` 目前恒为
  false——支付没开通前，任何人都没有“已付费”状态，不编造。
- `app/api/interpret/route.ts`：商业版门禁。规则版（`mode:"rule"`）一直免费，
  不计次数、不走限流；AI 首次免费只给 full（命格总览）前半段，
  `X-Interpret-Mode: ai-free-preview`；第二次起未付费返回 402 付费墙，
  不调用模型、不烧 token；请求体 > 64 KiB 返回 413；出生日期非法返回 400；
  限流返回 429。每份解读末尾必带免责声明。
- `app/api/pay/create/route.ts`（新增）：Dodo Payments 占位。只返回
  `{status:"pending_dodo", message:"支付开通审核中"}`（202），没有支付链接、
  没有订单号。Dodo 是为紫微这次的付费需求准备的收款渠道，审核状态由另一路在查，
  本建造不查、不催、不编造开通。
- `lib/ziwei/interpret.ts`：系统提示词改写为三合派读盘体系，明确“不要引用
  任何人的原话，不要编造引文或出处”；规则版默认文案去掉相关体系名；
  规则版结尾改为完整免责声明（“不构成医疗、投资、法律建议”）。
- `components/InsightPanel.tsx` / `components/ChatPanel.tsx`：提问提示词里
  “引用原话”的要求全部改为“用自己的话概括，不要引用原话”；请求带
  `scope` + `deviceId`（浏览器 localStorage 随机值）；402 时显示付费墙卡片，
  429 时显示限流提示。
- `components/PaywallCard.tsx`（新增）：定价卡片 + 付费按钮，调
  `/api/pay/create`，如实显示“支付开通审核中，稍后再试”。
- `app/page.tsx` 页脚：加排盘引擎与数据来源署名链接
  Renhuai123/ziwei-doushu 与 ZHENYI-ORG/zhenyi-ziwei（代码 MIT、数据集
  CC BY 4.0，依许可署名）；“仅供参考，不构成医疗、投资、法律建议”保留。
- `lib/nihai/tianji.ts`、`lib/nihai/diji.ts`：逐字原话引用已清空
  （`TIANJI_QUOTES` 为空数组，各章节 `quotes` 为空数组，`totalQuotes: 0`）。
  原因：原话属 CC BY-NC-SA 4.0（仅限非商用），商业版不收录、不展示、
  不作为 AI 提示词；观点一律用自己的话概括。简短的方法论概括性表述保留。
- 上游自带的 `research/` 目录已从 commercial/ 移除：商业服务端用不到，
  且其中是与产品无关的实验记录。`docs/`（紫微讲义笔记）保留。
- `Dockerfile` / `render.yaml` / `railway.json` / `fly.toml` / `wrangler.toml` /
  `.dockerignore`（新增，见“托管选型”）。
- `scripts/verify-commercial.ts`（新增）+ `package.json` 增加
  `npm run verify:commercial`。
- `.env.example`：补充商业版说明（部署环境必须用服务端环境变量配
  `DEEPSEEK_API_KEY`，绝不进代码/仓库；`COMMERCIAL_DATA_DIR` 可覆盖计数目录）。

## 本地验证结果（2026-11-19 02:40–02:50 CST，全部真实跑过）

- `npm run verify:commercial`：**34/34 通过**（排盘、出生日期校验 8 项、
  限流、免费次数、试读截断、付费墙、免责声明、提示词、原话库清空、付费状态）。
- `npm run build`：**通过**（37 页静态 + `/api/interpret` 与 `/api/pay/create`
  两个动态路由）。
- `npm run test`：**24 个回归文件全部通过，exit=0**（约 9 分钟，2026-11-19 03:0x CST
  重跑确认；中途曾因 commercial/ 没有 `.git` 导致 `neutral-naming` 测试调
  `git ls-files` 失败，已修：commercial/ 初始化为独立 git 仓库并 `git add -A`
  暂存 155 个文件，`neutral-naming` 142 个文件检查通过）。
- 端到端（`npm run start`，端口 3100，1990-01-01 男 子时）：
  - 免费排盘：命宫天府（庙）、水二局、虚岁 38、当前大限 32–41，与免费版一致。
  - `GET /api/interpret`：`mode=ai`、`backend=deepseek-helper`、
    `freeUsesLeft=1`、定价 19.9/9.9、`pay={status:"pending_dodo"}`。
  - 规则版（`mode:"rule"`）：200，`X-Interpret-Mode: rule`，全文含完整免责声明，
    不计免费次数。
  - AI 第 1 次（full，新设备）：200，`X-Interpret-Mode: ai-free-preview`，
    真实 DeepSeek 返回（约 15 秒），只给了前半段，末尾有“免费试读到此为止”+
    全份 ¥19.9 + 免责声明；`X-Free-Uses-Left: 0`。
    （注：响应头在传输中为小写 `x-interpret-mode`，这是 HTTP 常规写法，值正确。）
  - AI 第 2 次（同设备）：**402** `pay_required`，全份 ¥19.9，
    `pay={status:"pending_dodo", message:"支付开通审核中"}`，`freeUsesLeft=0`，
    未调用模型。
  - AI 事业单维（同设备）：**402**，¥9.9，同样 Dodo 占位。
  - 非法生日 2023-02-30：**400**“出生日期不存在”。
  - 超大请求体（> 64 KiB）：**413**“请求体过大”。
  - `POST /api/pay/create`：**202** `{status:"pending_dodo", message:"支付开通审核中"}`，
    无订单号、无支付链接。
  - 限流（重启服务后，4 次快速事业单维请求，不同设备）：402、402、402、
    **429**“每分钟最多 3 次 AI 请求，请稍后再试”。
  - 说明：首次端到端里第 4 次 AI 请求曾返回 200 而非 429，是因为两次调用
    跨过了整分钟边界（按分钟重置）；重启后用 4 次连续请求复测，限流行为确认无误。
- 密钥：全程没有把任何密钥写进代码、`.env`、仓库或日志。本地 AI 调用走
  DeepSeek helper（surrogate，不落地）；部署环境必须用服务端环境变量。

## 托管选型（只调研 + 准备，未注册任何账号）

只按紫微能不能跑、贵不贵、能不能藏 key 选。Vercel 已确认死路（403），没再试。
免费额度均为 2026-11-19 网页搜索到的公开说法，上线前以各家官网当前页面为准。

推荐排序：

1. **Render（首选）**——真正能跑 Next.js/Node 服务的免费档，不用信用卡。
   免费：750 小时/月、512 MB 内存、100 GB 带宽（有说法称 Hobby 工作区带宽为
   5 GB，以官网为准）；密钥放 Dashboard 环境变量。代价：15 分钟无流量休眠，
   下次访问冷启动约 1 分钟；免费数据库 30–90 天后过期（说法不一，以官网为准，
   本产品计数用本地文件，不依赖它的免费数据库）。
   部署：连 GitHub 仓库，`render.yaml` 已写好（`plan: free`，Docker 部署）。
2. **Railway（备选）**——能跑完整 Node 服务，不用信用卡起步。
   免费：$0/月计划每月 $1 用量额度，另有一次性 $5 试用（30 天）；小服务
   持续运行约 $4.5–5/月，$1 额度不够长期常驻，只够试用。密钥放面板变量。
   部署：连 GitHub 自动识别，或 `railway up`；`railway.json` 已写好。
   注意：不同来源对“永久免费档是否存在”说法冲突，上线前以官网为准。
3. **Cloudflare Workers（OpenNext）（有条件备选）**——免费额度大方
   （每天 10 万请求、静态资源不限、免流量费、可商用、无需信用卡、密钥用
   `wrangler secret` 藏），但**不适合直接跑现在这个版本**：免费档 Worker
   压缩后上限 3 MiB、每请求 CPU 10 ms，而本项目是标准 Node 服务，
   且 AI 调用依赖子进程调 DeepSeek helper（Workers 里没有子进程、没有
   python helper，只能走环境变量 key 的 HTTP 直调；`/api/interpret` 已支持
   这条路）。需装 `@opennextjs/cloudflare` 适配器重构部署方式，
   `wrangler.toml` 已写好并注明了这些前置条件，未验证。
4. **Deno Deploy（不推荐）**——免费 100 万请求/月、20 GiB 流出、10–15 小时
   CPU、无需信用卡起步，但完整免费额度需绑卡验证，且 2026-10-09 已宣布
   团队并入 Cloudflare、Deno Deploy 将于 2027 年 4 月左右日落。不要新起。
5. **Fly.io（最后）**——新账号已无免费档：试用仅 2 小时机器时间或 7 天，
   之后必须绑卡，最小机器约 $2.19/月。`fly.toml` 已写好，仅作以后付费时备用。

结论：先上 Render 免费档验证整条链路（排盘 + 试读 + 付费墙 + 密钥走服务端
环境变量）；流量起来、休眠不可接受时再升 Render Starter（$7/月）或转 Railway
Hobby（$5/月）。

## 未完成项（需要浏览器 / 人工做的事）

1. **注册并部署（浏览器）**：在 Render 注册账号（邮箱 + GitHub 授权即可，
   无需信用卡；如弹出短信/人脸验证，停下并记录，不要绕过）→ 新建 Web Service
   连紫微 commercial 代码仓库 → 套餐选 Free → 环境变量加 `DEEPSEEK_API_KEY`
   （服务端密钥，只放 Render 面板）→ 部署后打开域名验证排盘、试读、付费墙。
   同样步骤可备选 Railway。Cloudflare Workers 需先做 OpenNext 适配，不可直接部署。
2. **Dodo 支付开通**：审核由另一路在查；通过后才能把 `/api/pay/create` 从占位
   换成真实创建订单 + 支付链接，并加 webhook 校验后写付费解锁记录
   （`hasPaidAccess()` 目前恒为 false 是有意的）。开通前不要对外宣称“可支付”。
3. **隐私/条款文案**：`app/privacy/page.tsx` 与 `app/terms/page.tsx` 仍是上游
   原文，其中支付方式写的是支付宝/微信支付；Dodo 开通后要改成实际的收款方式
   与退款规则，再上线。
4. **计数持久化**：免费次数目前存在服务器本地文件；Render 免费容器重建会丢
   计数（用户可再得一次免费试读）。上量后改成挂 volume 或数据库。
   试读目前是调完整模型再截前半段，成本按全文计；以后可改 max_tokens 截断省成本。
5. **上线前复核**：部署后用真实域名重跑一遍端到端（排盘、试读、402、支付占位、
   限流），并确认页脚署名链接可点、免责声明每份解读都有。

## 改动清单（本目录相对免费版）

新增：`lib/ziwei/commercial.ts`、`app/api/pay/create/route.ts`、
`components/PaywallCard.tsx`、`scripts/verify-commercial.ts`、
`Dockerfile`、`.dockerignore`、`render.yaml`、`railway.json`、`fly.toml`、
`wrangler.toml`。
修改：`app/api/interpret/route.ts`、`lib/ziwei/interpret.ts`、
`lib/nihai/tianji.ts`、`lib/nihai/diji.ts`、`components/InsightPanel.tsx`、
`components/ChatPanel.tsx`、`app/page.tsx`（页脚署名）、`package.json`、
`.env.example`。
删除：`research/`（商业服务端用不到的上游实验记录）。
未动：`../renhuai-ziwei/`（免费版）、`../deploy/`（已发布静态版）。
