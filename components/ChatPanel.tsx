'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';
import PaywallCard from './PaywallCard';
import { useRateLimitNotice } from './useRateLimitNotice';

/** 设备指纹 ID：浏览器 localStorage 里存一个随机值，随 AI 请求发给服务端计免费次数。 */
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

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  chart: ZiweiChart;
}

const PRESET_QUESTIONS = [
  '我的整体命格如何？性格特点是什么？',
  '我的感情婚姻运势如何？',
  '我的事业财运如何？适合什么方向？',
  '我现在的大限运势如何？',
  '我的健康需要注意什么？',
  '今年的流年运势如何？',
];

export default function ChatPanel({ chart }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState<{ scope: 'full' | 'career' | 'love'; price: number; label: string } | null>(null);
  // 限流只提示一次：429 不再往对话里追加多条报错，按钮禁用并显示倒计时
  const rateLimit = useRateLimitNotice();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    // 限流期间禁止再发 AI 请求（从源头上不再产生新的 429）
    if (rateLimit.limited) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: [...messages, userMsg], scope: 'full', deviceId: getDeviceId() }),
      });

      if (res.status === 404) throw new Error('api-missing');
      if (res.status === 402) {
        const j = await res.json().catch(() => null);
        const scope = (j?.scope === 'career' || j?.scope === 'love') ? j.scope : 'full';
        const price = typeof j?.price === 'number' ? j.price : scope === 'full' ? 19.9 : 9.9;
        const label = typeof j?.label === 'string' ? j.label : scope === 'full' ? '全份报告' : scope === 'career' ? '单维·事业' : '单维·感情';
        setPaywall({ scope, price, label });
        setMessages(prev => [...prev, { role: 'assistant', content: j?.message ?? 'AI 深度解盘需付费解锁：请扫收款码付款后点“我已付款”提交，人工核对后 1 小时内解锁。规则版解读仍可免费使用。' }]);
        return;
      }
      if (res.status === 429) {
        const j = await res.json().catch(() => null);
        // 只提示一次：同一限流窗口内不再追加、不刷屏；按钮禁用 + 倒计时
        rateLimit.note429(j);
        return;
      }
      if (!res.ok) throw new Error('请求失败');
      if (!res.body) throw new Error('无响应流');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.delta?.text ?? '';
              assistantText += delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                return updated;
              });
            } catch { /* skip */ }
          }
        }
      }
    } catch (e) {
      const missing = e instanceof Error && e.message === 'api-missing';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: missing ? '开源版不含 AI 解读接口（/api/interpret），需要你自己实现后才能用，详见 README「快速开始」。排盘本身不需要任何 API Key。' : '解读失败，请检查API配置或稍后重试。',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden card-glass">
      {/* 标题 */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <h3 className="text-xs font-medium tracking-widest" style={{ color: 'var(--t-gold)' }}>AI 命盘解读</h3>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>三合派紫微斗数 · 智慧解析</p>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {/* 限流单次提示：同一窗口只出现一次，带倒计时，期间按钮禁用 */}
        {rateLimit.notice && (
          <div className="rounded-lg px-3 py-2 text-xs leading-relaxed"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>
            {rateLimit.notice}（请 {rateLimit.secondsLeft} 秒后再试）
          </div>
        )}
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.15 }}>✦</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--t-faint)' }}>
              命盘已生成，可直接提问<br />
              或从下方选择常见问题开始解读
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={msg.role === 'user' ? {
                  background: 'rgba(212,168,67,0.1)',
                  border: '1px solid rgba(212,168,67,0.2)',
                  color: 'var(--t-gold)',
                } : {
                  background: 'var(--t-card)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>命理师 ·</div>
                )}
                <div className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse" style={{ background: 'var(--t-gold)', opacity: 0.6 }} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {paywall && (
          <div className="px-4 pb-2">
            <PaywallCard scope={paywall.scope} price={paywall.price} label={paywall.label} />
          </div>
        )}
      </div>

      {/* 预设问题 */}
      {messages.length === 0 && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                disabled={loading || rateLimit.limited}
                className="text-left text-[10px] rounded-lg px-2.5 py-2 transition-all line-clamp-2"
                style={{
                  color: 'var(--t-text2)',
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)';
                  e.currentTarget.style.color = 'var(--t-gold)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--t-border)';
                  e.currentTarget.style.color = 'var(--t-text2)';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="输入问题，如：我的感情运势如何？"
            disabled={loading || rateLimit.limited}
            className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || rateLimit.limited || !input.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            解读
          </button>
        </div>
      </div>
    </div>
  );
}
