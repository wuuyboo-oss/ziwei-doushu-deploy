/**
 * 学盘课程（商业版站内课）
 *
 * 文字 + 图解课，共 6 课，每课配自己写的讲稿。
 * 本课程只有文字和图解，没有视频——不编造已有视频，不盗用原站视频，
 * 也不说有视频。讲稿全部由本系统用自己的话撰写。
 */
import Link from 'next/link';
import {
  COURSE_INTRO,
  COURSE_LESSONS,
  COURSE_STEPS,
  COURSE_STAR_ROWS,
  COURSE_SIHUA_ROWS,
  COURSE_PALACES,
} from '@/lib/ziwei/course';
import { BRANCHES } from '@/lib/ziwei/constants';

export const metadata = {
  title: '学盘课程 · 紫微斗数入门',
  description: '六课文字图解课：十二宫、十四主星、四化、三方四正、看盘五步、大限流年与太岁。文字图解课，没有视频。',
};

function Diagram({ kind }: { kind: string }) {
  if (kind === 'palaces') {
    // 十二宫排布图解（未起盘先用地支占位）
    const cells = Array.from({ length: 12 }, (_, b) => (
      <div key={b} style={{ border: '1px solid var(--t-border)', borderRadius: 8, padding: '10px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-gold)' }}>{COURSE_PALACES[b]}</div>
        <div style={{ fontSize: 11, color: 'var(--t-faint)', marginTop: 2 }}>{BRANCHES[b]}宫</div>
      </div>
    ));
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{cells}</div>
        <p style={{ fontSize: 12, color: 'var(--t-faint)', marginTop: 8 }}>
          十二宫从命宫起依次排布；命宫在哪里由出生时辰决定，命宫一动，十二宫跟着整体转动。起一张盘之后，排盘页会显示你那张盘真正的宫位。
        </p>
      </div>
    );
  }
  if (kind === 'stars') {
    return (
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--t-faint)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>主星</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>五行</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>一句话</th>
          </tr>
        </thead>
        <tbody>
          {COURSE_STAR_ROWS.map((r) => (
            <tr key={r.name} style={{ color: 'var(--t-text2)' }}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)', fontWeight: 600 }}>{r.name}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.element}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (kind === 'sihua') {
    return (
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--t-faint)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>年干</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>化禄</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>化权</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>化科</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>化忌</th>
          </tr>
        </thead>
        <tbody>
          {COURSE_SIHUA_ROWS.map((r) => (
            <tr key={r.stem} style={{ color: 'var(--t-text2)' }}>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)', fontWeight: 600 }}>{r.stem}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.lu}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.quan}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.ke}</td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>{r.ji}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (kind === 'sanfang') {
    return (
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--t-faint)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>本宫</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>三合</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>三合</th>
            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>对宫</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ color: 'var(--t-text2)' }}>
            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)', fontWeight: 600 }}>命宫</td>
            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>财帛宫</td>
            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>官禄宫</td>
            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>迁移宫</td>
          </tr>
        </tbody>
      </table>
    );
  }
  if (kind === 'steps') {
    return (
      <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.7, color: 'var(--t-text2)' }}>
        {COURSE_STEPS.map((s, i) => (
          <li key={s.title}>
            <b style={{ color: 'var(--t-text)' }}>{i + 1}. {s.title}：</b>{s.body}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--t-text2)' }}>
      在排盘页的时间轴上点一个大限，再点其中一年：盘面会标出大限与流年命宫，运限页会给出那一年太岁入卦、大限与流年的解读。先看大限定方向，再看流年定轻重。
    </p>
  );
}

export default function CoursePage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px 80px' }}>
      <Link href="/" style={{ fontSize: 13, color: 'var(--t-faint)' }}>← 返回首页</Link>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>学盘课程</h1>
      <p style={{ color: 'var(--t-text2)', marginBottom: 8, fontSize: 14, lineHeight: 1.7 }}>{COURSE_INTRO}</p>
      <p style={{ fontSize: 13, color: 'var(--t-faint)', marginBottom: 32 }}>
        不用注册，六课都可以直接看；起盘之后再回来看，十二宫图解会对应上你自己的盘。
        <Link href="/chart" style={{ color: 'var(--t-gold)', marginLeft: 8 }}>去排盘 →</Link>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {COURSE_LESSONS.map((lesson, i) => (
          <details
            key={lesson.id}
            open={i === 0}
            style={{ border: '1px solid var(--t-border)', borderRadius: 12, padding: '16px 20px', background: 'var(--t-card)' }}
          >
            <summary style={{ fontSize: 15, fontWeight: 600, cursor: 'pointer', color: 'var(--t-text)' }}>
              {lesson.title}
            </summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lesson.script.map((p, j) => (
                <p key={j} style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--t-text2)', margin: 0 }}>{p}</p>
              ))}
              <Diagram kind={lesson.diagram} />
              {lesson.note && (
                <p style={{ fontSize: 12, color: 'var(--t-faint)', margin: 0 }}>{lesson.note}</p>
              )}
            </div>
          </details>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--t-faint)', marginTop: 32, lineHeight: 1.7 }}>
        课程内容由本系统用自己的话撰写，仅供学习参考。紫微斗数是传统命理学说，解读仅供参考，不构成医疗、投资、法律建议。
      </p>
    </main>
  );
}
