/**
 * POST /api/twin-star —— 命运双子星（服务器版）
 *
 * 请求：{ chart }（一张合法命盘）
 * 响应：{ coverage, sampleSize, twins: [{ birth, similarity, mingStars,
 *   sharedMingStars, sharedSanFangStars, sharedPatterns, sharedSihua, points }] }
 *
 * 免费，不走 AI 限流、不计免费次数、不调用模型。
 * 比对范围见 lib/ziwei/twin-star.ts 的 TWIN_STAR_COVERAGE：只在服务
 * 器端抽样生成的 120 张盘里找最像的几张，不是全库搜索；原站
 * 67.5 万盘大库我们没有接入，也不宣称已接入。
 * 同一张输入盘结果固定（种子固定），服务端按输入指纹缓存 10 分钟。
 */
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { findTwinStars, type TwinStarResult } from '@/lib/ziwei/twin-star';
import { MAX_BODY_BYTES, validateBirth } from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = new Map<string, { at: number; result: TwinStarResult }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json({ error: `请求体过大（上限 ${MAX_BODY_BYTES / 1024} KiB）` }, { status: 413 });
  }
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    return Response.json({ error: '请求体读取失败' }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: `请求体过大（上限 ${MAX_BODY_BYTES / 1024} KiB）` }, { status: 413 });
  }
  let body: { chart?: ZiweiChart };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  const { chart } = body;
  if (!chart || !Array.isArray(chart.palaces) || chart.palaces.length !== 12) {
    return Response.json({ error: '缺少合法的命盘数据（chart.palaces 须为 12 宫）' }, { status: 400 });
  }
  const birthError = validateBirth(chart.birthInfo);
  if (birthError) {
    return Response.json({ error: birthError }, { status: 400 });
  }
  const b = chart.birthInfo;
  const key = createHash('sha256')
    .update(`${b.year}-${b.month}-${b.day}-${b.hour}-${b.gender}`)
    .digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({ ...hit.result, cached: true });
  }
  const result = findTwinStars(chart, 5);
  cache.set(key, { at: Date.now(), result });
  return Response.json({ ...result, cached: false });
}
