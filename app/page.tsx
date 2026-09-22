"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import rawVocabulary from "./data/pet-vocabulary.json";

type ResultStatus = "known" | "unsure" | "unknown";
type PracticeMode = "untested" | "weak" | "unknown" | "all";

type WordEntry = {
  id: string;
  word: string;
  lemma: string;
  letter: string;
  pos: string;
  phonetic: string;
  translation: string;
  definitionEn: string;
  exampleEn: string;
  exampleZh: string;
  page: string;
  isPhrase: boolean;
  isOverlap: boolean;
  detailSource: string;
};

type Result = {
  status: ResultStatus;
  attempts: number;
  updatedAt: string;
};

const vocabulary = rawVocabulary as WordEntry[];
const RESULT_KEY = "pet-screening-results-v1";
const SETTINGS_KEY = "pet-screening-settings-v1";

const modeLabels: Record<PracticeMode, string> = {
  untested: "未测词优先",
  weak: "模糊词复查",
  unknown: "不认识的词",
  all: "全部随机",
};

const posLabels: Record<string, string> = {
  n: "名词", v: "动词", adj: "形容词", adv: "副词", det: "限定词",
  pron: "代词", prep: "介词", conj: "连词", exclam: "感叹词",
  modal: "情态动词", "phr v": "短语动词", "prep phr": "介词短语",
  "av & v": "助动词 / 动词", "adv & adj": "副词 / 形容词",
};

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function matchesMode(id: string, mode: PracticeMode, results: Record<string, Result>) {
  const status = results[id]?.status;
  if (mode === "untested") return !status;
  if (mode === "weak") return status === "unsure" || status === "unknown";
  if (mode === "unknown") return status === "unknown";
  return true;
}

