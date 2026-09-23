"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GOAL_OPTIONS, type DailyActivity, type LearningPhase, type LearningResult as Result, type LearningSnapshot } from "../lib/learning-types";
import type { VocabularySummaryEntry } from "../lib/vocabulary";

type SourceScope = "PET" | "小托福" | "PET+小托福";

type SummaryWord = VocabularySummaryEntry & {
  id: string;
  phase: LearningPhase;
  sourceScope: SourceScope;
};

type Summary = {
  total: number;
  tested: number;
  known: number;
  unknown: number;
  untested: number;
  percent: number;
};

const phaseDetails: Array<{ phase: Exclude<LearningPhase, "phrases">; label: string; note: string }> = [
  { phase: "core", label: "阶段一 · 核心词", note: "两套词库共同收录" },
  { phase: "growth", label: "阶段二 · 常用词", note: "高频词与基础核心词" },
  { phase: "extension", label: "阶段三 · 提升词", note: "相对低频或难度更高" },
];

function summarize(words: SummaryWord[], results: Record<string, Result>): Summary {
  const statuses = words.map((word) => results[word.id]?.status).filter(Boolean);
  const known = statuses.filter((status) => status === "known").length;
  const unknown = statuses.filter((status) => status === "unknown").length;
  const tested = known + unknown;
  return {
    total: words.length,
    tested,
    known,
    unknown,
    untested: words.length - tested,
    percent: words.length ? Math.round((tested / words.length) * 100) : 0,
  };
}

function summarizeDay(
  record: DailyActivity[string] | undefined,
  fallbackGoal: number,
  screeningIds: Set<string>,
) {
  const entries = Object.entries(record?.words || {}).filter(([id]) => screeningIds.has(id));
  const known = entries.filter(([, status]) => status === "known").length;
  const unknown = entries.filter(([, status]) => status === "unknown").length;
  const count = known + unknown;
  const goal = GOAL_OPTIONS.some((option) => option === record?.goal) ? record!.goal : fallbackGoal;
  return { count, known, unknown, goal, percent: Math.min(100, Math.round((count / goal) * 100)) };
}

