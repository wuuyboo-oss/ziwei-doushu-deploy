/**
 * POST /api/pay/create —— 创建支付订单（Dodo Payments 占位）
 *
 * 现状：Dodo 审核中，未开通。不要编造已开通、支付链接或订单号。
 * 本接口只返回占位状态，前端据此显示“支付开通审核中，稍后再试”。
 *
 * Dodo 开通后由人工替换为真实实现：创建 Dodo 订单 → 返回 checkout 链接；
 * 再加 /api/pay/webhook 校验签名后写 paidUnlocks。
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
    // 请求体解析失败也返回占位，不阻塞前端提示
  }
  const price = PRICING[scope];
  return Response.json(
    {
      status: 'pending_dodo',
      message: '支付开通审核中',
      scope,
      price: price.price,
      currency: price.currency,
      label: price.label,
      note: '支付开通审核中，稍后再试。规则版解读仍可免费使用。',
    },
    { status: 202 },
  );
}
