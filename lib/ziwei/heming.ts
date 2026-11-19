/**
 * 合八字 + 合盘规则版逐宫对照（商业版）
 *
 * 只看两张盘上已有的数据，不调用 AI，不抄任何原站文本，
 * 文案全部由本系统用自己的话撰写。
 *
 * 合八字：取两张盘 lunarInfo.fourPillars（节气四柱，年/月/日/时），
 * 只看干支本身的关系：天干五合 / 地支六合、三合、六冲，与五行生克。
 * 日柱最重（日干为自己、日支为夫妻宫），年柱看长辈缘，月柱看日常
 * 相处，时柱看子女与晚年。合八字只看干支合冲，不能单独断婚姻，
 * 须再对照两张紫微盘的夫妻宫与生年四化。
 *
 * 合盘逐宫（规则版）：命宫 / 夫妻宫 / 福德宫 / 财帛宫 / 官禄宫 /
 * 迁移宫六宫，逐宫对照双方主星与生年四化，给出合与冲的要点。
 */
import type { ZiweiChart, Palace } from './types';

const STEM_WX: Record<string, string> = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
};
const BRANCH_WX: Record<string, string> = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土', '巳': '火',
  '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水',
};
const ZODIAC: Record<string, string> = {
  '子': '鼠', '丑': '牛', '寅': '虎', '卯': '兔', '辰': '龙', '巳': '蛇',
  '午': '马', '未': '羊', '申': '猴', '酉': '鸡', '戌': '狗', '亥': '猪',
};
const STEM_HE: string[][] = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
const BRANCH_HE: string[][] = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const BRANCH_SANHE: string[][] = [['申', '子', '辰'], ['寅', '午', '戌'], ['巳', '酉', '丑'], ['亥', '卯', '未']];
const BRANCH_CHONG: string[][] = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const WX_SHENG: Record<string, string> = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
const WX_KE: Record<string, string> = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };

const pairIn = (list: string[][], a: string, b: string) => list.some((g) => g.includes(a) && g.includes(b));

export interface BaziRow {
  label: string;
  a: string;
  b: string;
  stemRel: string;
  branchRel: string;
}

export interface BaziResult {
  rows: BaziRow[];
  score: number;
  verdict: string;
  lines: string[];
}

