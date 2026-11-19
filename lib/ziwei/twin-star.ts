/**
 * 命运双子星（服务器版）
 *
 * 诚实说明：我们没有原站 67.5 万张命盘 / 56.6GB 的大库，也不下载它，
 * 更不谎称已接入。本功能在服务器端以用户这张盘为种子，用我们自己
 * 的排盘引擎（generateChart）抽样生成一批命盘做相似度匹配，只在
 * 这一批抽样盘里找最像的几张，并如实写清抽样规模与覆盖范围。
 *
 * 相似度（0–100）：命宫主星重合 40 分；三方四正主星重合 30 分；
 * 格局重合 15 分；生年四化落星重合 15 分。种子固定 → 同一张盘
 * 每次算出的双子星相同，可复核。
 */
import { createHash } from 'node:crypto';
import { generateChart } from './algorithm';
import { detectPatterns } from './patterns';
import type { ZiweiChart } from './types';

export const TWIN_STAR_SAMPLE_SIZE = 120;
export const TWIN_STAR_YEAR_MIN = 1950;
export const TWIN_STAR_YEAR_MAX = 2010;

export const TWIN_STAR_COVERAGE =
  `本次比对范围：服务器端以你的命盘为种子，用本站排盘引擎抽样生成了 ${TWIN_STAR_SAMPLE_SIZE} 张命盘（出生年份 ${TWIN_STAR_YEAR_MIN}–${TWIN_STAR_YEAR_MAX} 随机抽样，含男女），只在这一批抽样盘里找最像的几张。` +
  `这不是全库搜索：原站 67.5 万张命盘的大库我们没有接入，也不宣称已接入；抽样盘里没有更像的，不代表世上没有更像的。`;

export interface TwinStar {
  birth: { year: number; month: number; day: number; hour: number; gender: 'male' | 'female' };
  similarity: number;
  mingStars: string[];
  sharedMingStars: string[];
  sharedSanFangStars: string[];
  sharedPatterns: string[];
  sharedSihua: string[];
  points: string[];
}

export interface TwinStarResult {
  coverage: string;
  sampleSize: number;
  twins: TwinStar[];
}

/** mulberry32：种子固定 → 抽样可复现。 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromChart(chart: ZiweiChart): number {
  const b = chart.birthInfo;
  const h = createHash('sha256')
    .update(`${b.year}-${b.month}-${b.day}-${b.hour}-${b.gender}-${chart.mingGongBranch}-${chart.wuxingJu}`)
    .digest('hex');
  return parseInt(h.slice(0, 8), 16);
}

function majorNames(chart: ZiweiChart, branch: number): string[] {
  const p = chart.palaces.find((x) => x.branch === branch);
  if (!p) return [];
  return p.stars.filter((s) => s.type === 'major').map((s) => s.name);
}

function sanFangMajors(chart: ZiweiChart, branch: number): string[] {
  const branches = [branch, (branch + 4) % 12, (branch + 8) % 12, (branch + 6) % 12];
  const out: string[] = [];
  for (const b of branches) for (const n of majorNames(chart, b)) if (!out.includes(n)) out.push(n);
  return out;
}

function sihuaStars(chart: ZiweiChart): string[] {
  return chart.palaces.flatMap((p) =>
    p.stars.filter((s) => s.siHua).map((s) => `${s.name}化${s.siHua}`),
  );
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function scoreTwin(base: ZiweiChart, cand: ZiweiChart): { score: number; shared: Omit<TwinStar, 'birth' | 'similarity' | 'points'> } {
  const baseMing = majorNames(base, base.mingGongBranch);
  const candMing = majorNames(cand, cand.mingGongBranch);
  const sharedMing = baseMing.filter((s) => candMing.includes(s));
  const baseSan = sanFangMajors(base, base.mingGongBranch);
  const candSan = sanFangMajors(cand, cand.mingGongBranch);
  const sharedSan = baseSan.filter((s) => candSan.includes(s));
  const basePat = detectPatterns(base).map((p) => p.name);
  const candPat = detectPatterns(cand).map((p) => p.name);
  const sharedPat = basePat.filter((s) => candPat.includes(s));
  const baseHua = sihuaStars(base);
  const candHua = sihuaStars(cand);
  const sharedHua = baseHua.filter((s) => candHua.includes(s));
  const score = Math.round(
    jaccard(baseMing, candMing) * 40 +
    jaccard(baseSan, candSan) * 30 +
    jaccard(basePat, candPat) * 15 +
    jaccard(baseHua, candHua) * 15,
  );
  return {
    score,
    shared: {
      mingStars: candMing,
      sharedMingStars: sharedMing,
      sharedSanFangStars: sharedSan,
      sharedPatterns: sharedPat,
      sharedSihua: sharedHua,
    },
  };
}

/**
 * 在抽样盘里找最像的几张。sampleSize 默认 120；count 默认 5。
 * 同一张输入盘 → 同一种子 → 同一批抽样 → 同一个结果。
 */
export function findTwinStars(chart: ZiweiChart, count = 5, sampleSize = TWIN_STAR_SAMPLE_SIZE): TwinStarResult {
  const rng = mulberry32(seedFromChart(chart));
  const scored: TwinStar[] = [];
  let made = 0;
  let guard = 0;
  while (made < sampleSize && guard < sampleSize * 4) {
    guard += 1;
    const year = TWIN_STAR_YEAR_MIN + Math.floor(rng() * (TWIN_STAR_YEAR_MAX - TWIN_STAR_YEAR_MIN + 1));
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28); // 1–28 日恒为合法日期，抽样不挑闰月边界
    const hour = Math.floor(rng() * 12);
    const gender = rng() < 0.5 ? 'male' : ('female' as const);
    // 排除与本人同一天同一时辰的盘（那不是“相似盘”，是同一张盘）
    if (year === chart.birthInfo.year && month === chart.birthInfo.month && day === chart.birthInfo.day && hour === chart.birthInfo.hour) continue;
    let cand: ZiweiChart;
    try {
      cand = generateChart({ year, month, day, hour, gender });
    } catch {
      continue;
    }
    made += 1;
    const { score, shared } = scoreTwin(chart, cand);
    const points: string[] = [];
    if (shared.sharedMingStars.length) points.push(`命宫同主星：${shared.sharedMingStars.join('、')}`);
    if (shared.sharedSanFangStars.length >= 3) points.push(`三方四正共见 ${shared.sharedSanFangStars.length} 颗主星：${shared.sharedSanFangStars.join('、')}`);
    if (shared.sharedPatterns.length) points.push(`同格局：${shared.sharedPatterns.join('、')}`);
    if (shared.sharedSihua.length) points.push(`同四化落星：${shared.sharedSihua.join('、')}`);
    if (!points.length) points.push('命宫、三方与四化都没有直接重合，是抽样里相对最接近的一张。');
    scored.push({
      birth: { year, month, day, hour, gender },
      similarity: score,
      ...shared,
      points,
    });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return { coverage: TWIN_STAR_COVERAGE, sampleSize: made, twins: scored.slice(0, count) };
}
