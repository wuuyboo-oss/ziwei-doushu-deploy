'use client';
import { useState } from 'react';

/**
 * 核对清单页 /pay/review（手动收款码版）
 *
 * 只给核对人用：先输 MANUAL_PAY_ADMIN_KEY（Render 环境变量里设的随机字符串，
 * 不要写进代码和仓库），再查看待核对清单。按微信/支付宝账单上的
 * 金额 + 交易单号后 6 位 + 时间三项对照，通过后该用户（同一设备指纹）
 * 对应档位解锁 AI 全文；驳回不解锁。
 *
 * 注意：Render 免费档容器重建会丢掉 .data 里的申请记录，每天至少核对一次。
 * 详见 MANUAL-PAYMENT-README.md。
 */
interface Claim {
  id: string;
  createdAt: string;
  scope: string;
  price: number;
  channel: string;
  txnLast6: string;
  screenshotFile: string;
  status: string;
  reviewedAt?: string;
  reviewNote?: string;
}

const SCOPE_LABEL: Record<string, string> = {
  full: '全份报告',
  career: '单维 · 事业',
  love: '单维 · 感情',
};

export default function PayReviewPage() {
  const [adminKey, setAdminKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async (key: string) => {
    setError(null);
    const res = await fetch('/api/pay/manual-claims', { headers: { 'x-admin-key': key } });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? '加载失败');
      return;
    }
    setClaims(json.claims ?? []);
    setAuthed(true);
  };

  const review = async (claim: Claim, action: 'approved' | 'rejected') => {
    if (busyId) return;
    if (action === 'approved' && !confirm(`确认已在微信/支付宝账单上查到这笔钱？\n档位：${SCOPE_LABEL[claim.scope] ?? claim.scope} ¥${claim.price}\n交易单号后 6 位：${claim.txnLast6}`)) return;
    setBusyId(claim.id);
    const res = await fetch('/api/pay/manual-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ claimId: claim.id, action, note }),
    });
    const json = await res.json().catch(() => null);
    setBusyId(null);
    if (!res.ok) {
      setError(json?.error ?? '操作失败');
      return;
    }
    setClaims((prev) => prev.map((c) => (c.id === claim.id ? json.claim : c)));
  };

  if (!authed) {
    return (
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
        <h1>付款核对清单</h1>
        <p>只给核对人用。请先输入核对密钥（Render 环境变量 MANUAL_PAY_ADMIN_KEY）。</p>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="核对密钥"
          style={{ width: '100%', padding: 10, marginBottom: 12, fontSize: 16 }}
        />
        <button
          onClick={() => load(adminKey)}
          style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer' }}
        >
          查看待核对清单
        </button>
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}
        <p style={{ color: '#888', fontSize: 13 }}>
          没有密钥？先在 Render Dashboard → Environment 里设置 MANUAL_PAY_ADMIN_KEY，见 MANUAL-PAYMENT-README.md。
        </p>
      </main>
    );
  }

  const pending = claims.filter((c) => c.status === 'pending');
  const done = claims.filter((c) => c.status !== 'pending');
  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1>付款核对清单</h1>
      <p>待核对 {pending.length} 条。核对方法：打开微信 / 支付宝收款账单，按<strong>金额 + 交易单号后 6 位 + 时间</strong>三项对照，三项都对得上再点“通过”。</p>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      <label style={{ display: 'block', marginBottom: 16 }}>
        备注（通过/驳回时一起保存，可选）：
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：微信账单 15:32 收到 ¥19.9"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <h2>待核对</h2>
      {pending.length === 0 && <p>暂无待核对申请。</p>}
      {pending.map((c) => (
        <div key={c.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div><strong>{SCOPE_LABEL[c.scope] ?? c.scope} ¥{c.price}</strong> · {c.channel === 'wechat' ? '微信' : '支付宝'} · 交易单号后 6 位：<strong>{c.txnLast6}</strong></div>
          <div style={{ color: '#666', fontSize: 13 }}>提交时间：{new Date(c.createdAt).toLocaleString('zh-CN')} · 申请编号：{c.id}</div>
          <div style={{ color: '#666', fontSize: 13 }}>付款截图：{c.screenshotFile ? `已上传（服务器文件 ${c.screenshotFile}）` : '未附截图'}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => review(c, 'approved')} disabled={!!busyId} style={{ padding: '8px 16px', marginRight: 8, cursor: 'pointer' }}>
              {busyId === c.id ? '…' : '通过并解锁'}
            </button>
            <button onClick={() => review(c, 'rejected')} disabled={!!busyId} style={{ padding: '8px 16px', cursor: 'pointer' }}>
              驳回
            </button>
          </div>
        </div>
      ))}
      <h2>已核对</h2>
      {done.length === 0 && <p>暂无。</p>}
      {done.map((c) => (
        <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, marginBottom: 8, color: '#666', fontSize: 13 }}>
          {c.status === 'approved' ? '已通过' : '已驳回'} · {SCOPE_LABEL[c.scope] ?? c.scope} ¥{c.price} · {c.channel === 'wechat' ? '微信' : '支付宝'} · 后 6 位 {c.txnLast6} · {c.id}
          {c.reviewNote ? ` · 备注：${c.reviewNote}` : ''}
        </div>
      ))}
    </main>
  );
}
