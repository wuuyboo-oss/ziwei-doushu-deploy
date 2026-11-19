/**
 * 服务端 AI 调用（DeepSeek，OpenAI 兼容协议）
 *
 * 与 /api/interpret 同一套调用顺序，供合盘 AI（/api/heming）复用：
 *  1. DeepSeek helper（本机连接器 surrogate，不落地、不进代码、不进日志）
 *  2. 环境变量里的 AI Key（部署环境用这条路，DEEPSEEK_API_KEY 只放服务端 env）
 *  3. 两条路都失败 → 返回 null，调用方降级为规则版解读
 *
 * 本文件不含任何密钥。
 */
import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolveProvider } from './interpret';

export interface AiCallResult {
  text: string;
  backend: 'deepseek-helper' | 'env-key';
}

function helperPath(): string | null {
  const home = process.env.HOME || '/home/hatch';
  const p = `${home}/workspace/custom-connectors/custom.deepseek/bin/deepseek.py`;
  return existsSync(p) ? p : null;
}

function callViaHelper(
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

async function callViaEnvKey(
  messages: { role: string; content: string }[],
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
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok) {
      console.error('[ai-client] env-key 上游返回', upstream.status);
      return null;
    }
    const json = await upstream.json();
    const text: string = json.choices?.[0]?.message?.content ?? '';
    return text.trim() ? text : null;
  } catch (e) {
    console.error('[ai-client] env-key 调用失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** 调一次 AI 取回全文；两条路都失败返回 null（调用方自行降级）。 */
export async function callAiFullText(
  messages: { role: string; content: string }[],
): Promise<AiCallResult | null> {
  const model = process.env.AI_MODEL || 'deepseek-chat';
  if (helperPath()) {
    try {
      const text = await callViaHelper(messages, model);
      return { text, backend: 'deepseek-helper' };
    } catch (e) {
      console.error('[ai-client] deepseek helper 失败:', e instanceof Error ? e.message : e);
    }
  }
  const cfg = resolveProvider();
  if (cfg) {
    const text = await callViaEnvKey(messages, cfg);
    if (text) return { text, backend: 'env-key' };
  }
  return null;
}
