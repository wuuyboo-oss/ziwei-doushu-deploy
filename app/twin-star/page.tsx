'use client';
import { useState } from 'react';
import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import { generateChart } from '@/lib/ziwei/algorithm';
import { BRANCHES, SHICHEN } from '@/lib/ziwei/constants';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import type { TwinStarResult } from '@/lib/ziwei/twin-star';

/**
 * 命运双子星（服务器版）
 *
 * 在服务器端用本站排盘引擎抽样生成一批命盘做相似度匹配，只在
 * 这一批抽样盘里找最像的几张。不是全库搜索：原站 67.5 万盘大库
 * 我们没有接入，也不宣称已接入；覆盖范围在结果里如实写清。
 */
export default function TwinStarPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [result, setResult] = useState<TwinStarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (info: BirthInfo) => {
    setError(null);
    setResult(null);
    let c: ZiweiChart;
    try {
      c = generateChart(info);
    } catch {
      setError('起盘失败，请检查出生信息是否正确。');
      return;
    }
    setChart(c);
    setLoading(true);
    try {
      const res = await fetch('/api/twin-star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: c }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? '查找失败，请稍后重试。');
        return;
      }
      setResult(j as TwinStarResult);
    } catch {
      setError('查找失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const mingStars = chart
    ? chart.palaces
        .find((p) => p.branch === chart.mingGongBranch)
        ?.stars.filter((s) => s.type === 'major')
        .map((s) => s.name)
        .join('、') || '空宫'
    : '';

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px 80px' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--t-faint)' }}>← 返回首页</Link>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>命运双子星</h1>
      <p style={{ color: 'var(--t-text2)', marginBottom: 8, fontSize: 14, lineHeight: 1.7 }}>
        输入出生年月日时，在服务器端抽样生成的一批命盘里，找和你最像的几张盘：命宫主星、三方四正、格局、四化越像，相似度越高。
      </p>
      <p style={{ fontSize: 13, color: 'var(--t-faint)', marginBottom: 32, lineHeight: 1.7 }}>
        诚实说明：这不是全库搜索。原站 67.5 万张命盘的大库我们没有接入，也不宣称已接入；下面每次查找都会写清本次抽样的规模与范围。
      </p>

      <BirthForm onSubmit={run} />

      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 24, fontSize: 13, color: 'var(--t-faint)' }}>正在抽样比对命盘…</div>
      )}

      {result && chart && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--t-text2)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--t-border)', background: 'var(--t-card)', marginBottom: 16 }}>
            你的命盘：命宫 {mingStars}（{chart.wuxingJuName}）。{result.coverage}
          </div>
          {result.twins.map((t, i) => (
            <div key={i} style={{ border: '1px solid var(--t-border)', borderRadius: 12, padding: '16px 20px', background: 'var(--t-card)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  双子星 {i + 1} · {t.birth.year}-{String(t.birth.month).padStart(2, '0')}-{String(t.birth.day).padStart(2, '0')} {SHICHEN[t.birth.hour]?.name ?? ''}（{t.birth.gender === 'male' ? '男' : '女'}）
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-gold)' }}>相似 {t.similarity}%</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t-text2)', marginTop: 6 }}>
                该盘命宫：{t.mingStars.join('、') || '空宫'}
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--t-text2)' }}>
                {t.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--t-faint)', lineHeight: 1.7 }}>
            相似度只看命宫主星、三方四正、格局与生年四化四项，不代表命运相同；仅供参考。
          </p>
        </div>
      )}
    </main>
  );
}
