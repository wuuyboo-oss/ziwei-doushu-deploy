// @ts-nocheck — 仅供本地验证：输出一条完整 chat-json 请求，供 deepseek.py chat-json 用
import { registerHooks } from 'node:module';

const SERVER_ONLY_STUB = 'data:text/javascript,';
registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => { url: string }) {
    if (specifier === 'server-only') return { url: SERVER_ONLY_STUB, shortCircuit: true } as never;
    return nextResolve(specifier, context);
  },
  load(url: string, context: unknown, nextLoad: (u: string, c: unknown) => unknown) {
    if (url === SERVER_ONLY_STUB) return { format: 'commonjs', source: '', shortCircuit: true } as never;
    return nextLoad(url, context) as never;
  },
});

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { buildChartSummary, INTERPRET_SYSTEM_PROMPT } = await import('../lib/ziwei/interpret');
  const chart = generateChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
  const summary = buildChartSummary(chart);
  const req = {
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: INTERPRET_SYSTEM_PROMPT },
      { role: 'user', content: `下面是已经排好的命盘资料（只含盘上事实）：\n\n${summary}` },
      { role: 'user', content: '请生成命格总览，按以下结构输出：\n\n**命格定性**\n用一句话概括这个命盘的核心格局与命主气质。\n\n**主星解读**\n命宫主星的核心特质。\n\n**三方四正**\n财、官、迁三宫的联动分析及整体格局。\n\n**当前大限**\n当下大限运势方向与最值得关注的事项。\n\n**优势与注意**\n命盘天赋优势，以及需要注意的风险或功课。' },
    ],
  };
  process.stdout.write(JSON.stringify(req));
}

main().catch((e) => { console.error(e); process.exit(1); });