/** 两张盘的四柱干支对照；任一盘缺 fourPillars 时返回 null。 */
export function baziMatch(c1: ZiweiChart, c2: ZiweiChart): BaziResult | null {
  const p1 = c1.lunarInfo.fourPillars;
  const p2 = c2.lunarInfo.fourPillars;
  if (!p1 || !p2) return null;
  const cols: [string, number][] = [['年柱', 0], ['月柱', 1], ['日柱', 2], ['时柱', 3]];
  let score = 0;
  const rows: BaziRow[] = cols.map(([label, i]) => {
    const a = p1[i];
    const b = p2[i];
    const as = a[0];
    const ab = a[1];
    const bs = b[0];
    const bb = b[1];
    let stemRel = '';
    let branchRel = '';
    if (as === bs) { stemRel = '同干'; }
    else if (pairIn(STEM_HE, as, bs)) { stemRel = '天干五合'; score += 1; }
    else if (WX_SHENG[STEM_WX[as]] === STEM_WX[bs]) { stemRel = `天干相生（${STEM_WX[as]}生${STEM_WX[bs]}）`; score += 1; }
    else if (WX_SHENG[STEM_WX[bs]] === STEM_WX[as]) { stemRel = `天干相生（${STEM_WX[bs]}生${STEM_WX[as]}）`; score += 1; }
    else if (WX_KE[STEM_WX[as]] === STEM_WX[bs] || WX_KE[STEM_WX[bs]] === STEM_WX[as]) { stemRel = `天干相克（${STEM_WX[as]}克${STEM_WX[bs]}）`; score -= 1; }
    else stemRel = '天干无合克';
    if (ab === bb) { branchRel = '同支'; }
    else if (pairIn(BRANCH_HE, ab, bb)) { branchRel = '地支六合'; score += 2; }
    else if (BRANCH_SANHE.some((g) => g.includes(ab) && g.includes(bb))) { branchRel = '地支三合'; score += 1; }
    else if (pairIn(BRANCH_CHONG, ab, bb)) { branchRel = '地支六冲'; score -= 2; }
    else if (WX_SHENG[BRANCH_WX[ab]] === BRANCH_WX[bb] || WX_SHENG[BRANCH_WX[bb]] === BRANCH_WX[ab]) { branchRel = '地支相生'; score += 1; }
    else if (WX_KE[BRANCH_WX[ab]] === BRANCH_WX[bb] || WX_KE[BRANCH_WX[bb]] === BRANCH_WX[ab]) { branchRel = '地支相克'; score -= 1; }
    else branchRel = '地支无合冲';
    return { label, a, b, stemRel, branchRel };
  });
  const day = rows[2];
  const lines: string[] = [];
  lines.push(`年柱：一方${rows[0].a}（${ZODIAC[rows[0].a[1]]}年）、另一方${rows[0].b}（${ZODIAC[rows[0].b[1]]}年），${rows[0].stemRel}、${rows[0].branchRel}——年柱看两家人的缘分与长辈态度，合则长辈好相处，冲则两家观念容易顶牛。`);
  lines.push(`月柱：${rows[1].stemRel}、${rows[1].branchRel}——月柱看婚后日常相处与生活节奏，合则日子顺，冲则小事容易拌嘴。`);
  const dayNote =
    day.branchRel === '地支六冲'
      ? '日支相冲是合八字里最要留意的一处：夫妻宫逢冲，感情容易因小事起波澜，宜多包容、少在气头上说话。'
      : day.branchRel === '地支六合'
        ? '日支六合：夫妻宫相合，两个人过日子合拍，吵了也容易和好。'
        : day.branchRel === '地支三合'
          ? '日支三合：夫妻宫相合，两个人目标一致，越过越有奔头。'
          : '日支既不合也不冲：夫妻相处平淡实在，合不合拍更多看两张紫微盘的夫妻宫。';
  lines.push(`日柱最重：日干是自己（一方日干${p1[2][0]}${STEM_WX[p1[2][0]]}、另一方日干${p2[2][0]}${STEM_WX[p2[2][0]]}），${day.stemRel}；日支是夫妻宫，${day.branchRel}。${dayNote}`);
  lines.push(`时柱：${rows[3].stemRel}、${rows[3].branchRel}——时柱看子女缘与晚年，合则晚年安稳，冲则晚年多为子女操心。`);
  const verdict =
    score >= 4
      ? '四柱对照以合为主：先天节奏合拍，相处省力；但合多也可能互相迁就，遇事还是要把话说开。'
      : score >= 1
        ? '四柱对照合冲参半：合的地方是相处的基础，冲的地方是需要磨合的功课，磨合好了反而更稳。'
        : score >= -2
          ? '四柱对照冲多于合：先天节奏不太一样，相处要多一分耐心与让步；感情好不好，最终还要看两张紫微盘的夫妻宫与大限流年。'
          : '四柱对照冲较多：先天节奏差异大，两个人都要学会让步；只凭合八字不能断婚姻，务必再对照两张紫微盘的夫妻宫与生年四化。';
  lines.push(verdict);
  return { rows, score, verdict, lines };
}

// ── 合盘规则版逐宫对照 ──

const normPalace = (s: string) => s.replace(/宫$/, '');

function palaceByName(chart: ZiweiChart, name: string): Palace | undefined {
  return chart.palaces.find((p) => normPalace(p.name) === normPalace(name));
}

function majorNames(p: Palace | undefined): string[] {
  if (!p) return [];
  const majors = p.stars.filter((s) => s.type === 'major').map((s) => s.name);
  if (majors.length) return majors;
  const opp = p.borrowedStars ?? [];
  return opp;
}

function sihuaText(p: Palace | undefined): string {
  if (!p) return '';
  return p.stars
    .filter((s) => s.siHua)
    .map((s) => `${s.name}化${s.siHua}`)
    .join('、');
}

export interface SynastryPalaceRow {
  palace: string;
  role: string;
  aStars: string[];
  bStars: string[];
  aSihua: string;
  bSihua: string;
  note: string;
}

export interface SynastryResult {
  rows: SynastryPalaceRow[];
  /** 双方命宫主星有相同者 */
  sharedMingStars: string[];
  /** 一方夫妻宫主星 = 另一方命宫主星（单向或双向） */
  mutualMatch: string[];
  verdict: string;
}

const SYNASTRY_PALACES: [string, string][] = [
  ['命宫', '先天个性与格局'],
  ['夫妻宫', '感情与婚姻'],
  ['福德宫', '深层感情与精神契合'],
  ['财帛宫', '赚钱方式与金钱观'],
  ['官禄宫', '事业方向与合作'],
  ['迁移宫', '对外形象与外出缘分'],
];

