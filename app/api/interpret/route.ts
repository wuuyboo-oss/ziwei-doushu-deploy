/**
 * POST /api/interpret —— AI 命盘解读（商业版）
 *
 * 请求：{ chart: ZiweiChart, messages: [{ role, content }], scope?: 'full'|'career'|'love',
 *         mode?: 'ai'|'rule', deviceId?: string }
 * 响应：
 * - 规则版（mode:"rule"）：免费，SSE 全文，X-Interpret-Mode: rule
 * - AI 首次免费：只给命格总览（full）前半段，SSE，X-Interpret-Mode: ai-free-preview
 * - AI 再次请求且未付费：402 JSON（见 lib/ziwei/commercial.ts paywallBody），不调用模型
 * - 限流：429 JSON；请求体过大：413；出生日期非法：400
 *
 * 调用顺序（AI）：
 *  1. DeepSeek helper（本机已接通的连接器 ~/workspace/custom-connectors/
 *     custom.deepseek/bin/deepseek.py chat-json，key 走 surrogate，不落地、
 *     不进代码、不进日志）→ 非流式取回全文，再切块成 SSE 流返回
 *  2. 环境变量里的 AI Key（见 .env.example，OpenAI 兼容接口）
 *     —— 部署环境（Render/Railway 等）没有 helper，必须用这条路，
 *     DEEPSEEK_API_KEY 只放在服务端环境变量里。
 *  3. 未配置 Key，或模型调用失败 → 规则版解读（lib/ziwei/interpret.ts），
 *     并在文首注明原因
 *
 * 免费次数按 IP + 设备指纹计数（commercial.ts，本地文件持久化）。
 * 每份解读末尾必带免责声明（commercial.ts DISCLAIMER）。
 */
import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ZiweiChart } from '@/lib/ziwei/types';
import {
  resolveProvider,
  INTERPRET_SYSTEM_PROMPT,
  buildChartSummary,
  buildRuleInterpretation,
} from '@/lib/ziwei/interpret';
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
  normalizeScope,
  scopeFromQuestion,
  validateBirth,
  firstFreePreview,
  withDisclaimer,
  paywallBody,
} from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sse = (text: string) => `data: ${JSON.stringify({ delta: { text } })}\n\n`;

/** 把一段完整文本切块成 SSE 流 */
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

// ── DeepSeek helper（连接器，surrogate 换 key） ──

function helperPath(): string | null {
  const home = process.env.HOME || '/home/hatch';
  const p = `${home}/workspace/custom-connectors/custom.deepseek/bin/deepseek.py`;
  return existsSync(p) ? p : null;
}

/** 经 helper 调一次 DeepSeek chat completions（非流式），返回正文。失败时抛错。 */
function callDeepSeekViaHelper(
  messages: { role: string; content: string }[],
  model: string,
): Promise<string> {
  const helper = helperPath();
  if (!helper) return Promise.reject(new Error('deepseek helper 不存在'));
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [helper, 'chat-json'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('deepseek helper 超时（180s）'));
    }, 180_000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const hint = /402/.test(err) ? '（DeepSeek 余额不足，请先充值）' : '';
        return reject(new Error(`deepseek helper 退出码 ${code}${hint}`));
      }
      try {
        const json = JSON.parse(out);
        const text: string = json.choices?.[0]?.message?.content ?? '';
        if (!text.trim()) return reject(new Error('deepseek 返回了空内容'));
        resolve(text);
      } catch {
        reject(new Error('deepseek helper 返回了无法解析的结果'));
      }
    });
    child.stdin.write(JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 3000,
      messages,
    }));
    child.stdin.end();
  });
}

