'use client';
import { useEffect, useState } from 'react';

type PayScope = 'full' | 'career' | 'love';

/**
 * 付费墙卡片：AI 深度解盘首次免费试读用完后展示（手动收款码版）。
 *
 * - 两档：全份报告 ¥19.9 / 单维（事业/感情）¥9.9，点哪个就显示对应金额的
 *   微信收款码和支付宝收款码（并排），扫码金额须与所选档位一致。
 *   图注、图内金额、档位按钮、说明文字、“我已付款”按钮五处都读同一个
 *   tier：切档位时码图一定跟着换（2026-11-19 修过一次 bug：QrImage 的
 *   useState 只在挂载时取图源，切档位后图还停在旧档位，出现“选单维 ¥9.9
 *   码图却写 ¥19.9 全份报告”；修法是 kind 一变就重置图源 + 按档位 key
 *   重挂载）。
 * - 收款码图片在 public/pay-qr/：真码是同名 .png，没有真码时回退到 .svg
 *   占位图（占位图里写着“占位图 · 请勿扫码付款”，没有可扫的二维码）。
 *   换码方法见 public/pay-qr/README.md：替换同名图片即可，不改代码。
 * - 点“我已付款”提交交易单号后 6 位（可附付款截图），只记一条待核对申请，
 *   人工核对后 1 小时内解锁，不是即时自动到账，请勿重复付款。
 * - 免费试读一次的逻辑不变（服务端计次），本卡片不碰免费次数。
 */

/** 设备指纹 ID：与 ChatPanel / InsightPanel 同一个 localStorage 键，核对通过后给同一指纹解锁。 */
function getDeviceId(): string {
  try {
    let id = localStorage.getItem('ziwei-device-id');
    if (!id) {
      id = (crypto as unknown as { randomUUID?: () => string }).randomUUID
        ? (crypto as unknown as { randomUUID: () => string }).randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('ziwei-device-id', id);
    }
    return id;
  } catch {
    return '';
  }
}

const TIERS: { scope: PayScope; label: string; price: number; kind: 'full' | 'single' }[] = [
  { scope: 'full', label: '全份报告', price: 19.9, kind: 'full' },
  { scope: 'career', label: '单维 · 事业', price: 9.9, kind: 'single' },
  { scope: 'love', label: '单维 · 感情', price: 9.9, kind: 'single' },
];

/** 收款码图：优先用真码 .png，没有真码时回退到 .svg 占位图。
 * 图源必须跟着档位走：useState 只在挂载时取初值，档位切换时 kind 变了
 * 图源不会自己变（这就是线上“选了单维 ¥9.9，码图还写 ¥19.9 全份报告”
 * 的根因），所以 kind/channel 一变就把 src 重置回对应档位的图。 */
