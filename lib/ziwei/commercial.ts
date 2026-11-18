/**
 * 商业版计费 / 限流 / 免费次数（服务端专用）
 *
 * 规则（2026-11-19 定）：
 * - 排盘免费；规则版解读免费（mode:"rule"）。
 * - AI 深度解盘收费：首次免费 1 次，且只给命格总览（full  scope）的前半段；
 *   之后按 scope 付费解锁全文：全份报告 ¥19.9，单维（事业 career / 感情 love）¥9.9。
 * - 免费次数按 IP + 设备指纹计数，先用本地 JSON 文件持久化（.data/commercial/，
 *   可用 COMMERCIAL_DATA_DIR 覆盖），文件写失败时退化为纯内存计数。
 * - 限流（内存）：每 IP 每分钟最多 3 次 AI 请求，每日上限 20 次。
 * - 防刷：请求体 ≤ 64 KiB；出生日期合法性校验（真实存在的日期、1900 年后、
 *   不晚于今天、时辰 0–11、性别 male/female）。
 * - 付费在 Dodo 审核通过前一律不可用：hasPaidAccess() 目前恒为 false，
 *   付费解锁记录（paidUnlocks）为空实现，等 /api/pay webhook 接入后再启用。
 *   不要编造已开通、支付链接或订单号。
 *
 * 密钥：本文件不含任何密钥。AI 调用仍走 DeepSeek helper（本地开发）或
 * 环境变量 DEEPSEEK_API_KEY（部署环境，服务端 env，不进代码/仓库）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BirthInfo } from './types';

// ────────────────── 定价 ──────────────────

export type PayScope = 'full' | 'career' | 'love';

export const PRICING: Record<PayScope, { price: number; currency: string; label: string }> = {
  full: { price: 19.9, currency: 'CNY', label: '全份报告' },
  career: { price: 9.9, currency: 'CNY', label: '单维·事业' },
  love: { price: 9.9, currency: 'CNY', label: '单维·感情' },
};

/** 每份解读末尾必带的免责声明。 */
export const DISCLAIMER =
  '免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。命由己造，运可自转。';

export const FREE_PREVIEW_LIMIT = 1; // 每指纹首次免费 1 次
export const MAX_BODY_BYTES = 64 * 1024; // 64 KiB
export const RATE_LIMIT_PER_MINUTE = 3;
export const RATE_LIMIT_PER_DAY = 20;

/** 把任意 scope 输入归一化；非法值一律当 full（全份）。 */
export function normalizeScope(input: unknown): PayScope {
  if (input === 'career' || input === 'love' || input === 'full') return input;
  return 'full';
}

/** 按提问文本推断 scope：明确问事业/感情时走单维，其余走全份。 */
export function scopeFromQuestion(question: string): PayScope {
  const q = question || '';
  if (/事业|工作|官禄|职业|创业|换工作|升职/.test(q)) return 'career';
  if (/感情|夫妻|婚姻|桃花|恋爱|对象|配偶/.test(q)) return 'love';
  return 'full';
}

// ────────────────── 出生日期校验 ──────────────────

export function validateBirth(b: BirthInfo | undefined | null): string | null {
  if (!b || typeof b !== 'object') return '缺少出生信息（birthInfo）';
  const { year, month, day, hour, gender } = b;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return '出生年份不合法（须为 1900–2100）';
  if (!Number.isInteger(month) || month < 1 || month > 12) return '出生月份不合法（须为 1–12）';
  if (!Number.isInteger(day) || day < 1 || day > 31) return '出生日期不合法（须为 1–31）';
  // 真实存在的日期（含闰年 2 月 29 日校验）
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return '出生日期不存在（请检查年月日，如 2 月没有 30 日）';
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 11) return '出生时辰不合法（须为 0–11，0=子时）';
  if (gender !== 'male' && gender !== 'female') return '性别不合法（须为 male / female）';
  // 不接受未来的出生日期（按 UTC 今天比较）
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Date.UTC(year, month - 1, day) > todayUTC) return '出生日期不能晚于今天';
  return null;
}

// ────────────────── 客户端指纹 ──────────────────