/** 经 env-key 上游取回 AI 全文（非流式，供免费试读截断用）；失败返回 null。 */
async function callEnvKeyFullText(
  aiMessages: { role: string; content: string }[],
  cfg: NonNullable<ReturnType<typeof resolveProvider>>,
): Promise<string | null> {
  try {
    const upstream = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        temperature: 0.7,
        max_tokens: 3000,
        messages: aiMessages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) {
      console.error('[interpret] env-key 上游返回', upstream.status);
      return null;
    }
    const json = await upstream.json();
    const text: string = json.choices?.[0]?.message?.content ?? '';
    return text.trim() ? text : null;
  } catch (e) {
    console.error('[interpret] env-key 调用失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const helper = !!helperPath();
  const cfg = resolveProvider();
  const ai = helper || !!cfg;
  const ip = clientIp(req.headers.get('x-forwarded-for'), null);
  const fp = fingerprint(ip, req.nextUrl.searchParams.get('deviceId') ?? '', req.headers.get('user-agent') ?? '');
  return Response.json({
    status: 'ok',
    mode: ai ? 'ai' : 'rule',
    backend: helper ? 'deepseek-helper' : cfg ? 'env-key' : null,
    provider: cfg?.provider ?? (helper ? 'deepseek' : null),
    model: process.env.AI_MODEL || 'deepseek-chat',
    pricing: {
      full: { price: PRICING.full.price, label: PRICING.full.label },
      career: { price: PRICING.career.price, label: PRICING.career.label },
      love: { price: PRICING.love.price, label: PRICING.love.label },
    },
    freeUsesLeft: getFreeUsesLeft(fp),
    pay: { status: 'manual_qr', message: '手动收款码付款，人工核对后解锁' },
    disclaimer: DISCLAIMER,
    note: ai
      ? 'AI 解读已配置（首次免费 1 次，仅命格总览前半段；之后付费解锁）'
      : '未配置 AI Key，当前使用规则版解读；设置 DEEPSEEK_API_KEY 后可开启 AI 深度解盘',
  });
}

export async function POST(req: NextRequest) {
  // ── 防刷：请求体大小限制 ──
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
  let body: {
    chart?: ZiweiChart;
    messages?: { role: string; content: string }[];
    scope?: string;
    mode?: string;
    deviceId?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  const { chart, messages = [] } = body;
  if (!chart || !Array.isArray(chart.palaces) || chart.palaces.length !== 12) {
    return Response.json({ error: '缺少合法的命盘数据（chart.palaces 须为 12 宫）' }, { status: 400 });
  }
  // ── 防刷：出生日期合法性校验 ──
  const birthError = validateBirth(chart.birthInfo);
  if (birthError) {
    return Response.json({ error: birthError }, { status: 400 });
  }

  const ip = clientIp(req.headers.get('x-forwarded-for'), null);
  const ua = req.headers.get('user-agent') ?? '';
  const fp = fingerprint(ip, typeof body.deviceId === 'string' ? body.deviceId : '', ua);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const scope = normalizeScope(body.scope ?? scopeFromQuestion(lastUser));
  const summary = buildChartSummary(chart);
  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-6)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── 规则版：一直免费，不计免费次数，不走限流 ──
  if (body.mode === 'rule') {
    const text = withDisclaimer(
      buildRuleInterpretation(chart, lastUser),
    );
    return new Response(streamText(text), {
      headers: sseHeaders({ 'X-Interpret-Mode': 'rule', 'X-Free-Uses-Left': String(getFreeUsesLeft(fp)) }),
    });
  }

  // ── AI 路径：先限流，再算付费墙（付费墙内请求不调用模型，不烧 token） ──
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: limit.reason ?? '请求太频繁', status: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds ?? 60 },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) } },
    );
  }
  const freeLeft = getFreeUsesLeft(fp);
  const isFreePreview = scope === 'full' && freeLeft > 0 && !hasPaidAccess(fp, scope);
  if (!isFreePreview && !hasPaidAccess(fp, scope)) {
    return Response.json(paywallBody(scope, freeLeft), { status: 402 });
  }
  // 免费试读：先消费次数（即使模型随后失败也不退回，避免反复刷免费额度）
  if (isFreePreview) consumeFreeUse(fp);

  const aiMessages = [
    { role: 'system', content: INTERPRET_SYSTEM_PROMPT },
    { role: 'user', content: `下面是已经排好的命盘资料（只含盘上事实）：\n\n${summary}` },
    ...history,
  ];
  const model = process.env.AI_MODEL || 'deepseek-chat';

  // ── 1. DeepSeek helper（已接通的连接器） ──
  if (helperPath()) {
    try {
      const text = await callDeepSeekViaHelper(aiMessages, model);
      const out = isFreePreview
        ? firstFreePreview(text, scope)
        : withDisclaimer(text);
      return new Response(streamText(out), {
        headers: sseHeaders({
          'X-Interpret-Mode': isFreePreview ? 'ai-free-preview' : 'ai',
          'X-Free-Uses-Left': String(getFreeUsesLeft(fp)),
        }),
      });
    } catch (e) {
      console.error('[interpret] deepseek helper 失败:', e instanceof Error ? e.message : e);
    }
  }

  // ── 2. 环境变量里的 AI Key（OpenAI 兼容接口；部署环境用这条路） ──
  const cfg = resolveProvider();
  if (cfg) {
    const text = await callEnvKeyFullText(aiMessages, cfg);
    if (text) {
      const out = isFreePreview ? firstFreePreview(text, scope) : withDisclaimer(text);
      return new Response(streamText(out), {
        headers: sseHeaders({
          'X-Interpret-Mode': isFreePreview ? 'ai-free-preview' : 'ai',
          'X-Free-Uses-Left': String(getFreeUsesLeft(fp)),
        }),
      });
    }
  }

  // ── 3. 规则版解读兜底（免费；AI 失败不让用户空手而归） ──
  const text = withDisclaimer(
    buildRuleInterpretation(
      chart,
      lastUser,
      '（规则版解读）AI 接口这次没能返回结果，以下是按排盘数据生成的规则版解读。',
    ),
  );
  return new Response(
    streamText(`（提示）AI 解读暂时不可用，先给你规则版解读：\n\n${text}`),
    { headers: sseHeaders({ 'X-Interpret-Mode': 'rule-fallback', 'X-Free-Uses-Left': String(getFreeUsesLeft(fp)) }) },
  );
}
