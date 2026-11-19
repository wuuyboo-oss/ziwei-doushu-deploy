/**
 * 待核对清单接口（手动收款码版）
 *
 * GET  /api/pay/manual-claims —— 列出付款申请（最新在前）
 * POST /api/pay/manual-claims —— { claimId, action: 'approved'|'rejected', note? }
 *   通过后该指纹 + 档位即解锁 AI 全文；驳回只改状态，不解锁。
 *
 * 鉴权：请求头 x-admin-key 须等于环境变量 MANUAL_PAY_ADMIN_KEY。
 * 该变量未配置时两个接口都返回 503，拒绝一切核对操作——
 * 请在 Render Dashboard → Environment 里设置一个只有核对人才知道的
 * 随机字符串（不要写进代码和仓库），见 MANUAL-PAYMENT-README.md。
 * 列表只含交易单号后 6 位，不含完整单号与截图内容。
 */
import { NextRequest } from 'next/server';
import {
  listManualPaymentClaims,
  reviewManualPaymentClaim,
} from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminKeyOk(req: NextRequest): boolean {
  const key = process.env.MANUAL_PAY_ADMIN_KEY;
  if (!key) return false;
  return req.headers.get('x-admin-key') === key;
}

export async function GET(req: NextRequest) {
  if (!process.env.MANUAL_PAY_ADMIN_KEY) {
    return Response.json(
      { error: '未配置核对密钥（MANUAL_PAY_ADMIN_KEY），请先在 Render 环境变量里设置' },
      { status: 503 },
    );
  }
  if (!adminKeyOk(req)) return Response.json({ error: '核对密钥不正确' }, { status: 403 });
  return Response.json({ status: 'ok', claims: listManualPaymentClaims() });
}

export async function POST(req: NextRequest) {
  if (!process.env.MANUAL_PAY_ADMIN_KEY) {
    return Response.json(
      { error: '未配置核对密钥（MANUAL_PAY_ADMIN_KEY），请先在 Render 环境变量里设置' },
      { status: 503 },
    );
  }
  if (!adminKeyOk(req)) return Response.json({ error: '核对密钥不正确' }, { status: 403 });
  let body: { claimId?: unknown; action?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  if (typeof body.claimId !== 'string' || (body.action !== 'approved' && body.action !== 'rejected')) {
    return Response.json({ error: '参数不正确（claimId + action=approved/rejected）' }, { status: 400 });
  }
  const rec = reviewManualPaymentClaim(
    body.claimId,
    body.action,
    typeof body.note === 'string' ? body.note : '',
  );
  if (!rec) return Response.json({ error: '找不到该申请，或它已核对过' }, { status: 404 });
  return Response.json({ status: 'ok', claim: rec });
}
