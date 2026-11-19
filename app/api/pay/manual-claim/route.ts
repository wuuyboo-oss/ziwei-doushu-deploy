/**
 * POST /api/pay/manual-claim —— “我已付款”申请（手动收款码版）
 *
 * multipart/form-data：scope（full/career/love）、channel（wechat/alipay）、
 * txnLast6（交易单号后 6 位数字）、deviceId（与排盘同一浏览器的设备 ID，
 * 用于核对通过后给同一指纹解锁）、screenshot（可选，付款截图，≤5MB 的图片）。
 *
 * 只记一条待核对申请（status pending），不代表已收款、不自动解锁。
 * 人工核对在 /pay/review 页（需 MANUAL_PAY_ADMIN_KEY）或按
 * MANUAL-PAYMENT-README.md 改服务器文件后标记。
 */
import { NextRequest } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRICING,
  clientIp,
  fingerprint,
  isValidTxnLast6,
  normalizeChannel,
  normalizeScope,
  saveManualPaymentClaim,
} from '@/lib/ziwei/commercial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: '请求体不是合法的表单数据' }, { status: 400 });
  }
  const scope = normalizeScope(form.get('scope'));
  const channel = normalizeChannel(form.get('channel'));
  const txnLast6 = form.get('txnLast6');
  const deviceId = typeof form.get('deviceId') === 'string' ? (form.get('deviceId') as string) : '';
  if (!channel) return Response.json({ error: '请选择付款渠道（微信或支付宝）' }, { status: 400 });
  if (!isValidTxnLast6(txnLast6)) {
    return Response.json({ error: '请填写交易单号后 6 位数字' }, { status: 400 });
  }
  const ip = clientIp(req.headers.get('x-forwarded-for'), null);
  const fp = fingerprint(ip, deviceId, req.headers.get('user-agent') ?? '');

  // 可选付款截图：只收图片，≤5MB，存在服务器本地，不进仓库
  let screenshotFile = '';
  const shot = form.get('screenshot');
  if (shot && typeof shot !== 'object') {
    return Response.json({ error: '付款截图格式不正确' }, { status: 400 });
  }
  if (shot && shot instanceof File && shot.size > 0) {
    if (!shot.type.startsWith('image/')) {
      return Response.json({ error: '付款截图须为图片文件' }, { status: 400 });
    }
    if (shot.size > MAX_SCREENSHOT_BYTES) {
      return Response.json({ error: '付款截图不能超过 5MB' }, { status: 400 });
    }
    const ext = shot.type === 'image/png' ? 'png' : shot.type === 'image/gif' ? 'gif' : shot.type === 'image/webp' ? 'webp' : 'jpg';
    const dir = join(process.env.COMMERCIAL_DATA_DIR || join(process.cwd(), '.data', 'commercial'), 'manual-payments');
    try {
      mkdirSync(dir, { recursive: true });
      const tmpName = `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const buf = Buffer.from(await shot.arrayBuffer());
      writeFileSync(join(dir, tmpName), buf);
      screenshotFile = tmpName;
    } catch {
      return Response.json({ error: '付款截图保存失败，请重试或不附截图提交' }, { status: 500 });
    }
  }

  const claim = saveManualPaymentClaim({
    fpHash: fp,
    deviceId,
    scope,
    price: PRICING[scope].price,
    channel,
    txnLast6: txnLast6 as string,
    screenshotFile,
  });
  return Response.json(
    {
      status: 'received',
      claimId: claim.id,
      scope,
      price: PRICING[scope].price,
      message: '已收到，人工核对后 1 小时内解锁，请勿重复付款。',
    },
    { status: 201 },
  );
}
