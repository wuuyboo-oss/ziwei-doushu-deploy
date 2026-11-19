/**
 * 太岁入卦（商业版）
 *
 * 太岁 = 流年地支，落在本命盘地支相同的宫位；太岁是一年之君，
 * 所到之宫就是该年最受瞩目、最易变动之处。算法与解读文字全部
 * 由本系统用自己的话撰写，不引用任何人的原话。
 *
 * 年干支：干支纪年以 (year - 4) 对 10 / 12 取余（2026 年 = 丙午）。
 * 排盘页（ChartBoard 中宫 + 太岁徽章）与运限页（TimeNav 切换流年
 * 后下方的太岁卡片）共用这一个函数。
 */
import type { ZiweiChart, Palace } from './types';
import { STEMS, BRANCHES } from './constants';

export const TAISUI_TEXT: Record<string, string> = {
  '命': '太岁临命，今年是你当头做主的一年：自己的状态、决定与身体状况直接决定全年走向。宜主动担事，也宜稳住节奏，不宜在情绪上头时做大决定。',
  '兄弟': '太岁入兄弟宫，今年手足同辈、合伙与现金周转的事会格外多：有人来帮忙，也有人来分你的精力。合伙、借贷、作保要把账算清楚再点头。',
  '夫妻': '太岁入夫妻宫，今年感情婚姻是全年的焦点：有伴者大事多在另一半身上，单身者缘分出现得比往年明显。关系里的分歧宜摊开谈，不要冷处理。',
  '子女': '太岁入子女宫，今年子女晚辈、合作投资与桃花的事排在前面：为孩子操心的事多，合作的进出也多。投资合作要看清条款，不要只看人情。',
  '财帛': '太岁入财帛宫，今年钱是全年的主题：收入与支出同时活跃，进财的机会多，花钱的地方也多。宜把进账先留一部分下来，不要月月见底。',
  '疾厄': '太岁入疾厄宫，今年身体是第一位的：作息、旧疾与过劳最容易在这一年找上门。体检、睡眠与运动不要拖，累了就歇，不要硬扛。',
  '迁移': '太岁入迁移宫，今年利出外：出差、搬迁、换环境的机会多，在外的表现决定成绩。出门在外多留一份谨慎，证件与行程提前安排。',
  '交友': '太岁入交友宫，今年人来人往：新朋友、合作方、部属轮番登场，贵人可能出现，也可能遇到借力不成反添乱的人。交朋友、用人都要先看后信。',
  '官禄': '太岁入官禄宫，今年事业是全年的重心：工作变动、升迁、换赛道的机会都比往年多。宜把本事做实，机会来了才接得住；变动之前先留后路。',
  '田宅': '太岁入田宅宫，今年家宅的事排在前面：置产、装修、搬家或家里长辈的事都可能集中出现。买房装修多看几家，合同条款逐条看清。',
  '福德': '太岁入福德宫，今年心境变化大：想得多的事、放不下的事会反复出现。宜给自己留出休息与兴趣的时间，心稳了，事才顺。',
  '父母': '太岁入父母宫，今年与长辈上司往来多：父母的身体、长辈的嘱托、文书考试与证照的事都可能找上门。多回家看看，文书合约签字前多看一眼。',
};

export interface TaiSuiResult {
  year: number;
  ganzhi: string; // 流年干支，如 丙午
  branch: number; // 太岁地支索引
  palace: Palace;
  palaceName: string; // 太岁所在宫名（不带“宫”后缀，如 交友）
  palaceGanzhi: string; // 该宫干支，如 庚午
  text: string;
  notes: string[];
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function taiSui(chart: ZiweiChart, year: number): TaiSuiResult {
  const yb = mod(year - 4, 12);
  const ys = mod(year - 4, 10);
  const palace = chart.palaces.find((p) => p.branch === yb) ?? chart.palaces[yb];
  // 商业版引擎把午宫叫「仆役」，站内统一显示为「交友」（与十二宫表一致）
  const palaceName = palace.name.replace(/宫$/, '') === '仆役' ? '交友' : palace.name.replace(/宫$/, '');
  const notes: string[] = [];
  if (palace.branch === chart.mingGongBranch) {
    notes.push('太岁叠命宫：今年是你的当头年，自身状态决定全年，宜主动担事、稳住节奏。');
  }
  if (palace.branch === chart.shenGongBranch) {
    notes.push('太岁叠身宫：今年后天的努力方向与太岁同宫，做的事会直接影响中年以后的走向。');
  }
  if (mod(palace.branch + 6, 12) === chart.mingGongBranch) {
    notes.push('太岁在迁移宫冲命宫：今年外在环境对你的推力特别大，出外与人际的变动多。');
  }
  const ji = palace.stars.find((s) => s.siHua === '忌');
  if (ji) notes.push(`太岁宫坐生年${ji.name}化忌：今年${palaceName}所主之事最牵挂、最费心，宜正面面对、不宜逃避。`);
  const lu = palace.stars.find((s) => s.siHua === '禄');
  if (lu) notes.push(`太岁宫坐生年${lu.name}化禄：今年${palaceName}所主之事有进益，机会多从这里来。`);
  return {
    year,
    ganzhi: `${STEMS[ys]}${BRANCHES[yb]}`,
    branch: yb,
    palace,
    palaceName,
    palaceGanzhi: `${STEMS[palace.stem]}${BRANCHES[palace.branch]}`,
    text: TAISUI_TEXT[palaceName] ?? '',
    notes,
  };
}
