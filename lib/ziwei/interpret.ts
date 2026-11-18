/**
* AI 解读接口的共享逻辑（服务端专用）
*
* 两条路：
* 1. 有 AI Key（默认 DeepSeek，OpenAI 兼容协议）→ 调模型做流式深度解盘。
* 2. 无 Key / 模型调用失败 → 用排盘引擎自有的数据（主星、格局、四化、
* 大限）拼一段规则版解读，保证没 Key 也能用，且只说盘上已有的星曜宫位。
*
* Key 只从环境变量读，绝不写进代码和仓库：
* AI_PROVIDER=deepseek（默认）| openai | mimo | custom
* DEEPSEEK_API_KEY / OPENAI_API_KEY / MIMO_API_KEY / AI_API_KEY
* AI_MODEL / MIMO_MODEL（默认 deepseek-chat）
* AI_BASE_URL / MIMO_BASE_URL（自定义 OpenAI 兼容端点）
*/
import 'server-only';
import type { ZiweiChart, Palace, SiHua} from './types';
import { STEMS, BRANCHES, STAR_DESCRIPTIONS} from './constants';
import { detectPatterns, getMingGongSummary} from './patterns';

// ────────────────── Provider 配置 ──────────────────

export interface ProviderConfig {
provider: string;
baseUrl: string;
apiKey: string;
model: string;
}