export function synastryRule(c1: ZiweiChart, c2: ZiweiChart): SynastryResult {
  const rows: SynastryPalaceRow[] = SYNASTRY_PALACES.map(([palace, role]) => {
    const p1 = palaceByName(c1, palace);
    const p2 = palaceByName(c2, palace);
    const aStars = majorNames(p1);
    const bStars = majorNames(p2);
    const shared = aStars.filter((s) => bStars.includes(s));
    const aSihua = sihuaText(p1);
    const bSihua = sihuaText(p2);
    let note: string;
    if (shared.length) {
      note = `双方${palace}都有${shared.join('、')}：同星同宫，先天节奏相近，这方面最容易互相理解。`;
    } else if (!aStars.length || !bStars.length) {
      note = `有一方${palace}空宫借对宫：这一宫的相处更多受环境与对方影响，宜多沟通、少猜测。`;
    } else {
      note = `一方${aStars.join('、')}、一方${bStars.join('、')}：星性不同，这一宫的相处方式不一样，互补有余、默契要靠磨合。`;
    }
    if (aSihua && bSihua) note += ` 四化上，一方${aSihua}、一方${bSihua}，得失的着力点不同。`;
    else if (aSihua || bSihua) note += ` 四化上，${aSihua || bSihua}的一方在这一宫的得失感更强。`;
    return { palace, role, aStars, bStars, aSihua, bSihua, note };
  });
  const mingA = majorNames(palaceByName(c1, '命宫'));
  const mingB = majorNames(palaceByName(c2, '命宫'));
  const sharedMingStars = mingA.filter((s) => mingB.includes(s));
  const fuqiA = majorNames(palaceByName(c1, '夫妻宫'));
  const fuqiB = majorNames(palaceByName(c2, '夫妻宫'));
  const mutualMatch: string[] = [];
  if (fuqiA.some((s) => mingB.includes(s))) mutualMatch.push('甲方夫妻宫主星对应乙方命宫主星');
  if (fuqiB.some((s) => mingA.includes(s))) mutualMatch.push('乙方夫妻宫主星对应甲方命宫主星');
  const verdict =
    mutualMatch.length === 2
      ? '规则版对照：双方夫妻宫与命宫双向对应，是合盘里最难得的一种呼应——先天上互相是对方期待的样子，相处有天然的默契。'
      : mutualMatch.length === 1
        ? `规则版对照：${mutualMatch[0]}，单向呼应：一方的期待正好是另一方的本色，这是感情里很加分的一点。`
        : sharedMingStars.length
          ? `规则版对照：双方命宫都有${sharedMingStars.join('、')}，个性底色相近，相处省力；但夫妻宫没有直接对应，感情的默契要靠后天经营。`
          : '规则版对照：双方命宫与夫妻宫没有直接的星曜对应，感情靠后天磨合；逐宫看下来，合的地方是基础，星性不同的地方是需要互相包容的功课。';
  return { rows, sharedMingStars, mutualMatch, verdict };
}

/** 规则版合盘逐宫解读全文（/api/heming 的 mode:"rule" 与 AI 降级共用）。 */
export function buildRuleHeming(chartA: ZiweiChart, chartB: ZiweiChart, question = ''): string {
  const syn = synastryRule(chartA, chartB);
  const bazi = baziMatch(chartA, chartB);
  const out: string[] = [];
  out.push('（规则版合盘）当前是按两张盘的数据逐宫对照的规则版解读（非 AI 生成）。配置 DEEPSEEK_API_KEY 后可获得 AI 逐宫解读。');
  out.push('');
  out.push('**【合盘总判】**');
  out.push(syn.verdict);
  out.push('');
  for (const row of syn.rows) {
    out.push(`**【${row.palace} · ${row.role}】**`);
    out.push(`甲方：${row.aStars.join('、') || '空宫'}${row.aSihua ? `（${row.aSihua}）` : ''}；乙方：${row.bStars.join('、') || '空宫'}${row.bSihua ? `（${row.bSihua}）` : ''}。`);
    out.push(row.note);
    out.push('');
  }
  if (bazi) {
    out.push('**【合八字 · 四柱干支对照】**');
    for (const r of bazi.rows) out.push(`${r.label}：甲方 ${r.a}、乙方 ${r.b}，${r.stemRel}、${r.branchRel}。`);
    out.push('');
    for (const line of bazi.lines) out.push(line);
    out.push('');
    out.push('合八字只看干支合冲，不能单独断婚姻，须再对照两张紫微盘的夫妻宫与生年四化。');
    out.push('');
  }
  if (question.trim()) {
    out.push('**【针对你的问题】**');
    out.push(`你问的是「${question.trim()}」：上面逐宫对照里与这个问题最相关的是夫妻宫与福德宫两节，请重点看这两节；更细的追问可以用 AI 逐宫解读。`);
    out.push('');
  }
  out.push('免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。命由己造，运可自转。');
  return out.join('\n');
}