/** 指纹 = IP + 设备 ID + UA 的 SHA-256，只存哈希，不存原始 IP/UA。 */
export function fingerprint(ip: string, deviceId: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${ip || 'unknown'}|${deviceId || ''}|${userAgent || ''}`)
    .digest('hex');
}

/** 从请求头取客户端 IP（X-Forwarded-For 取首个；无代理时用直连地址）。 */
export function clientIp(forwardedFor: string | null, directIp: string | null): string {
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return directIp || 'unknown';
}

// ────────────────── 限流（内存） ──────────────────

interface RateBucket {
  minuteStart: number;
  minuteCount: number;
  dayKey: string;
  dayCount: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const minuteStart = Math.floor(now / 60_000) * 60_000;
  const dayKey = new Date(now).toISOString().slice(0, 10);
  let b = rateBuckets.get(ip);
  if (!b || b.minuteStart !== minuteStart) {
    b = { minuteStart, minuteCount: 0, dayKey, dayCount: b?.dayKey === dayKey ? b.dayCount : 0 };
  }
  if (b.dayKey !== dayKey) {
    b.dayKey = dayKey;
    b.dayCount = 0;
  }
  if (b.minuteCount >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, reason: `每分钟最多 ${RATE_LIMIT_PER_MINUTE} 次 AI 请求，请稍后再试` };
  }
  if (b.dayCount >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, reason: `今日 AI 请求已达上限（${RATE_LIMIT_PER_DAY} 次），请明天再试` };
  }
  b.minuteCount += 1;
  b.dayCount += 1;
  rateBuckets.set(ip, b);
  return { allowed: true };
}

/** 仅供本地验证脚本使用：清空内存限流计数。 */
export function __resetRateLimits(): void {
  rateBuckets.clear();
}

// ────────────────── 免费次数（本地 JSON 文件 + 内存兜底） ──────────────────

interface FreeUseStore {
  [fpHash: string]: { count: number; firstUsedAt: string; lastUsedAt: string };
}

const memoryStore: FreeUseStore = {};
let fileStoreLoaded = false;
let fileStorePath: string | null = null;

function storePath(): string | null {
  if (fileStorePath) return fileStorePath;
  try {
    const dir = process.env.COMMERCIAL_DATA_DIR
      || join(process.cwd(), '.data', 'commercial');
    mkdirSync(dir, { recursive: true });
    fileStorePath = join(dir, 'free-uses.json');
    return fileStorePath;
  } catch {
    return null; // 写不进磁盘时退化为纯内存
  }
}

function loadStore(): FreeUseStore {
  if (fileStoreLoaded) return memoryStore;
  fileStoreLoaded = true;
  const p = storePath();
  if (p && existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as FreeUseStore;
      Object.assign(memoryStore, parsed);
    } catch {
      // 文件损坏：从空开始，不阻塞服务
    }
  }
  return memoryStore;
}

function saveStore(): void {
  const p = storePath();
  if (!p) return;
  try {
    writeFileSync(p, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch {
    // 磁盘写失败不阻塞服务（内存计数仍有效）
  }
}

export function getFreeUsesLeft(fpHash: string): number {
  const store = loadStore();
  const used = store[fpHash]?.count ?? 0;
  return Math.max(0, FREE_PREVIEW_LIMIT - used);
}

/** 消费一次免费试读；返回消费后剩余次数。 */
export function consumeFreeUse(fpHash: string): number {
  const store = loadStore();
  const now = new Date().toISOString();
  const rec = store[fpHash] ?? { count: 0, firstUsedAt: now, lastUsedAt: now };
  rec.count += 1;
  rec.lastUsedAt = now;
  store[fpHash] = rec;
  saveStore();
  return Math.max(0, FREE_PREVIEW_LIMIT - rec.count);
}

/** 仅供本地验证脚本使用：清空内存 + 文件里的免费计数。 */
export function __resetFreeUses(): void {
  for (const k of Object.keys(memoryStore)) delete memoryStore[k];
  const p = storePath();
  if (p) {
    try {
      writeFileSync(p, JSON.stringify({}, null, 2), 'utf-8');
    } catch { /* 忽略 */ }
  }
}

// ────────────────── 付费状态（Dodo 未开通前恒为未付费） ──────────────────

/**
 * 付费解锁记录：目前为空实现。Dodo 支付开通并接好 webhook/订单校验后，
 * 在这里按指纹 + scope 查已付款记录；在此之前一律返回 false，
 * 绝不编造“已支付”。
 */
export function hasPaidAccess(_fpHash: string, _scope: PayScope): boolean {
  return false;
}

// ────────────────── 免费试读截断 ──────────────────

/**
 * 首次免费只给前半段：在全文一半位置后找最近的段落分隔（空行），
 * 找不到则按字符一半硬切；末尾附上试读结束 + 付费提示 + 免责声明。
 */
export function firstFreePreview(full: string, scope: PayScope): string {
  const half = Math.floor(full.length / 2);
  let cut = full.indexOf('\n\n', half);
  if (cut === -1 || cut - half > 400) cut = half;
  const head = full.slice(0, cut).trimEnd();
  const price = PRICING[scope];
  return (
    `${head}\n\n—— 免费试读到此为止（前半段）——\n` +
    `解锁全文：${price.label} ¥${price.price}。` +
    `全份报告 ¥19.9，单维（事业/感情）¥9.9。\n\n${DISCLAIMER}`
  );
}

/** 给全文追加免责声明（若已有则不重复追加）。 */
export function withDisclaimer(text: string): string {
  return text.includes('不构成医疗、投资、法律建议') ? text : `${text.trimEnd()}\n\n${DISCLAIMER}`;
}

/** 付费墙响应体（402）。pay 字段与 /api/pay/create 的占位口径一致。 */
export function paywallBody(scope: PayScope, freeUsesLeft: number) {
  const price = PRICING[scope];
  return {
    status: 'pay_required',
    scope,
    price: price.price,
    currency: price.currency,
    label: price.label,
    pricing: {
      full: { price: PRICING.full.price, label: PRICING.full.label },
      career: { price: PRICING.career.price, label: PRICING.career.label },
      love: { price: PRICING.love.price, label: PRICING.love.label },
    },
    freeUsesLeft,
    pay: { status: 'pending_dodo', message: '支付开通审核中' },
    message: `AI 深度解盘需付费解锁：${price.label} ¥${price.price}。支付开通审核中，稍后再试。规则版解读仍可免费使用。`,
  };
}
