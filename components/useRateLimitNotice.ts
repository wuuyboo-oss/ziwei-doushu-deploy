/**
 * AI 限流提示（前端共用）
 *
 * 毛病：服务端每分钟最多 3 次 AI 请求时，前端每收到一次 429 就往
 * 对话里追加一条“每分钟最多 3 次 AI 请求，请稍后再试”，点得快
 * 就会刷出多条。修法：
 *  - 429 只提示一次：同一轮限流窗口内再收到 429 不再追加、不再刷屏；
 *  - 按钮在限流期间禁用，并显示倒计时（秒），倒计时结束自动恢复；
 *  - 限流期间禁止再发 AI 请求（从源头上不再产生新的 429）。
 *
 * 服务端 429 响应体带 retryAfterSeconds（见 lib/ziwei/commercial.ts
 * checkRateLimit），前端优先用它；没有时默认 60 秒。
 */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RateLimitState {
  /** 是否正处在限流窗口内（按钮应禁用） */
  limited: boolean;
  /** 剩余秒数（倒计时显示用） */
  secondsLeft: number;
  /** 唯一的一条提示文案；同一窗口内只出现一次 */
  notice: string | null;
}

export function useRateLimitNotice() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const untilRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  /** 收到一次 429 时调：同一窗口内重复调用不会再刷出新提示。 */
  const note429 = useCallback((body: { error?: string; retryAfterSeconds?: number } | null) => {
    const now = Date.now();
    if (untilRef.current > now) return; // 已在限流窗口内：不重复提示
    const secs = Math.max(
      1,
      Math.min(300, Math.ceil(body?.retryAfterSeconds ?? 60)),
    );
    untilRef.current = now + secs * 1000;
    setSecondsLeft(secs);
    setNotice(body?.error ?? '每分钟最多 3 次 AI 请求，请稍后再试');
    stopTimer();
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((untilRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        stopTimer();
        setNotice(null);
      }
    }, 500);
  }, [stopTimer]);

  const limited = secondsLeft > 0;
  const state: RateLimitState = { limited, secondsLeft, notice: limited ? notice : null };
  return { ...state, note429 };
}
