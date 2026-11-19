'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import { formToBirthInfo } from '@/lib/ziwei/share';
import { generateChart as buildChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { useTheme } from '@/components/ThemeProvider';
import PaywallCard from '@/components/PaywallCard';
import { useRateLimitNotice } from '@/components/useRateLimitNotice';
import { baziMatch, synastryRule, type BaziResult, type SynastryResult } from '@/lib/ziwei/heming';

/** 设备指纹 ID：与 InsightPanel 同一套，随 AI 请求发给服务端计免费次数。 */
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

// ─── AiContent 渲染器（与 InsightPanel 一致）────────────────
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : '14px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ac)', letterSpacing: '0.04em' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--tx-2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} style={{ fontWeight: 500, color: 'var(--tx-0)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span style={{
          display: 'inline-block', width: '7px', height: '13px',
          background: 'var(--ac)', opacity: 0.5, borderRadius: '2px',
          animation: 'pulse 1s ease-in-out infinite',
          verticalAlign: 'middle', marginLeft: '2px',
        }} />
      )}
    </div>
  );
}

export default function HemingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ─── 双方命盘状态 ─────────────────────────────────────────
  const [chartA, setChartA] = useState<ZiweiChart | null>(null);
  const [chartB, setChartB] = useState<ZiweiChart | null>(null);
  // 双方表单状态由 BirthForm onFormSave 同步到此处，统一按钮触发起盘
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);

  // ─── AI 合盘分析状态 ─────────────────────────────────────
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [analysisError, setAnalysisError] = useState(false);
  // 规则版逐宫对照 + 合八字：起盘后立刻在本地算出，免费，不调 AI
  const [ruleSyn, setRuleSyn] = useState<SynastryResult | null>(null);
  const [bazi, setBazi] = useState<BaziResult | null>(null);
  const [paywall, setPaywall] = useState<{ scope: 'full' | 'career' | 'love'; price: number; label: string } | null>(null);
  // 限流只提示一次：429 不刷屏，按钮禁用并显示倒计时
  const rateLimit = useRateLimitNotice();
  // 开源版不含 /api/heming：接口 404 时单独说明，而不是让用户反复重试
  const [apiMissing, setApiMissing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  // ─── 起盘（单次调用，返回 chart 给统一流程使用）──────────
  // 开源版不含后端 /api/generate：直接用本仓库的排盘引擎在浏览器里起盘
  const generateChart = useCallback(async (info: BirthInfo): Promise<ZiweiChart | null> => {
    try {
      return buildChart(info);
    } catch {
      return null;
    }
  }, []);

  // 表单是否填齐
  const isFormReady = (f: BirthFormState | null): boolean =>
    !!(f && f.year && f.month && f.day && f.gender && (f.unknownTime || (f.clockHour !== '' && f.clockMinute !== '')));

  // ─── 统一入口：起盘 + 规则版对照 + AI 逐宫分析 ─────────────
  const runAnalysis = useCallback(async (q?: string) => {
    setFormError(null);
    if (!isFormReady(formA) || !isFormReady(formB)) {
      setFormError('请先填写双方完整出生信息');
      return;
    }
    // 限流期间禁止再发 AI 请求（从源头上不再产生新的 429）
    if (rateLimit.limited) return;
    setAnalyzing(true);
    setAnalysis('');
    setAnalysisError(false);
    setPaywall(null);

    try {
      // 每次按当前表单起盘，避免编辑出生信息后复用旧盘。
      const [cA, cB] = await Promise.all([
        generateChart(formToBirthInfo(formA!)),
        generateChart(formToBirthInfo(formB!)),
      ]);
      if (!cA || !cB) {
        setAnalysisError(true);
        setAnalyzing(false);
        return;
      }
      setChartA(cA);
      setChartB(cB);
      // 规则版逐宫对照 + 合八字：本地即时算出，免费，不调 AI。
      setRuleSyn(synastryRule(cA, cB));
      setBazi(baziMatch(cA, cB));

      const res = await fetch('/api/heming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartA: cA, chartB: cB, question: q ?? undefined, deviceId: getDeviceId() }),
      });
      if (res.status === 404) { setApiMissing(true); throw new Error('api-missing'); }
      if (res.status === 402) {
        const j = await res.json().catch(() => null);
        const scope = (j?.scope === 'career' || j?.scope === 'love') ? j.scope : 'full';
        const price = typeof j?.price === 'number' ? j.price : 19.9;
        const label = typeof j?.label === 'string' ? j.label : '全份报告';
        setPaywall({ scope, price, label });
        return;
      }
      if (res.status === 429) {
        const j = await res.json().catch(() => null);
        // 只提示一次：同一限流窗口内不再追加、不刷屏
        rateLimit.note429(j);
        return;
      }
      if (!res.ok || !res.body) throw new Error();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let pendingLine = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pendingLine += decoder.decode(value, { stream: true });
        const lines = pendingLine.split('\n');
        pendingLine = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).delta?.text ?? '';
            text += delta;
            setAnalysis(text);
          } catch { /* skip */ }
        }
      }
      // scroll to analysis
      setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch {
      setAnalysisError(true);
    } finally {
      setAnalyzing(false);
    }
  }, [formA, formB, generateChart, rateLimit]);

  const cardStyle = {
    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(200,160,60,0.2)'}`,
    borderRadius: '16px',
    padding: '24px',
  };

  const labelStyle = {
    fontSize: '10px', letterSpacing: '0.4em', color: 'var(--ac)', opacity: 0.7,
    marginBottom: '16px', display: 'block',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)' }}>
      {/* 顶栏 */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: isDark ? 'rgba(2,8,16,0.88)' : 'rgba(250,245,235,0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--bdr)',
        display: 'flex', alignItems: 'center', padding: '0 24px', height: '52px', gap: '16px',
      }}>
        <button
          onClick={() => router.push('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px',
            color: 'var(--tx-3)', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '16px' }}>‹</span>
          <span>返回</span>
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--bdr-med)' }} />
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>合盘分析</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--tx-3)' }}>感情 · 合伙 · 亲子 · 朋友</span>
      </header>

      {/* 主体 */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '28px', color: 'var(--ac)', opacity: 0.15, marginBottom: '12px' }}>☯</div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '0.15em', color: 'var(--tx-0)', marginBottom: '8px' }}>
            紫微合盘
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--tx-3)', lineHeight: 1.6 }}>
            输入两个人的出生信息，先看免费的规则版逐宫对照与合八字，再由 AI 逐宫解读双方命盘的缘分匹配度、感情走向与相处建议
          </p>
        </div>

        {/* 双栏表单 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}
          className="heming-grid">
          {/* 甲方 */}
          <div style={cardStyle}>
            <span style={labelStyle}>甲方 — A</span>
            <BirthForm
              hideSubmit
              onSubmit={() => {}}
              onFormSave={setFormA}
            />
          </div>

          {/* 乙方 */}
          <div style={cardStyle}>
            <span style={labelStyle}>乙方 — B</span>
            <BirthForm
              hideSubmit
              onSubmit={() => {}}
              onFormSave={setFormB}
            />
          </div>
        </div>

        {/* ═══ 大合盘分析框（视觉中心，始终显示）════════════════ */}
        <div ref={analysisRef} style={{
          ...cardStyle,
          minHeight: '320px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: (!analysis && !analyzing) ? 'center' : 'flex-start',
        }}>
          {/* 区块标题 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: (analysis || analyzing) ? '20px' : '24px' }}>
            <span style={{ color: 'var(--ac)', opacity: 0.6 }}>◉</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.3em', color: 'var(--tx-3)' }}>合盘分析 · HEMING</span>
          </div>

          {/* 状态分支 */}
          {!analysis && !analyzing && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '13px', color: 'var(--tx-3)', marginBottom: '24px', lineHeight: 1.7 }}>
                填好双方出生信息后，点击下方按钮<br />
                先出免费的规则版逐宫对照与合八字，再由 AI 逐宫解读（首次免费）
              </div>
              <button
                onClick={() => runAnalysis()}
                disabled={rateLimit.limited}
                style={{
                  padding: '14px 40px', borderRadius: 'var(--r-pill)', border: 'none',
                  background: rateLimit.limited ? 'var(--bg-2)' : 'linear-gradient(135deg, #9a6210, #c88020)',
                  color: rateLimit.limited ? 'var(--tx-3)' : '#fff8e8', fontSize: '14px', fontWeight: 600,
                  letterSpacing: '0.15em', cursor: rateLimit.limited ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px rgba(140,100,20,0.25)',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => { if (!rateLimit.limited) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                {rateLimit.limited ? `请 ${rateLimit.secondsLeft} 秒后再试` : '开始合盘分析'}
              </button>
              {formError && (
                <div style={{ marginTop: '20px', fontSize: '13px', color: '#dc2626' }}>
                  {formError}
                </div>
              )}
            </div>
          )}

          {analyzing && !analysis && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0', color: 'var(--tx-3)', fontSize: '13px' }}>
              <div style={{
                width: '14px', height: '14px',
                border: '2px solid var(--bdr-med)', borderTopColor: 'var(--ac)',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              正在对比双方命盘…
            </div>
          )}

          {analysis && <AiContent text={analysis} streaming={analyzing} />}

          {/* 限流单次提示：同一窗口只出现一次，带倒计时 */}
          {rateLimit.notice && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', fontSize: '13px', color: '#f87171', marginTop: '12px' }}>
              {rateLimit.notice}（请 {rateLimit.secondsLeft} 秒后再试）
            </div>
          )}

          {paywall && (
            <div style={{ marginTop: '12px' }}>
              <PaywallCard scope={paywall.scope} price={paywall.price} label={paywall.label} />
            </div>
          )}

          {analysisError && (
            <div style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--bdr)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--tx-2)', marginTop: '12px' }}>
              {apiMissing
                ? '合盘 AI 分析接口（/api/heming）未返回，可能是线上部署还是旧版本；规则版逐宫对照与合八字仍在下方可见，两人的命盘也可以分别到「排盘」页（/chart）查看。'
                : '分析暂时不可用，请重试。规则版逐宫对照与合八字仍在下方可见。'}
            </div>
          )}
        </div>

        {/* ═══ 规则版逐宫对照（免费，起盘后立刻可见）══════════════ */}
        {ruleSyn && (
          <div style={{ ...cardStyle, marginTop: '16px' }}>
            <span style={labelStyle}>规则版逐宫对照 · 免费</span>
            <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--tx-2)', marginBottom: '16px' }}>
              {ruleSyn.verdict}
            </div>
            {ruleSyn.rows.map((row) => (
              <div key={row.palace} style={{ padding: '12px 0', borderTop: '1px solid var(--bdr)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-0)', marginBottom: '4px' }}>
                  【{row.palace} · {row.role}】
                </div>
                <div style={{ fontSize: '13px', color: 'var(--tx-2)', lineHeight: 1.7 }}>
                  甲方：{row.aStars.join('、') || '空宫'}{row.aSihua ? `（${row.aSihua}）` : ''}；
                  乙方：{row.bStars.join('、') || '空宫'}{row.bSihua ? `（${row.bSihua}）` : ''}。
                </div>
                <div style={{ fontSize: '13px', color: 'var(--tx-2)', lineHeight: 1.7 }}>{row.note}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ 合八字 · 四柱干支对照（免费，规则版）════════════════ */}
        {bazi && (
          <div style={{ ...cardStyle, marginTop: '16px' }}>
            <span style={labelStyle}>合八字 · 四柱干支对照</span>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <thead>
                <tr style={{ color: 'var(--tx-3)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>四柱</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>甲方</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>乙方</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>天干关系</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>地支关系</th>
                </tr>
              </thead>
              <tbody>
                {bazi.rows.map((r) => (
                  <tr key={r.label} style={{ color: 'var(--tx-2)' }}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>{r.label}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>{r.a}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>{r.b}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>{r.stemRel}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bdr)' }}>{r.branchRel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bazi.lines.map((line, i) => (
              <div key={i} style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--tx-2)', marginBottom: '6px' }}>{line}</div>
            ))}
            <div style={{ fontSize: '12px', color: 'var(--tx-3)', marginTop: '8px', lineHeight: 1.6 }}>
              合盘与合八字均为规则对比（本命对照），未调用 AI，仅供参考；合八字只看干支合冲，不能单独断婚姻，须再对照两张紫微盘的夫妻宫与生年四化。
            </div>
          </div>
        )}

        {/* ═══ 针对合盘的追问聊天框（仅分析完成后显示）═══════════ */}
        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--tx-3)', marginBottom: '4px' }}>
              针对此次合盘继续追问
            </div>

            {/* 快捷问题 */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                '感情匹配度如何？',
                '适合合伙创业吗？',
                '两人结婚是否合适？',
                '哪方面最容易产生矛盾？',
                '财运是否互补？',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setQuestion(q); runAnalysis(q); }}
                  disabled={analyzing || rateLimit.limited}
                  style={{
                    fontSize: '12px', padding: '6px 14px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid var(--bdr-med)',
                    background: 'transparent', color: 'var(--tx-2)',
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    opacity: analyzing ? 0.5 : 1,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!analyzing) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ac-bdr)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bdr-med)'; }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* 输入框 + 追问按钮 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !analyzing) runAnalysis(question || undefined); }}
                placeholder="继续追问，如：哪几年是两人感情关键期？"
                disabled={analyzing || rateLimit.limited}
                className="input-base"
                style={{ fontSize: '13px', flex: 1 }}
              />
              <button
                onClick={() => runAnalysis(question || undefined)}
                disabled={analyzing || rateLimit.limited}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
                  background: analyzing ? 'var(--bg-2)' : 'var(--tx-0)',
                  color: analyzing ? 'var(--tx-3)' : 'white',
                  fontSize: '13px', fontWeight: 500,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {analyzing ? '分析中…' : '继续追问'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 680px) {
          .heming-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