function displayPos(pos: string) {
  if (!pos) return "词性未标注";
  return pos.split(" & ").map((part) => posLabels[part] || part).join(" / ");
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function Home() {
  const today = localDay();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [mode, setMode] = useState<PracticeMode>("untested");
  const [goal, setGoal] = useState(20);
  const [currentId, setCurrentId] = useState(vocabulary[0].id);
  const [revealed, setRevealed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");

  const wordMap = useMemo(() => new Map(vocabulary.map((word) => [word.id, word])), []);
  const order = useMemo(
    () => [...vocabulary].sort((a, b) => stableHash(`${today}-${a.id}`) - stableHash(`${today}-${b.id}`)),
    [today],
  );

  const findNext = useCallback((nextResults: Record<string, Result>, afterId: string, nextMode = mode) => {
    const start = Math.max(0, order.findIndex((word) => word.id === afterId));
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(start + offset) % order.length];
      if (matchesMode(candidate.id, nextMode, nextResults)) return candidate.id;
    }
    return afterId;
  }, [mode, order]);

  useEffect(() => {
    try {
      const savedResults = JSON.parse(localStorage.getItem(RESULT_KEY) || "{}") as Record<string, Result>;
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as { goal?: number; mode?: PracticeMode };
      const savedMode = settings.mode && modeLabels[settings.mode] ? settings.mode : "untested";
      setResults(savedResults);
      setMode(savedMode);
      setGoal([10, 20, 30, 50].includes(settings.goal || 0) ? settings.goal! : 20);
      setCurrentId(order.find((word) => matchesMode(word.id, savedMode, savedResults))?.id || order[0].id);
    } catch {
      setCurrentId(order[0].id);
    }
    setHydrated(true);
  }, [order]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1100);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const current = wordMap.get(currentId) || vocabulary[0];
  const stats = useMemo(() => {
    const values = Object.values(results);
    return {
      tested: values.length,
      known: values.filter((item) => item.status === "known").length,
      unsure: values.filter((item) => item.status === "unsure").length,
      unknown: values.filter((item) => item.status === "unknown").length,
      today: values.filter((item) => item.updatedAt.startsWith(today)).length,
    };
  }, [results, today]);

  const modeCount = useMemo(
    () => vocabulary.reduce((count, word) => count + (matchesMode(word.id, mode, results) ? 1 : 0), 0),
    [mode, results],
  );

  const chooseMode = (nextMode: PracticeMode) => {
    setMode(nextMode);
    setRevealed(false);
    setPanelOpen(false);
    const next = order.find((word) => matchesMode(word.id, nextMode, results));
    if (next) setCurrentId(next.id);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal, mode: nextMode }));
  };

  const judge = useCallback((status: ResultStatus) => {
    const previous = results[currentId];
    const nextResults = {
      ...results,
      [currentId]: {
        status,
        attempts: (previous?.attempts || 0) + 1,
        updatedAt: new Date().toISOString(),
      },
    };
    localStorage.setItem(RESULT_KEY, JSON.stringify(nextResults));
    setResults(nextResults);
    setRevealed(false);
    setToast(status === "known" ? "已记录：认识" : status === "unsure" ? "已记录：有点模糊" : "已记录：不认识");
    setCurrentId(findNext(nextResults, currentId));
  }, [currentId, findNext, results]);

  const skip = useCallback(() => {
    setRevealed(false);
    setCurrentId(findNext(results, currentId));
  }, [currentId, findNext, results]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input, textarea, select")) return;
      if (event.key === "Escape" && panelOpen) {
        setPanelOpen(false);
        return;
      }
      if (panelOpen) return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && event.key === "1") judge("unknown");
      else if (revealed && event.key === "2") judge("unsure");
      else if (revealed && event.key === "3") judge("known");
      else if (event.key === "ArrowRight") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [judge, panelOpen, revealed, skip]);

  const pronounce = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.lemma || current.word);
    utterance.lang = "en-GB";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  };

  const updateGoal = (nextGoal: number) => {
    setGoal(nextGoal);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal: nextGoal, mode }));
  };

  const exportProgress = () => {
    const rows = [["PET编号", "单词", "判断", "判断次数", "最后判断时间", "中文释义"]];
    vocabulary.forEach((word) => {
      const result = results[word.id];
      if (!result) return;
      const status = result.status === "known" ? "认识" : result.status === "unsure" ? "有点模糊" : "不认识";
      rows.push([word.id, word.word, status, String(result.attempts), result.updatedAt, word.translation]);
    });
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `PET认词记录_${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetProgress = () => {
    if (!window.confirm("确定清空全部判断记录吗？此操作无法撤销。")) return;
    localStorage.removeItem(RESULT_KEY);
    setResults({});
    setMode("untested");
    setCurrentId(order[0].id);
    setRevealed(false);
    setPanelOpen(false);
  };

  const testedPercent = Math.round((stats.tested / vocabulary.length) * 100);
  const todayPercent = Math.min(100, Math.round((stats.today / goal) * 100));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A·</span>
          <div>
            <strong>PET 认词筛查</strong>
            <span>先说意思，再看答案</span>
          </div>
        </div>
        <div className="top-actions">
          <div className={`progress-pill ${stats.today >= goal ? "complete" : ""}`}>
            {stats.today >= goal ? "今日目标完成 ✓" : `今日 ${stats.today} / ${goal}`}
          </div>
          <button className="records-button" type="button" onClick={() => setPanelOpen(true)} aria-label="打开学习记录">
            <span aria-hidden="true">▥</span><span>学习记录</span>
          </button>
        </div>
      </header>

      <section className="session-bar" aria-label="筛查进度">
        <button className="mode-summary" type="button" onClick={() => setPanelOpen(true)}>
          <span className="eyebrow">当前模式</span>
          <strong>{modeLabels[mode]} · {modeCount.toLocaleString()} 词</strong>
        </button>
        <div className="progress-track" aria-label={`总进度 ${testedPercent}%`}>
          <span style={{ width: `${testedPercent}%` }} />
        </div>
        <span className="remaining">已筛查 {stats.tested.toLocaleString()} / {vocabulary.length.toLocaleString()}</span>
      </section>

      <section className={`word-card ${revealed ? "is-revealed" : ""}`} aria-live="polite">
        <div className="card-meta">
          <span>PET · {current.letter || "#"}</span>
          <span>官方词表第 {current.page} 页</span>
        </div>
        <div className="word-stage">
          <p className="prompt">{revealed ? "现在对照答案，诚实判断" : "请先大声说出它的意思"}</p>
          <h1>{current.word}</h1>

          {!revealed ? (
            <div className="reveal-area">
              <button className="reveal-button" onClick={() => setRevealed(true)}>
                查看答案 <span>空格键</span>
              </button>
              <button className="skip-button" type="button" onClick={skip}>暂时跳过 <span>→</span></button>
            </div>
          ) : (
            <div className="answer-panel">
              <div className="pronunciation">
                <button className="sound-button" type="button" onClick={pronounce} aria-label="播放英式发音">▶</button>
                <span>{current.phonetic ? `/${current.phonetic}/` : "暂无音标"}</span>
                <span>{displayPos(current.pos)}</span>
                {current.isPhrase && <span className="phrase-chip">短语</span>}
              </div>
              <h2>{current.translation || "释义待补充"}</h2>
              {current.definitionEn && <p className="english-definition">{current.definitionEn}</p>}
              {current.exampleEn && (
                <div className="example-box">
                  <strong>例句</strong>
                  <p>{current.exampleEn}</p>
                  {current.exampleZh && <span>{current.exampleZh}</span>}
                </div>
              )}
              <p className="source-note">释义来源：{current.detailSource}</p>
              <div className="judge-row">
                <button className="judge no" onClick={() => judge("unknown")}>
                  <span className="judge-key">1</span><span><strong>不认识</strong><small>完全没想起来</small></span>
                </button>
                <button className="judge maybe" onClick={() => judge("unsure")}>
                  <span className="judge-key">2</span><span><strong>有点模糊</strong><small>只说对一部分</small></span>
                </button>
                <button className="judge yes" onClick={() => judge("known")}>
                  <span className="judge-key">3</span><span><strong>认识</strong><small>主要意思说对了</small></span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="hint-row">
        <span>答案出现前不显示音标与词性，避免无意提示</span>
        <span className="today-track"><i style={{ width: `${todayPercent}%` }} /> 今日完成度 {todayPercent}%</span>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      {panelOpen && (
        <div className="panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPanelOpen(false)}>
          <aside className="records-panel" aria-label="学习记录">
            <div className="panel-header">
              <div><span className="eyebrow">MY PROGRESS</span><h2>学习记录</h2></div>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="关闭">×</button>
            </div>

            <div className="overall-progress">
              <div><strong>{testedPercent}%</strong><span>已完成全词库筛查</span></div>
              <div className="progress-track"><span style={{ width: `${testedPercent}%` }} /></div>
            </div>

            <div className="stat-grid">
              <div><span className="dot green" /><strong>{stats.known}</strong><small>认识</small></div>
              <div><span className="dot amber" /><strong>{stats.unsure}</strong><small>模糊</small></div>
              <div><span className="dot red" /><strong>{stats.unknown}</strong><small>不认识</small></div>
              <div><span className="dot navy" /><strong>{vocabulary.length - stats.tested}</strong><small>未筛查</small></div>
            </div>

            <section className="panel-section">
              <h3>选择筛查模式</h3>
              <div className="mode-list">
                {(Object.keys(modeLabels) as PracticeMode[]).map((item) => (
                  <button key={item} className={mode === item ? "active" : ""} onClick={() => chooseMode(item)}>
                    <span>{modeLabels[item]}</span>
                    <small>{vocabulary.reduce((count, word) => count + (matchesMode(word.id, item, results) ? 1 : 0), 0)} 词</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel-section">
              <h3>每日目标</h3>
              <div className="goal-row">
                {[10, 20, 30, 50].map((item) => (
                  <button key={item} className={goal === item ? "active" : ""} onClick={() => updateGoal(item)}>{item} 词</button>
                ))}
              </div>
            </section>

            <section className="panel-section data-actions">
              <h3>数据管理</h3>
              <button className="export-button" type="button" onClick={exportProgress} disabled={!stats.tested}>导出筛查结果 CSV</button>
              <button className="reset-button" type="button" onClick={resetProgress} disabled={!stats.tested}>清空全部记录</button>
              <p>记录只保存在当前浏览器中，不会上传。</p>
            </section>
          </aside>
        </div>
      )}

      {!hydrated && <div className="loading-cover">正在读取词库…</div>}
    </main>
  );
}
