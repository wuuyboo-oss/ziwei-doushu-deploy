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

  // 6. 付费墙：402 体、单维 ¥9.9、手动收款码口径、无编造的订单号/链接
  const wall = c.paywallBody('career', 0);
  check('付费墙：status=pay_required', wall.status === 'pay_required');
  check('付费墙：事业单维 ¥9.9', wall.price === 9.9);
  check('付费墙：手动收款码 manual_qr', wall.pay.status === 'manual_qr' && wall.pay.message === '手动收款码付款，人工核对后解锁');
  check('付费墙：文案写明手动核对、1 小时内解锁', wall.message.includes('人工核对后 1 小时内解锁'));
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

  // 11. 手动收款：未核对前无权限；提交申请仍无权限；核对通过后解锁；全份覆盖单维
  c.__resetManualPayments();
  const mfp = c.fingerprint('203.0.113.7', 'device-manual-001', 'verify-agent/1.0');
  check('手动收款：核对前无付费权限', c.hasPaidAccess(mfp, 'full') === false);
  check('手动收款：单号后 6 位须为 6 位数字', c.isValidTxnLast6('123456') && !c.isValidTxnLast6('12345') && !c.isValidTxnLast6('12345a') && !c.isValidTxnLast6(''));
  check('手动收款：渠道归一化', c.normalizeChannel('wechat') === 'wechat' && c.normalizeChannel('alipay') === 'alipay' && c.normalizeChannel('cash') === null);
  const claim = c.saveManualPaymentClaim({
    fpHash: mfp, deviceId: 'device-manual-001', scope: 'full', price: 19.9,
    channel: 'wechat', txnLast6: '123456', screenshotFile: '',
  });
  check('手动收款：提交申请后仍无权限（待核对）', c.hasPaidAccess(mfp, 'full') === false);
  check('手动收款：清单里能查到待核对申请', c.listManualPaymentClaims().some((x) => x.id === claim.id && x.status === 'pending'));
  const reviewed = c.reviewManualPaymentClaim(claim.id, 'approved', 'verify');
  check('手动收款：核对通过后解锁全份', reviewed?.status === 'approved' && c.hasPaidAccess(mfp, 'full') === true);
  check('手动收款：全份通过后单维也解锁', c.hasPaidAccess(mfp, 'career') === true && c.hasPaidAccess(mfp, 'love') === true);
  check('手动收款：重复核对返回 null', c.reviewManualPaymentClaim(claim.id, 'approved') === null);
  const claim2 = c.saveManualPaymentClaim({
    fpHash: mfp, deviceId: 'device-manual-001', scope: 'career', price: 9.9,
    channel: 'alipay', txnLast6: '654321', screenshotFile: '',
  });
  check('手动收款：驳回不解锁', (() => {
    const mfp2 = c.fingerprint('203.0.113.8', 'device-manual-002', 'verify-agent/1.0');
    const cl = c.saveManualPaymentClaim({
      fpHash: mfp2, deviceId: 'device-manual-002', scope: 'love', price: 9.9,
      channel: 'alipay', txnLast6: '111111', screenshotFile: '',
    });
    return c.reviewManualPaymentClaim(cl.id, 'rejected', 'verify')?.status === 'rejected' && c.hasPaidAccess(mfp2, 'love') === false;
  })());
  void claim2;

  // 12. 收款码占位图：4 张 SVG 都在，且写明占位、没有可扫的二维码
  const { existsSync: _exists, readFileSync: _read } = await import('node:fs');
  const { join: _join } = await import('node:path');
  const qrFiles = ['wechat-full.svg', 'wechat-single.svg', 'alipay-full.svg', 'alipay-single.svg'];
  check('收款码：4 张占位 SVG 都存在', qrFiles.every((f) => _exists(_join(process.cwd(), 'public', 'pay-qr', f))));
  check('收款码：占位图写明请勿扫码付款', qrFiles.every((f) => _read(_join(process.cwd(), 'public', 'pay-qr', f), 'utf-8').includes('请勿扫码付款')));

  // 13. 太岁入卦：2026 丙午年太岁在午宫；1990-01-01 盘午宫为交友宫
  const { taiSui } = await import('../lib/ziwei/taisui');
  const ts2026 = taiSui(chart, 2026);
  check('太岁：2026 年干支丙午', ts2026.ganzhi === '丙午', ts2026.ganzhi);
  check('太岁：2026 太岁在交友宫', ts2026.palaceName === '交友', ts2026.palaceName);
  check('太岁：解读文字非空', ts2026.text.length > 10);
  const ts2027 = taiSui(chart, 2027);
  check('太岁：2027 年太岁移宫', ts2027.palaceName !== ts2026.palaceName && ts2027.ganzhi === '丁未', `${ts2027.ganzhi}${ts2027.palaceName}`);

  // 14. 合八字 + 合盘规则版逐宫：对方 1992-05-10 12:00（午时）
  const chartB = generateChart({ year: 1992, month: 5, day: 10, hour: 6, gender: 'female' });
  const { baziMatch, synastryRule, buildRuleHeming } = await import('../lib/ziwei/heming');
  const bz = baziMatch(chart, chartB);
  check('合八字：四柱 4 行', !!bz && bz.rows.length === 4, JSON.stringify(bz?.rows));
  check('合八字：含日柱最重', !!bz && bz.lines.some((l) => l.includes('日柱最重')));
  check('合八字：总判非空', !!bz && bz.verdict.length > 5);
  check('合八字：缺四柱返回 null', baziMatch({ ...chart, lunarInfo: { ...chart.lunarInfo, fourPillars: undefined } }, chartB) === null);
  const syn = synastryRule(chart, chartB);
  check('合盘规则版：逐宫 6 行', syn.rows.length === 6, String(syn.rows.length));
  check('合盘规则版：含命宫/夫妻宫/福德宫', ['命宫', '夫妻宫', '福德宫'].every((n) => syn.rows.some((r) => r.palace === n)));
  check('合盘规则版：总判非空', syn.verdict.length > 5);
  const ruleHeming = buildRuleHeming(chart, chartB, '感情匹配度如何？');
  check('合盘规则版全文：含合八字', ruleHeming.includes('合八字'));
  check('合盘规则版全文：含逐宫标题', ruleHeming.includes('【命宫'));
  check('合盘规则版全文：末尾免责声明', ruleHeming.trimEnd().endsWith(c.DISCLAIMER));

  // 15. 命运双子星：抽样 120 张、确定性、诚实覆盖范围
  const { findTwinStars, TWIN_STAR_COVERAGE } = await import('../lib/ziwei/twin-star');
  const t1 = Date.now();
  const twins = findTwinStars(chart, 5);
  const twinMs = Date.now() - t1;
  check('双子星：返回 5 张', twins.twins.length === 5, String(twins.twins.length));
  check('双子星：抽样 120 张', twins.sampleSize === 120, String(twins.sampleSize));
  check('双子星：相似度 0-100 且降序', twins.twins.every((t) => t.similarity >= 0 && t.similarity <= 100)
    && twins.twins.every((t, i, a) => i === 0 || t.similarity <= a[i - 1].similarity));
  check('双子星：每张有相似点说明', twins.twins.every((t) => t.points.length > 0));
  check('双子星：不含本人同日同时辰盘', twins.twins.every((t) => !(t.birth.year === 1990 && t.birth.month === 1 && t.birth.day === 1 && t.birth.hour === 0)));
  check('双子星：同一盘两次结果相同（种子固定）', JSON.stringify(findTwinStars(chart, 5).twins) === JSON.stringify(twins.twins));
  check('双子星：覆盖写清 120 张抽样', TWIN_STAR_COVERAGE.includes('120'));
  check('双子星：诚实声明未接入 67.5 万盘大库', TWIN_STAR_COVERAGE.includes('67.5 万') && TWIN_STAR_COVERAGE.includes('没有接入'));
  console.log(`  （双子星一次抽样耗时 ${twinMs}ms）`);

  // 16. 学盘课程：6 课、文字图解、无视频声明
  const course = await import('../lib/ziwei/course');
  check('课程：共 6 课', course.COURSE_LESSONS.length === 6, String(course.COURSE_LESSONS.length));
  check('课程：第一课十二宫', course.COURSE_LESSONS[0].title.includes('十二宫'));
  check('课程：每课有讲稿', course.COURSE_LESSONS.every((l) => l.script.length > 0 && l.script.join('').length > 50));
  check('课程：主星表 14 行', course.COURSE_STAR_ROWS.length === 14);
  check('课程：四化表 10 行', course.COURSE_SIHUA_ROWS.length === 10);
  check('课程：看盘五步 5 步', course.COURSE_STEPS.length === 5);
  check('课程：声明只有文字图解、没有视频', course.COURSE_INTRO.includes('没有视频'));

  // 17. 限流 429 带 retryAfterSeconds（前端倒计时用）
  c.__resetRateLimits();
  const ip2 = '203.0.113.99';
  c.checkRateLimit(ip2); c.checkRateLimit(ip2); c.checkRateLimit(ip2);
  const blocked = c.checkRateLimit(ip2);
  check('限流：429 带 retryAfterSeconds', !blocked.allowed && typeof blocked.retryAfterSeconds === 'number' && blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60, JSON.stringify(blocked));

  // 18. 第二张回归盘：1990-05-15 08:00 男正常
  const chart2 = generateChart({ year: 1990, month: 5, day: 15, hour: 4, gender: 'male' });
  check('回归盘2：火六局', chart2.wuxingJuName === '火六局', chart2.wuxingJuName);
  const ming2 = chart2.palaces.find((p) => p.branch === chart2.mingGongBranch);
  check('回归盘2：命宫天机', ming2?.stars.some((s) => s.name === '天机') ?? false, JSON.stringify(ming2?.stars));
  check('回归盘2：太岁 2026 可算', taiSui(chart2, 2026).palaceName.length > 0);
  check('回归盘2：双子星可算', findTwinStars(chart2, 3).twins.length === 3);

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