export function resolveProvider(): ProviderConfig | null {
const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
if (provider === 'deepseek') {
const apiKey = process.env.DEEPSEEK_API_KEY || '';
if (!apiKey) return null;
return { provider, baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1', apiKey, model: process.env.AI_MODEL || 'deepseek-chat'};
}
if (provider === 'openai') {
const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) return null;
return { provider, baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1', apiKey, model: process.env.AI_MODEL || 'gpt-4o-mini'};
}
if (provider === 'mimo') {
const apiKey = process.env.MIMO_API_KEY || '';
if (!apiKey) return null;
return { provider, baseUrl: process.env.MIMO_BASE_URL || process.env.AI_BASE_URL || '', apiKey, model: process.env.MIMO_MODEL || process.env.AI_MODEL || ''};
}
// custom：任意 OpenAI 兼容端点
const apiKey = process.env.AI_API_KEY || '';
const baseUrl = process.env.AI_BASE_URL || '';
if (!apiKey ||!baseUrl) return null;
return { provider: 'custom', baseUrl, apiKey, model: process.env.AI_MODEL || ''};
}

// ────────────────── System Prompt ──────────────────

export const INTERPRET_SYSTEM_PROMPT = `你是精研紫微斗数三合派读盘体系的命理老师。请依据下面这张已经排好的命盘做解读。
注意：只用你自己的话概括传统三合派观点，不要引用任何人的原话，不要编造引文或出处。

读盘规则（务必遵守）：
1. 四化只用生年四化，终身固定；不使用宫干自化、飞星四化、来因宫等飞星派方法。
2. 论一宫必看三方四正（本宫、对宫、两个三合宫）；空宫借对宫主星论，力量打折。
3. 命宫看先天个性与格局，身宫看后天方向；化忌所在是此生功课，化忌所冲之宫是压力来源。
4. 大限、流年只看宫位移动后遇到的本命星曜与生年四化。
5. 健康部分只给调养方向，不做疾病诊断，不开药方，并提醒身体不适要及时就医。
6. 不做具体投资、投机、医疗、法律方面的确定性断言；不编造不存在的星曜、宫位和格局；不要伪造任何人的原话或出处，可以讲观点，不可以编引文。
7. 不要宿命论式的恐吓，说到凶处必须给出可行的趋避建议。
8. 用简体中文白话，语气笃定而温和，像老师当面讲盘；以盘面为据，点出具体的宫位与星曜。
9. 结尾必须加一句：免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。命由己造，运可自转。`;

// ────────────────── 命盘摘要（给模型 / 规则解读共用） ──────────────────

const SIHUA_MEANING: Record<SiHua, string> = {
'禄': '缘起与收获，得之顺遂',
'权': '掌控与进取，主动争取',
'科': '名声与贵人，解厄之吉',
'忌': '执着与功课，欠缺与压力所在',
};

function palaceLine(p: Palace): string {
const stars = p.stars
.filter((s) => s.type!== 'minor')
.map((s) => `${s.name}${s.brightnessRaw? `(${s.brightnessRaw})`: ''}${s.siHua? `化${s.siHua}`: ''}`)
.join('、') || '无主星';
const self = (p.selfSihua || []).map((m) => `${m.starName}自化${m.siHua}`).join('、');
return `${p.name}（${STEMS[p.stem]}${BRANCHES[p.branch]}${p.isShenGong? '，身宫': ''}，大限${p.daXianAge? `${p.daXianAge[0]}-${p.daXianAge[1]}`: ''}）：${stars}${p.isEmpty && p.borrowedStars?.length? `；空宫借对宫${p.borrowedStars.join('、')}`: ''}${self? `；${self}`: ''}`;
}

/** 给模型的精简命盘文本（只含盘上事实，不含解读） */
export function buildChartSummary(chart: ZiweiChart): string {
const b = chart.birthInfo;
const ming = chart.palaces.find((p) => p.branch === chart.mingGongBranch);
const cur = chart.daXians[chart.currentDaXianIndex];
const patterns = detectPatterns(chart);
const lines: string[] = [];
lines.push(`基本：${b.gender === 'male'? '乾造男命': '坤造女命'}，公历 ${b.year}-${b.month}-${b.day} ${BRANCHES[b.hour]}时；农历 ${chart.lunarInfo.lunarYear}年${Math.abs(chart.lunarInfo.lunarMonth)}月${chart.lunarInfo.lunarDay}日${chart.lunarInfo.isLeapMonth? '（闰月）': ''}；${chart.wuxingJuName}；命主${chart.mingZhu || ''}，身主${chart.shenZhu || ''}；${chart.yinYangGender || ''}；虚岁 ${chart.currentAge}。`);
lines.push('十二宫：');
for (const p of chart.palaces) lines.push(palaceLine(p));
const sihua = chart.palaces.flatMap((p) => p.stars.filter((s) => s.siHua).map((s) => `${s.name}化${s.siHua}在${p.name}`));
if (sihua.length) lines.push(`生年四化：${sihua.join('；')}`);
if (patterns.length) {
lines.push(`格局：${patterns.map((x) => `${x.name}（${x.level === 'excellent'? '上格': x.level === 'good'? '吉格': x.level === 'caution'? '警示': '中性'}）：${x.description}${x.conditions?.breaking?.length? ` 破格：${x.conditions.breaking.join('；')}`: ''}`).join('\n')}`);
}
if (cur) {
const cp = chart.palaces.find((p) => p.branch === cur.palaceBranch);
lines.push(`当前大限：${cur.startAge}-${cur.endAge} 岁，大限命宫在本命${cur.palaceName}${cp? `，主星 ${cp.stars.filter((s) => s.type === 'major').map((s) => s.name).join('、') || '空宫'}`: ''}${cur.siHua? `；大限四化：${cur.siHua.lu}化禄、${cur.siHua.quan}化权、${cur.siHua.ke}化科、${cur.siHua.ji}化忌`: ''}`);
}
return lines.join('\n');
}

// ────────────────── 规则版解读（无 Key 兜底） ──────────────────

type Topic = 'overview' | 'love' | 'career' | 'wealth' | 'health' | 'personality' | 'daxian';

function detectTopic(question: string): Topic {
const q = question || '';
if (/感情|夫妻|婚姻|桃花|恋爱|对象|配偶/.test(q)) return 'love';
if (/事业|工作|官禄|职业|创业|换工作|升职/.test(q)) return 'career';
if (/财|钱|收入|投资|理财|赚钱/.test(q)) return 'wealth';
if (/健康|身体|疾厄|病|养生/.test(q)) return 'health';
if (/性格|个性|脾气|人际/.test(q)) return 'personality';
if (/大限|流年|今年|明年|运势|运程/.test(q)) return 'daxian';
return 'overview';
}

function palaceByName(chart: ZiweiChart, name: string): Palace | undefined {
// 盘上宫名有的带“宫”后缀（命宫），有的不带（夫妻、官禄、仆役），统一去掉后缀再比对
const norm = (s: string) => s.replace(/宫$/, '');
return chart.palaces.find((p) => norm(p.name) === norm(name));
}

function starText(p: Palace | undefined): string {
if (!p) return '未找到该宫';
const majors = p.stars.filter((s) => s.type === 'major');
if (!majors.length) return `${p.name}空宫，借对宫${p.borrowedStars?.join('、') || ''}来看，力量打折`;
return majors
.map((s) => {
const d = STAR_DESCRIPTIONS[s.name];
return `${s.name}${s.brightnessRaw? `（${s.brightnessRaw}）`: ''}${s.siHua? `化${s.siHua}（${SIHUA_MEANING[s.siHua]}）`: ''}${d? `，${d.keywords}`: ''}`;
})
.join('；');
}

function sanFangText(chart: ZiweiChart, palaceName: string): string {
const p = palaceByName(chart, palaceName);
if (!p) return '';
const idx = [p.branch, (p.branch + 4) % 12, (p.branch + 8) % 12, (p.branch + 6) % 12];
return idx
.map((b) => chart.palaces.find((x) => x.branch === b))
.filter((x): x is Palace =>!!x)
.map((x) => `${x.name}${x.stars.filter((s) => s.type === 'major').map((s) => s.name).join('、') || '空宫'}`)
.join('、');
}

/** 规则版解读：只用盘上已有的数据拼写，不编造。 */
export function buildRuleInterpretation(chart: ZiweiChart, question = '', headerNote?: string): string {
const topic = detectTopic(question);
const ming = palaceByName(chart, '命宫');
const summary = getMingGongSummary(chart);
const patterns = detectPatterns(chart).filter((p) => p.level!== 'neutral');
const cur = chart.daXians[chart.currentDaXianIndex];
const sihuaStars = chart.palaces.flatMap((p) => p.stars.filter((s) => s.siHua).map((s) => ({ star: s.name, hua: s.siHua as SiHua, palace: p.name})));
const ji = sihuaStars.find((s) => s.hua === '忌');

const out: string[] = [];
out.push(headerNote ?? '（规则版解读）当前未配置 AI Key，以下是按排盘数据与三合派读盘规则生成的解读（非 AI 生成）。配置 DEEPSEEK_API_KEY 后可获得 AI 深度解盘。');
out.push('');

// 命格总论（各主题都先给一句定性）
const mingStars = summary.stars.join('、') || '空宫';
out.push('**命格定性**');
out.push(`命宫${mingStars}坐守${ming? `${STEMS[ming.stem]}${BRANCHES[ming.branch]}宫`: ''}，${chart.wuxingJuName}，${summary.nature? `命主星性为${summary.nature}`: ''}。命宫关键词：${summary.keywords.join('、') || '无'}。身宫在${chart.palaces.find((p) => p.isShenGong)?.name || ''}，后天发展看身宫方向。`);
if (patterns.length) {
out.push(`识别到 ${patterns.length} 个主要格局：${patterns.slice(0, 5).map((p) => `${p.name}（${p.level === 'excellent'? '上格': p.level === 'good'? '吉格': '警示'}）`).join('、')}。`);
for (const p of patterns.slice(0, 3)) {
out.push(`「${p.name}」：${p.description}${p.conditions?.breaking?.length? ` 注意破格：${p.conditions.breaking.join('；')}`: ''}`);
}
}
out.push('');

const palaceSection = (title: string, name: string, extra?: string) => {
out.push(`**${title}**`);
out.push(`${name}：${starText(palaceByName(chart, name))}。`);
out.push(`三方四正：${sanFangText(chart, name)}。`);
if (extra) out.push(extra);
out.push('');
};

if (topic === 'love' || topic === 'overview') {
palaceSection(topic === 'love'? '感情婚姻': '夫妻宫', '夫妻宫',
'夫妻宫看感情的缘分深浅与相处模式；化忌、煞星落夫妻宫，多主感情中要多磨合、少计较。');
}
if (topic === 'career' || topic === 'overview') {
palaceSection(topic === 'career'? '事业': '官禄宫', '官禄宫',
'官禄宫看事业方向与成就方式；命、财、官三方联动，财帛宫为赚钱手段，官禄宫为事业舞台。');
}
if (topic === 'wealth' || topic === 'overview') {
palaceSection(topic === 'wealth'? '财运': '财帛宫', '财帛宫',
'财帛宫看赚钱方式，田宅宫看财库与积蓄。化禄入财帛主来财顺，化忌入财帛主花钱处要留心。');
}
if (topic === 'health') {
palaceSection('健康', '疾厄宫',
'疾厄宫星曜对应先天较弱的系统，只作调养方向参考，不构成诊断；身体不适请及时就医。');
}
if (topic === 'personality') {
out.push('**性格**');
out.push(`命宫${mingStars}：${summary.keywords.join('、')}。迁移宫（外出与人前形象）：${starText(palaceByName(chart, '迁移宫'))}。福德宫（内心与精神享受）：${starText(palaceByName(chart, '福德宫'))}。`);
out.push('');
}

// 四化
out.push('**生年四化**');
if (sihuaStars.length) {
for (const s of sihuaStars) out.push(`${s.star}化${s.hua}入${s.palace}：${SIHUA_MEANING[s.hua]}。`);
if (ji) out.push(`其中${ji.star}化忌在${ji.palace}，是此生要下的功课：该宫所主之事容易反复、牵挂，宜放下执着、按部就班。`);
} else {
out.push('本命盘无生年四化落点记录。');
}
out.push('');

// 大限
if (topic === 'daxian' || topic === 'overview') {
out.push('**当前大限**');
if (cur) {
const cp = chart.palaces.find((p) => p.branch === cur.palaceBranch);
out.push(`${cur.startAge}–${cur.endAge} 岁，大限命宫在本命${cur.palaceName}：${cp? starText(cp): ''}。`);
if (cur.siHua) out.push(`大限四化：${cur.siHua.lu}化禄、${cur.siHua.quan}化权、${cur.siHua.ke}化科、${cur.siHua.ji}化忌，看这十年机会与压力落在哪里。`);
out.push('大限看十年环境，流年看一年事项；运走到哪一宫，就看该宫的本命星曜与生年四化。');
} else {
out.push('未取到当前大限。');
}
out.push('');
}

out.push('免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。命由己造，运可自转。');
return out.join('\n');
}
