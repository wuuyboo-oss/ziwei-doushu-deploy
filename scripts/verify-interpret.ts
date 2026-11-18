// @ts-nocheck — 仅供 npx tsx 本地验证，不参与 Next 构建类型检查
/**
 * 验证脚本：生成一张已知生日的命盘，打印摘要与规则版解读，并保存 chart JSON
 * 供 curl 测试 /api/interpret 用。
 *
 * 跑：npx tsx scripts/verify-interpret.ts
 *
 * 注意：lib/ziwei/patterns.ts 带 `import 'server-only'`（Next 构建时才有这个包），
 * 这里沿用仓库回归测试的做法，先把它解析成空模块再 import。
 */
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
  const { buildChartSummary, buildRuleInterpretation } = await import('../lib/ziwei/interpret');
  const fs = await import('node:fs');

  // 已知生日：1990-01-01 男，子时（hour 0）
  const chart = generateChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
  const ming = chart.palaces.find((p) => p.branch === chart.mingGongBranch);
  console.log('命宫地支:', chart.mingGongBranch, '| 身宫:', chart.shenGongBranch, '| 局:', chart.wuxingJuName, '| 虚岁:', chart.currentAge, '| 当前大限idx:', chart.currentDaXianIndex);
  console.log('命宫主星:', JSON.stringify(ming?.stars));
  console.log('--- chart summary (前 1200 字) ---');
  console.log(buildChartSummary(chart).slice(0, 1200));
  console.log('--- rule interpretation / overview (前 1500 字) ---');
  console.log(buildRuleInterpretation(chart, '我的整体命格如何？').slice(0, 1500));
  console.log('--- rule interpretation / love ---');
  console.log(buildRuleInterpretation(chart, '我的感情婚姻运势如何？').slice(0, 600));
  fs.writeFileSync('/tmp/chart-1990.json', JSON.stringify(chart));
  console.log('saved /tmp/chart-1990.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