function StatBlocks({ summary }: { summary: Summary }) {
  return (
    <div className="admin-stat-grid">
      <div><span className="admin-dot green" /><strong>{summary.known.toLocaleString()}</strong><small>认识</small></div>
      <div><span className="admin-dot red" /><strong>{summary.unknown.toLocaleString()}</strong><small>不认识</small></div>
      <div><span className="admin-dot navy" /><strong>{summary.untested.toLocaleString()}</strong><small>未筛查</small></div>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return <div className="admin-progress" aria-label={`完成 ${percent}%`}><span style={{ width: `${percent}%` }} /></div>;
}

export default function AdminDashboard({
  initialSnapshot,
  vocabulary,
}: {
  initialSnapshot: LearningSnapshot;
  vocabulary: VocabularySummaryEntry[];
}) {
  const results = initialSnapshot.results;
  const activity = initialSnapshot.dailyActivity;
  const currentGoal = initialSnapshot.settings.goal;
  const phraseWords = useMemo(() => vocabulary.filter((word) => word.phase === "phrases"), [vocabulary]);
  const screeningWords = useMemo(() => vocabulary.filter((word) => word.phase !== "phrases"), [vocabulary]);
  const screeningIds = useMemo(() => new Set(screeningWords.map((word) => word.id)), [screeningWords]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = initialSnapshot.today.split("-").map(Number);
    return new Date(year, month - 1, 1);
  });

  const overview = useMemo(() => summarize(screeningWords, results), [results, screeningWords]);
  const pet = useMemo(
    () => summarize(screeningWords.filter((word) => word.sourceScope === "PET" || word.sourceScope === "PET+小托福"), results),
    [results, screeningWords],
  );
  const junior = useMemo(
    () => summarize(screeningWords.filter((word) => word.sourceScope === "小托福" || word.sourceScope === "PET+小托福"), results),
    [results, screeningWords],
  );
  const phases = useMemo(
    () => phaseDetails.map((item) => ({ ...item, summary: summarize(screeningWords.filter((word) => word.phase === item.phase), results) })),
    [results, screeningWords],
  );
  const today = useMemo(
    () => summarizeDay(activity[initialSnapshot.today], currentGoal, screeningIds).count,
    [activity, currentGoal, initialSnapshot.today, screeningIds],
  );
  const calendar = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells: Array<null | { day: number; dateKey: string; summary: ReturnType<typeof summarizeDay> }> = [
      ...Array.from({ length: leadingBlanks }, () => null),
    ];
    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, dateKey, summary: summarizeDay(activity[dateKey], currentGoal, screeningIds) });
    }
    while (cells.length % 7) cells.push(null);
    const activeDays = cells.filter((cell) => cell && cell.summary.count > 0);
    return {
      year,
      month,
      cells,
      activeDays: activeDays.length,
      completedDays: activeDays.filter((cell) => cell && cell.summary.count >= cell.summary.goal).length,
      totalJudgements: activeDays.reduce((sum, cell) => sum + (cell?.summary.count || 0), 0),
    };
  }, [activity, calendarMonth, currentGoal, screeningIds]);
  const overlapCount = screeningWords.filter((word) => word.sourceScope === "PET+小托福").length;
  const petPhraseCount = phraseWords.filter((word) => word.sourceScope === "PET" || word.sourceScope === "PET+小托福").length;
  const juniorPhraseCount = phraseWords.filter((word) => word.sourceScope === "小托福" || word.sourceScope === "PET+小托福").length;
  const [currentYear, currentMonth] = initialSnapshot.today.split("-").map(Number);
  const canGoNext = calendarMonth.getFullYear() < currentYear
    || (calendarMonth.getFullYear() === currentYear && calendarMonth.getMonth() < currentMonth - 1);
  const shiftCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A·</span>
          <div><strong>学习记录</strong><span>家庭学习后台</span></div>
        </div>
        <Link className="admin-back" href="/">← 返回认词</Link>
      </header>

      <section className="admin-hero">
        <div>
          <span className="eyebrow">PROGRESS OVERVIEW</span>
          <h1>单词初筛概览</h1>
          <p>词组不参与初筛；统计只包含三个单词阶段。</p>
        </div>
        <div className="admin-hero-number">
          <strong>{overview.percent}%</strong>
          <span>{overview.tested.toLocaleString()} / {overview.total.toLocaleString()} 已筛查</span>
        </div>
        <ProgressBar percent={overview.percent} />
        <div className="admin-overview-metrics">
          <div><small>认识</small><strong>{overview.known.toLocaleString()}</strong></div>
          <div><small>不认识</small><strong>{overview.unknown.toLocaleString()}</strong></div>
          <div><small>未筛查</small><strong>{overview.untested.toLocaleString()}</strong></div>
          <div><small>今天判断</small><strong>{today.toLocaleString()}</strong></div>
        </div>
      </section>

      <section className="admin-section attendance-card">
        <div className="attendance-header">
          <div><span className="eyebrow">DAILY CHECK-IN</span><h2>学习打卡日历</h2><p>每天按完成的不同单词计数，重复判断同一个词只算一次。</p></div>
          <div className="calendar-nav">
            <button type="button" onClick={() => shiftCalendarMonth(-1)} aria-label="上个月">‹</button>
            <strong>{calendar.year} 年 {calendar.month + 1} 月</strong>
            <button type="button" onClick={() => shiftCalendarMonth(1)} disabled={!canGoNext} aria-label="下个月">›</button>
          </div>
        </div>
        <div className="attendance-summary">
          <div><small>打卡天数</small><strong>{calendar.activeDays}</strong></div>
          <div><small>达标天数</small><strong>{calendar.completedDays}</strong></div>
          <div><small>本月判断</small><strong>{calendar.totalJudgements.toLocaleString()}</strong></div>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>周{day}</span>)}
        </div>
        <div className="calendar-grid">
          {calendar.cells.map((cell, index) => {
            if (!cell) return <div className="calendar-day is-empty" key={`empty-${index}`} aria-hidden="true" />;
            const hasActivity = cell.summary.count > 0;
            const completed = hasActivity && cell.summary.count >= cell.summary.goal;
            const isToday = cell.dateKey === initialSnapshot.today;
            const isFuture = cell.dateKey > initialSnapshot.today;
            return (
              <article
                className={`calendar-day${hasActivity ? " has-activity" : ""}${completed ? " is-complete" : ""}${isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}`}
                key={cell.dateKey}
                title={hasActivity ? `认识 ${cell.summary.known}，不认识 ${cell.summary.unknown}` : ""}
              >
                <div className="calendar-day-top"><span>{cell.day}</span>{completed && <b>✓</b>}</div>
                {hasActivity ? (
                  <>
                    <strong>{cell.summary.count} / {cell.summary.goal}</strong>
                    <small>{completed ? "已达标" : `完成 ${cell.summary.percent}%`}</small>
                    <div className="calendar-day-progress"><span style={{ width: `${cell.summary.percent}%` }} /></div>
                  </>
                ) : (
                  <small>{isFuture ? "" : "未打卡"}</small>
                )}
              </article>
            );
          })}
        </div>
        <div className="calendar-legend"><span><i className="complete" />已达标</span><span><i className="active" />有学习</span><span><i />未打卡</span></div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="eyebrow">BY SOURCE</span><h2>按词库统计</h2></div>
          <p>共同词分别计入两套词库</p>
        </div>
        <div className="source-card-grid">
          {[
            { label: "PET 词库", note: "基础与日常应用词汇", summary: pet },
            { label: "小托福词库", note: "校园与学术场景词汇", summary: junior },
          ].map((source) => (
            <article className="source-stat-card" key={source.label}>
              <header>
                <div><h3>{source.label}</h3><p>{source.note}</p></div>
                <strong>{source.summary.percent}%</strong>
              </header>
              <ProgressBar percent={source.summary.percent} />
              <p className="source-tested">已筛查 {source.summary.tested.toLocaleString()} / {source.summary.total.toLocaleString()}</p>
              <StatBlocks summary={source.summary} />
            </article>
          ))}
        </div>
        <p className="admin-note">两套词库共同收录 {overlapCount.toLocaleString()} 个单词，因此 PET 与小托福的数量相加会大于去重后的单词总数。</p>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><span className="eyebrow">BY STAGE</span><h2>按阶段统计</h2></div>
        </div>
        <div className="phase-stat-grid">
          {phases.map((item) => (
            <article className="phase-stat-card" key={item.phase}>
              <div className="phase-stat-title"><h3>{item.label}</h3><strong>{item.summary.percent}%</strong></div>
              <p>{item.note}</p>
              <ProgressBar percent={item.summary.percent} />
              <span>已筛查 {item.summary.tested.toLocaleString()} / {item.summary.total.toLocaleString()}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section phrase-reference-card">
        <div><span className="eyebrow">REFERENCE LIST</span><h2>词组表</h2><p>只供分类浏览，不计入初筛完成率。</p></div>
        <div className="phrase-reference-numbers">
          <div><strong>{phraseWords.length}</strong><span>全部词组</span></div>
          <div><strong>{petPhraseCount}</strong><span>PET</span></div>
          <div><strong>{juniorPhraseCount}</strong><span>小托福</span></div>
        </div>
      </section>

      <footer className="admin-footer">记录保存在云主机数据库中，所有已登录设备共享同一份进度。本页面不提供清空数据功能。</footer>
    </main>
  );
}
