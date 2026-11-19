/**
* POST /api/heming —— 合盘 AI 逐宫解读（商业版）
*
* 请求：{ chartA, chartB, question?, mode?: 'ai'|'rule', deviceId?}
* 响应：
* - 规则版（mode:"rule"）：免费，SSE 全文（逐宫对照 + 合八字要点），
* X-Heming-Mode: rule，不计免费次数，不走限流。
* - AI 逐宫（默认）：与 /api/interpret 同一套付费墙——首次免费 1 次
* （与单盘 AI 共用同一免费计数），只给前半段；之后未付费返回
* 402，不调用模型。限流每 IP 每分钟 3 次 AI 请求，429 带
* retryAfterSeconds（前端只提示一次 + 倒计时）。
* - 非法盘/生日：400；请求体 > 64 KiB：413。
*
* AI 逐宫：按命宫 / 夫妻宫 / 福德宫 / 财帛宫 / 官禄宫 / 迁移宫
* 六宫逐宫对照双方主星与四化，再给合八字要点与相处建议。
* 模型失败 → 降级为规则版逐宫解读（X-Heming-Mode: rule-fallback），
* 不让用户空手而归。
*/
import { NextRequest} from 'next/server';
import type { ZiweiChart} from '@/lib/ziwei/types';
import { INTERPRET_SYSTEM_PROMPT, buildChartSummary} from '@/lib/ziwei/interpret';
import { callAiFullText} from '@/lib/ziwei/ai-client';
import { baziMatch, synastryRule, buildRuleHeming } from '@/lib/ziwei/heming';
import {
PRICING,
DISCLAIMER,
MAX_BODY_BYTES,
checkRateLimit,
clientIp,
fingerprint,
getFreeUsesLeft,
consumeFreeUse,
hasPaidAccess,
validateBirth,
firstFreePreview,
withDisclaimer,
paywallBody,
} from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sse = (text: string) => `data: ${JSON.stringify({ delta: { text}})}\n\n`;

function streamText(full: string): ReadableStream<Uint8Array> {
const enc = new TextEncoder();
const CHUNK = 120;
let i = 0;
return new ReadableStream({
pull(controller) {
if (i >= full.length) {
controller.enqueue(enc.encode('data: [DONE]\n\n'));
controller.close();
return;
}
controller.enqueue(enc.encode(sse(full.slice(i, i + CHUNK))));
i += CHUNK;
},
});
}

function sseHeaders(extra: Record<string, string> = {}) {
return {
'Content-Type': 'text/event-stream; charset=utf-8',
'Cache-Control': 'no-cache, no-transform',
Connection: 'keep-alive',
...extra,
};
}

const HEMING_PALACES = ['命宫', '夫妻宫', '福德宫', '财帛宫', '官禄宫', '迁移宫'];

export async function POST(req: NextRequest) {
const contentLength = req.headers.get('content-length');
if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
return Response.json({ error: `请求体过大（上限 ${MAX_BODY_BYTES / 1024} KiB）`}, { status: 413});
}
let raw = '';
try {
raw = await req.text();
} catch {
return Response.json({ error: '请求体读取失败'}, { status: 400});
}
if (raw.length > MAX_BODY_BYTES) {
return Response.json({ error: `请求体过大（上限 ${MAX_BODY_BYTES / 1024} KiB）`}, { status: 413});
}
let body: {
chartA?: ZiweiChart;
chartB?: ZiweiChart;
question?: string;
mode?: string;
deviceId?: string;
};
try {
body = JSON.parse(raw);
} catch {
return Response.json({ error: '请求体不是合法 JSON'}, { status: 400});
}
const { chartA, chartB} = body;
if (
!chartA ||!Array.isArray(chartA.palaces) || chartA.palaces.length!== 12 ||
!chartB ||!Array.isArray(chartB.palaces) || chartB.palaces.length!== 12
) {
return Response.json({ error: '缺少合法的双方命盘数据（chartA/chartB 的 palaces 须为 12 宫）'}, { status: 400});
}
const birthError = validateBirth(chartA.birthInfo)?? validateBirth(chartB.birthInfo);
if (birthError) {
return Response.json({ error: birthError}, { status: 400});
}

const ip = clientIp(req.headers.get('x-forwarded-for'), null);
const ua = req.headers.get('user-agent')?? '';
const fp = fingerprint(ip, typeof body.deviceId === 'string'? body.deviceId: '', ua);
const question = typeof body.question === 'string'? body.question: '';

// ── 规则版：一直免费，不计免费次数，不走限流 ──
if (body.mode === 'rule') {
const text = buildRuleHeming(chartA, chartB, question);
return new Response(streamText(text), {
headers: sseHeaders({ 'X-Heming-Mode': 'rule', 'X-Free-Uses-Left': String(getFreeUsesLeft(fp))}),
});
}

// ── AI 路径：先限流，再算付费墙（与 /api/interpret 共用免费计数） ──
const limit = checkRateLimit(ip);
if (!limit.allowed) {
return Response.json(
{ error: limit.reason?? '请求太频繁', status: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds?? 60},
{ status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds?? 60)}},
);
}
const freeLeft = getFreeUsesLeft(fp);
const isFreePreview = freeLeft > 0 &&!hasPaidAccess(fp, 'full');
if (!isFreePreview &&!hasPaidAccess(fp, 'full')) {
return Response.json(paywallBody('full', freeLeft), { status: 402});
}
if (isFreePreview) consumeFreeUse(fp);

const syn = synastryRule(chartA, chartB);
const bazi = baziMatch(chartA, chartB);
const aiMessages = [
{ role: 'system', content: INTERPRET_SYSTEM_PROMPT},
{
role: 'user',
content:
'下面是两个人的命盘资料（只含盘上事实），请做合盘 AI 逐宫解读。\n' +
`逐宫顺序：${HEMING_PALACES.join('、')}，每宫一节，标题形如 ****，每节先写双方该宫主星与四化对照，再写这一宫的相处要点。\n` +
`规则版对照总判（供参考，不要照抄）：${syn.verdict}\n` +
(bazi? `合八字要点：${bazi.lines.join(' ')}（只作参考，合八字不能单独断婚姻）。\n`: '') +
(question.trim()? `对方还问：${question.trim()}\n`: '') +
'\n甲方命盘：\n' + buildChartSummary(chartA) +
'\n\n乙方命盘：\n' + buildChartSummary(chartB),
},
];
const ai = await callAiFullText(aiMessages);
if (ai) {
const out = isFreePreview
? firstFreePreview(ai.text, 'full')
: withDisclaimer(ai.text);
return new Response(streamText(out), {
headers: sseHeaders({
'X-Heming-Mode': isFreePreview? 'ai-free-preview': 'ai',
'X-Free-Uses-Left': String(getFreeUsesLeft(fp)),
}),
});
}

// ── 规则版降级 ──
const text = `（提示）AI 解读暂时不可用，先给你规则版合盘解读：\n\n${buildRuleHeming(chartA, chartB, question)}`;
return new Response(streamText(text), {
headers: sseHeaders({ 'X-Heming-Mode': 'rule-fallback', 'X-Free-Uses-Left': String(getFreeUsesLeft(fp))}),
});
}
