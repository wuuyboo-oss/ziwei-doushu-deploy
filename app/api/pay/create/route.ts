/**
 * POST /api/pay/create —— 付费解锁入口（手动收款码版）
 *
 * 自动收款尚未接通：不返回任何支付链接或订单号，只告诉前端
 * 走手动收款码流程（扫码付款 → 点“我已付款”提交交易单号后 6 位 →
 * 人工核对后解锁）。不要编造已开通、已收款。
 */
import { NextRequest } from 'next/server';
import { normalizeScope, PRICING } from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let scope = 'full' as ReturnType<typeof normalizeScope>;
  try {
    const body = await req.json();
    scope = normalizeScope(body?.scope);
  } catch {
    // 请求体解析失败也返回手动收款口径，不阻塞前端提示
  }
  const price = PRICING[scope];
  return Response.json(
    {
      status: 'manual_qr',
      message: '手动收款码付款，人工核对后解锁',
      scope,
      price: price.price,
      currency: price.currency,
      label: price.label,
      note: '请扫收款码付款后点“我已付款”提交交易单号后 6 位，人工核对后 1 小时内解锁，不是即时自动到账，请勿重复付款。规则版解读仍可免费使用。',
    },
    { status: 202 },
  );
}