function QrImage({ channel, kind, label }: { channel: 'wechat' | 'alipay'; kind: 'full' | 'single'; label: string }) {
  const png = `/pay-qr/${channel}-${kind}.png`;
  const svg = `/pay-qr/${channel}-${kind}.svg`;
  const [src, setSrc] = useState(png);
  useEffect(() => {
    setSrc(png);
  }, [png]);
  return (
    <div className="flex-1 min-w-0">
      <div className="text-center text-[12px] font-medium mb-1" style={{ color: 'var(--t-text)' }}>{label}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${label}收款码`}
        className="w-full rounded-lg"
        style={{ border: '1px solid var(--t-border, rgba(0,0,0,0.1))', background: '#fff' }}
        onError={() => {
          if (src !== svg) setSrc(svg);
        }}
      />
    </div>
  );
}

export default function PaywallCard({ scope, price, label }: { scope: PayScope; price: number; label: string }) {
  const initial = TIERS.find((t) => t.scope === scope) ?? TIERS[0];
  const [tier, setTier] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState<'wechat' | 'alipay'>('wechat');
  const [txnLast6, setTxnLast6] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);

  // props 变化（换了维度）时跟随一次；用户自己选过档位后以用户选择为准
  useEffect(() => {
    const next = TIERS.find((t) => t.scope === scope);
    if (next) setTier(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const submitClaim = async () => {
    if (submitting) return;
    if (!/^\d{6}$/.test(txnLast6)) {
      setFormError('请填写交易单号后 6 位数字（付款成功页 / 账单详情里能看到）。');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('scope', tier.scope);
      fd.append('channel', channel);
      fd.append('txnLast6', txnLast6);
      fd.append('deviceId', getDeviceId());
      if (shot) fd.append('screenshot', shot);
      const res = await fetch('/api/pay/manual-claim', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? '提交失败，请稍后再试。');
        return;
      }
      setClaimId(json?.claimId ?? '');
    } catch {
      setFormError('提交失败，请检查网络后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-xl px-4 py-3 text-[11px] leading-relaxed"
      style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', color: 'var(--t-text)' }}
    >
      <div className="font-medium mb-1" style={{ color: 'var(--t-gold)' }}>解锁 AI 深度解盘全文</div>
      <div style={{ color: 'var(--t-text2)' }}>
        首次免费试读已用完。本次：{tier.label} ¥{tier.price}；全份报告 ¥19.9，单维（事业/感情）¥9.9。排盘与规则版解读一直免费。
      </div>

      {claimId ? (
        <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'rgba(7,193,96,0.08)', border: '1px solid rgba(7,193,96,0.3)' }}>
          <div className="font-medium">已收到，人工核对后 1 小时内解锁，请留意通知。</div>
          <div style={{ color: 'var(--t-text2)' }}>
            申请编号：{claimId}（请勿重复付款；核对通过后用同一设备打开本页即可看到全文）。
          </div>
        </div>
      ) : (
        <>
          {/* 两档切换 */}
          <div className="mt-3 flex gap-2">
            {TIERS.map((t) => (
              <button
                key={t.scope}
                onClick={() => setTier(t)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: tier.scope === t.scope ? 'rgba(212,168,67,0.2)' : 'transparent',
                  border: `1px solid ${tier.scope === t.scope ? 'rgba(212,168,67,0.5)' : 'rgba(212,168,67,0.25)'}`,
                  color: 'var(--t-gold)',
                }}
              >
                {t.label} ¥{t.price}
              </button>
            ))}
          </div>

          {/* 两个收款码并排：key 跟着档位走，档位一换两张码图整体重挂载，
              图注、图内金额、档位三处永远是同一档（全份 ¥19.9 / 单维 ¥9.9）。 */}
          <div className="mt-3 flex gap-3">
            <QrImage key={`wechat-${tier.kind}`} channel="wechat" kind={tier.kind} label={`微信 · ${tier.label} ¥${tier.price}`} />
            <QrImage key={`alipay-${tier.kind}`} channel="alipay" kind={tier.kind} label={`支付宝 · ${tier.label} ¥${tier.price}`} />
          </div>
          <div className="mt-2" style={{ color: 'var(--t-text2)' }}>
            扫码付款，金额要和上面一致（{tier.label} ¥{tier.price}）。手动核对，不是即时自动到账；人工核对后 1 小时内解锁，请勿重复付款。
          </div>

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-medium"
              style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-gold)' }}
            >
              我已付款（¥{tier.price}）
            </button>
          ) : (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ border: '1px solid rgba(212,168,67,0.25)' }}>
              <div className="font-medium mb-2">提交付款申请</div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setChannel('wechat')}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px]"
                  style={{
                    background: channel === 'wechat' ? 'rgba(7,193,96,0.15)' : 'transparent',
                    border: `1px solid ${channel === 'wechat' ? '#07C160' : 'rgba(212,168,67,0.25)'}`,
                    color: 'var(--t-text)',
                  }}
                >
                  微信付款
                </button>
                <button
                  onClick={() => setChannel('alipay')}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px]"
                  style={{
                    background: channel === 'alipay' ? 'rgba(22,119,255,0.12)' : 'transparent',
                    border: `1px solid ${channel === 'alipay' ? '#1677FF' : 'rgba(212,168,67,0.25)'}`,
                    color: 'var(--t-text)',
                  }}
                >
                  支付宝付款
                </button>
              </div>
              <label className="block mb-1" style={{ color: 'var(--t-text2)' }}>
                交易单号后 6 位数字（付款成功页 / 账单详情里查看）
              </label>
              <input
                value={txnLast6}
                onChange={(e) => setTxnLast6(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="例如 123456"
                className="w-full px-2 py-1.5 rounded-lg text-[12px] mb-2"
                style={{ border: '1px solid rgba(212,168,67,0.25)', background: 'transparent', color: 'var(--t-text)' }}
              />
              <label className="block mb-1" style={{ color: 'var(--t-text2)' }}>
                付款截图（可选，有截图核对更快）
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setShot(e.target.files?.[0] ?? null)}
                className="w-full text-[11px] mb-2"
              />
              {shot && <div className="mb-2" style={{ color: 'var(--t-text2)' }}>已选：{shot.name}</div>}
              {formError && <div className="mb-2" style={{ color: '#c0392b' }}>{formError}</div>}
              <div className="flex gap-2">
                <button
                  onClick={submitClaim}
                  disabled={submitting}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
                  style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-gold)' }}
                >
                  {submitting ? '提交中…' : '提交付款申请'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded-lg text-[11px]"
                  style={{ border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-text2)' }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>
        免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。
      </div>
    </div>
  );
}
