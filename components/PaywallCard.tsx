'use client';
import { useState } from 'react';

type PayScope = 'full' | 'career' | 'love';

/**
 * 付费墙卡片：AI 深度解盘首次免费试读用完后展示。
 * 点“付费解锁”调 /api/pay/create；Dodo 审核中，只会返回占位状态，
 * 前端如实显示“支付开通审核中，稍后再试”，不编造支付链接/订单号。
 */
export default function PaywallCard({ scope, price, label }: { scope: PayScope; price: number; label: string }) {
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      setPayMsg(json?.message === '支付开通审核中' ? '支付开通审核中，稍后再试' : (json?.message ?? '支付开通审核中，稍后再试'));
    } catch {
      setPayMsg('支付开通审核中，稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl px-4 py-3 text-[11px] leading-relaxed"
      style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', color: 'var(--t-text)' }}
    >
      <div className="font-medium mb-1" style={{ color: 'var(--t-gold)' }}>解锁 AI 深度解盘全文</div>
      <div style={{ color: 'var(--t-text2)' }}>
        首次免费试读已用完。本次：{label} ¥{price}；全份报告 ¥19.9，单维（事业/感情）¥9.9。排盘与规则版解读一直免费。
      </div>
      <button
        onClick={handlePay}
        disabled={busy}
        className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
        style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-gold)' }}
      >
        {busy ? '…' : `付费解锁（¥${price}）`}
      </button>
      {payMsg && (
        <div className="mt-2" style={{ color: 'var(--t-faint)' }}>{payMsg}。规则版解读仍可免费使用。</div>
      )}
      <div className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>
        免责声明：以上解读仅供参考，不构成医疗、投资、法律建议。
      </div>
    </div>
  );
}
