// @ts-nocheck — 仅供 npx tsx 本地验证商业版逻辑，不参与 Next 构建类型检查
/**
 * 商业版验证脚本：不发 HTTP、不调模型，只测纯逻辑。
 * 跑：npm run verify:commercial
 *
 * 覆盖：已知生日排盘、出生日期校验、限流、免费次数、试读截断、
 * 付费墙响应体、免责声明、系统提示词无原话引用、原话库已清空。
 * 真实 HTTP 端到端验证见 BUILD-NOTES（另起 npm start + curl）。
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

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  // 隔离免费计数：写到临时目录，不污染开发用的 .data
  process.env.COMMERCIAL_DATA_DIR = '/tmp/ziwei-commercial-verify';
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { buildRuleInterpretation, INTERPRET_SYSTEM_PROMPT } = await import('../lib/ziwei/interpret');
  const c = await import('../lib/ziwei/commercial');
  const { TIANJI_QUOTES } = await import('../lib/nihai/tianji');

  // 1. 已知生日排盘：1990-01-01 男 子时
  const chart = generateChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
  const ming = chart.palaces.find((p) => p.branch === chart.mingGongBranch);
  check('排盘：命宫天府庙', ming?.stars.some((s) => s.name === '天府' && s.brightnessRaw === '庙') ?? false, JSON.stringify(ming?.stars));
  check('排盘：水二局', chart.wuxingJuName === '水二局', chart.wuxingJuName);
  const cur = chart.daXians[chart.currentDaXianIndex];
  check('排盘：当前大限 32-41', cur?.startAge === 32 && cur?.endAge === 41, JSON.stringify(cur));

  // 2. 出生日期校验
  check('校验：合法生日通过', c.validateBirth({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' }) === null);
  check('校验：2 月 30 日拒绝', typeof c.validateBirth({ year: 2023, month: 2, day: 30, hour: 0, gender: 'female' }) === 'string');
  check('校验：闰年 2 月 29 日通过', c.validateBirth({ year: 2024, month: 2, day: 29, hour: 5, gender: 'female' }) === null);
  check('校验：平年 2 月 29 日拒绝', typeof c.validateBirth({ year: 2023, month: 2, day: 29, hour: 5, gender: 'female' }) === 'string');
  check('校验：未来生日拒绝', typeof c.validateBirth({ year: 2099, month: 1, day: 1, hour: 0, gender: 'male' }) === 'string');
  check('校验：时辰 12 拒绝', typeof c.validateBirth({ year: 1990, month: 1, day: 1, hour: 12, gender: 'male' }) === 'string');
  check('校验：年份 1800 拒绝', typeof c.validateBirth({ year: 1800, month: 1, day: 1, hour: 0, gender: 'male' }) === 'string');
  check('校验：性别非法拒绝', typeof c.validateBirth({ year: 1990, month: 1, day: 1, hour: 0, gender: 'other' }) === 'string');

  // 3. 限流：同 IP 3 次放行，第 4 次挡住；不同 IP 不受影响
  c.__resetRateLimits();
  const ip = '203.0.113.7';
  check('限流：第 1-3 次放行',
    c.checkRateLimit(ip).allowed && c.checkRateLimit(ip).allowed && c.checkRateLimit(ip).allowed);
  const fourth = c.checkRateLimit(ip);
  check('限流：第 4 次挡住', !fourth.allowed, JSON.stringify(fourth));
  check('限流：不同 IP 放行', c.checkRateLimit('198.51.100.9').allowed);

  // 4. 免费次数：新鲜指纹剩 1，消费后剩 0，再消费仍为 0
  c.__resetFreeUses();
  const fp = c.fingerprint('203.0.113.7', 'device-verify-001', 'verify-agent/1.0');
  check('免费次数：新鲜指纹剩 1', c.getFreeUsesLeft(fp) === 1, String(c.getFreeUsesLeft(fp)));
  check('免费次数：消费后剩 0', c.consumeFreeUse(fp) === 0);
  check('免费次数：重复消费仍为 0', c.consumeFreeUse(fp) === 0 && c.getFreeUsesLeft(fp) === 0);
  check('免费次数：不同指纹互不影响', c.getFreeUsesLeft(c.fingerprint('203.0.113.7', 'device-other', 'verify-agent/1.0')) === 1);

  // 5. 试读截断：前半段 + 提示 + 定价 + 免责声明
  const full = '甲段。\n\n乙段。\n\n丙段。\n\n丁段。\n\n戊段。\n\n己段。';
  const preview = c.firstFreePreview(full, 'full');
  check('试读：短于全文', preview.length < full.length + 200 && preview.includes('免费试读到此为止'));
  check('试读：含全份定价 ¥19.9', preview.includes('¥19.9'));
  check('试读：含免责声明', preview.includes('不构成医疗、投资、法律建议'));
  check('试读：不含后半段内容', !preview.includes('己段'));

  // 6. 付费墙：402 体、单维 ¥9.9、Dodo 占位、无编造的订单号/链接
  const wall = c.paywallBody('career', 0);
  check('付费墙：status=pay_required', wall.status === 'pay_required');
  check('付费墙：事业单维 ¥9.9', wall.price === 9.9);
  check('付费墙：Dodo 占位 pending_dodo', wall.pay.status === 'pending_dodo' && wall.pay.message === '支付开通审核中');
  check('付费墙：无订单号/支付链接字段', !('orderId' in wall) && !('order_id' in wall) && !('payUrl' in wall) && !('checkoutUrl' in wall));
  check('付费墙：全份 ¥19.9', c.paywallBody('full', 0).price === 19.9);

  // 7. 免责声明：追加一次，不重复
  check('免责声明：追加且不重复',
    c.withDisclaimer('正文').endsWith(c.DISCLAIMER) &&
    c.withDisclaimer(`正文\n\n${c.DISCLAIMER}`) === `正文\n\n${c.DISCLAIMER}`);

  // 8. 系统提示词：不提倪海厦、不指令引用原话
  check('提示词：不含“倪海厦”', !INTERPRET_SYSTEM_PROMPT.includes('倪海厦'));
  check('提示词：明确禁引原话', INTERPRET_SYSTEM_PROMPT.includes('不要引用任何人的原话'));
  check('提示词：含完整免责声明', INTERPRET_SYSTEM_PROMPT.includes('不构成医疗、投资、法律建议'));

  // 9. 规则版解读末尾带完整免责声明
  const rule = buildRuleInterpretation(chart, '我的整体命格如何？');
  check('规则版：末尾带免责声明', rule.trimEnd().endsWith(c.DISCLAIMER));

  // 10. 原话库已清空（商业版不收录 CC BY-NC-SA 原话）
  check('许可：TIANJI_QUOTES 已清空', Array.isArray(TIANJI_QUOTES) && TIANJI_QUOTES.length === 0, `len=${TIANJI_QUOTES?.length}`);

  // 11. 付费状态：Dodo 未开通前恒为未付费
  check('付费状态：未开通前无付费权限', c.hasPaidAccess(fp, 'full') === false);

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
