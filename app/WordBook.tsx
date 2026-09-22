"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import rawVocabulary from "./data/vocabulary.json";

type ResultStatus = "known" | "unknown";
type PracticeMode = "untested" | "unknown" | "all";
type LearningPhase = "core" | "growth" | "extension" | "phrases";
type PhraseGroup =
  | "get" | "put" | "turn" | "look" | "take" | "go" | "give" | "keep" | "set" | "break"
  | "in" | "at" | "on" | "out" | "up" | "by" | "as"
  | "verb_other" | "preposition_other" | "noun_compound" | "adjective_phrase" | "daily_expression";
type PhraseGroupFilter = "all" | PhraseGroup;

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
  relatedWords: string;
  phase: LearningPhase;
  phaseOrder: number | null;
  frequency: number;
  difficulty: string;
  priorityReason: string;
  sourceScope: "PET" | "小托福" | "PET+小托福";
  oxfordCore: boolean;
  isPhrase: boolean;
  phraseHead: string;
  phraseGroup: PhraseGroup | "";
  legacyPetId: string;
};

type Result = {
  status: ResultStatus;
  attempts: number;
  updatedAt: string;
};

type StoredResult = Omit<Result, "status"> & { status: ResultStatus | "unsure" };

type DailyActivity = Record<string, {
  goal: number;
  words: Record<string, ResultStatus>;
}>;

const vocabulary = rawVocabulary as WordEntry[];
const RESULT_KEY = "word-ledger-results-v2";
const SETTINGS_KEY = "word-ledger-settings-v2";
const DAILY_ACTIVITY_KEY = "word-ledger-daily-v1";
const LEGACY_RESULT_KEY = "pet-screening-results-v1";
const LEGACY_SETTINGS_KEY = "pet-screening-settings-v1";

const phaseLabels: Record<LearningPhase, string> = {
  core: "阶段一 · 核心词",
  growth: "阶段二 · 常用词",
  extension: "阶段三 · 提升词",
  phrases: "词组专项",
};

const phaseDescriptions: Record<LearningPhase, string> = {
  core: "两套词库共同覆盖的高价值词",
  growth: "高频词与基础核心词",
  extension: "相对低频或难度更高的词",
  phrases: "分类浏览固定搭配与短语动词",
};

const phaseRank: Record<LearningPhase, number> = { core: 0, growth: 1, extension: 2, phrases: 3 };

const phraseGroupLabels: Record<PhraseGroupFilter, string> = {
  all: "全部词组",
  get: "get 开头",
  put: "put 开头",
  turn: "turn 开头",
  look: "look 开头",
  take: "take 开头",
  go: "go 开头",
  give: "give 开头",
  keep: "keep 开头",
  set: "set 开头",
  break: "break 开头",
  in: "in 开头",
  at: "at 开头",
  on: "on 开头",
  out: "out 开头",
  up: "up 开头",
  by: "by 开头",
  as: "as 开头",
  verb_other: "其他动词词组",
  preposition_other: "其他介词与固定搭配",
  noun_compound: "名词与复合词",
  adjective_phrase: "形容词与描述词组",
  daily_expression: "日常表达",
};

const phraseGroupOrder = Object.keys(phraseGroupLabels) as PhraseGroupFilter[];
const phraseVocabulary = vocabulary.filter((word) => word.phase === "phrases");
const phraseGroupCounts = phraseGroupOrder.reduce((counts, group) => {
  counts[group] = group === "all"
    ? phraseVocabulary.length
    : phraseVocabulary.filter((word) => word.phraseGroup === group).length;
  return counts;
}, {} as Record<PhraseGroupFilter, number>);

const modeLabels: Record<PracticeMode, string> = {
  untested: "未测词优先",
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

function recordDailyActivity(wordId: string, status: ResultStatus, goal: number) {
  try {
    const activity = JSON.parse(localStorage.getItem(DAILY_ACTIVITY_KEY) || "{}") as DailyActivity;
    const day = localDay();
    const current = activity[day] || { goal, words: {} };
    activity[day] = {
      goal,
      words: { ...current.words, [wordId]: status },
    };
    localStorage.setItem(DAILY_ACTIVITY_KEY, JSON.stringify(activity));
  } catch {
    // A failed activity log must never interrupt the child's screening flow.
  }
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
  if (mode === "unknown") return status === "unknown";
  return true;
}

function matchesPhraseGroup(word: WordEntry, phase: LearningPhase, group: PhraseGroupFilter) {
  return phase !== "phrases" || group === "all" || word.phraseGroup === group;
}

function displayPos(pos: string) {
  if (!pos) return "词性未标注";
  return pos.split(" & ").map((part) => posLabels[part] || part).join(" / ");
}

export default function WordBook() {
  const today = localDay();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [mode, setMode] = useState<PracticeMode>("untested");
  const [phase, setPhase] = useState<LearningPhase>("core");
  const [phraseGroup, setPhraseGroup] = useState<PhraseGroupFilter>("all");
  const [goal, setGoal] = useState(20);
  const [currentId, setCurrentId] = useState(vocabulary[0].id);
  const [revealed, setRevealed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");

  const wordMap = useMemo(() => new Map(vocabulary.map((word) => [word.id, word])), []);
  const legacyMap = useMemo(
    () => new Map(vocabulary.filter((word) => word.legacyPetId).map((word) => [word.legacyPetId, word.id])),
    [],
  );
  const order = useMemo(
    () => [...vocabulary].sort((a, b) => {
      const phaseDifference = phaseRank[a.phase] - phaseRank[b.phase];
      if (phaseDifference) return phaseDifference;
      const bandA = Math.floor(((a.phaseOrder || 999999) - 1) / 50);
      const bandB = Math.floor(((b.phaseOrder || 999999) - 1) / 50);
      if (bandA !== bandB) return bandA - bandB;
      return stableHash(`${today}-${a.id}`) - stableHash(`${today}-${b.id}`);
    }),
    [today],
  );

  const findNext = useCallback((
    nextResults: Record<string, Result>,
    afterId: string,
    nextMode = mode,
    nextPhase = phase,
    nextPhraseGroup = phraseGroup,
  ) => {
    const start = Math.max(0, order.findIndex((word) => word.id === afterId));
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(start + offset) % order.length];
      if (
        candidate.phase === nextPhase
        && matchesPhraseGroup(candidate, nextPhase, nextPhraseGroup)
        && matchesMode(candidate.id, nextMode, nextResults)
      ) return candidate.id;
    }
    return afterId;
  }, [mode, order, phase, phraseGroup]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RESULT_KEY) || localStorage.getItem(LEGACY_RESULT_KEY) || "{}";
      const originalResults = JSON.parse(stored) as Record<string, StoredResult>;
      const savedResults: Record<string, Result> = {};
      Object.entries(originalResults).forEach(([id, result]) => {
        const migratedId = wordMap.has(id) ? id : legacyMap.get(id);
        if (migratedId) {
          savedResults[migratedId] = {
            ...result,
            status: result.status === "known" ? "known" : "unknown",
          };
        }
      });
      const storedSettings = localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(LEGACY_SETTINGS_KEY) || "{}";
      const settings = JSON.parse(storedSettings) as {
        goal?: number;
        mode?: PracticeMode;
        phase?: LearningPhase;
        phraseGroup?: PhraseGroupFilter;
      };
      const savedMode = settings.mode && modeLabels[settings.mode] ? settings.mode : "untested";
      const savedPhase = settings.phase && phaseLabels[settings.phase] ? settings.phase : "core";
      const savedPhraseGroup = savedPhase === "phrases"
        && settings.phraseGroup
        && phraseGroupLabels[settings.phraseGroup]
        ? settings.phraseGroup
        : "all";
      setResults(savedResults);
      setMode(savedMode);
      setPhase(savedPhase);
      setPhraseGroup(savedPhraseGroup);
      setGoal([10, 20, 30, 50].includes(settings.goal || 0) ? settings.goal! : 20);
      setCurrentId(
        order.find((word) => word.phase === savedPhase
          && matchesPhraseGroup(word, savedPhase, savedPhraseGroup)
          && matchesMode(word.id, savedMode, savedResults))?.id
        || order.find((word) => word.phase === savedPhase)?.id
        || order[0].id,
      );
      localStorage.setItem(RESULT_KEY, JSON.stringify(savedResults));
    } catch {
      setCurrentId(order[0].id);
    }
    setHydrated(true);
  }, [legacyMap, order, wordMap]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1100);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const current = wordMap.get(currentId) || vocabulary[0];
  const phaseWords = useMemo(
    () => vocabulary.filter((word) => word.phase === phase && matchesPhraseGroup(word, phase, phraseGroup)),
    [phase, phraseGroup],
  );
  const phraseSections = useMemo(() => {
    const groups = phraseGroup === "all"
      ? phraseGroupOrder.filter((group): group is PhraseGroup => group !== "all")
      : [phraseGroup];
    return groups.map((group) => ({
      group,
      words: phraseVocabulary.filter((word) => word.phraseGroup === group),
    })).filter((section) => section.words.length > 0);
  }, [phraseGroup]);
  const stats = useMemo(() => {
    const values = phaseWords.map((word) => results[word.id]).filter(Boolean);
    const allValues = Object.entries(results)
      .filter(([id]) => wordMap.get(id)?.phase !== "phrases")
      .map(([, result]) => result);
    return {
      tested: values.length,
      today: allValues.filter((item) => localDay(new Date(item.updatedAt)) === today).length,
    };
  }, [phaseWords, results, today, wordMap]);

  const modeCount = useMemo(
    () => phaseWords.reduce((count, word) => count + (matchesMode(word.id, mode, results) ? 1 : 0), 0),
    [mode, phaseWords, results],
  );

  const chooseMode = (nextMode: PracticeMode) => {
    setMode(nextMode);
    setRevealed(false);
    setPanelOpen(false);
    const next = order.find((word) => word.phase === phase
      && matchesPhraseGroup(word, phase, phraseGroup)
      && matchesMode(word.id, nextMode, results));
    if (next) setCurrentId(next.id);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal, mode: nextMode, phase, phraseGroup }));
  };

  const choosePhase = (nextPhase: LearningPhase) => {
    setPhase(nextPhase);
    setMode("untested");
    setPhraseGroup("all");
    setRevealed(false);
    setPanelOpen(false);
    const next = order.find((word) => word.phase === nextPhase && matchesMode(word.id, "untested", results))
      || order.find((word) => word.phase === nextPhase);
    if (next) setCurrentId(next.id);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal, mode: "untested", phase: nextPhase, phraseGroup: "all" }));
  };

  const choosePhraseGroup = (nextGroup: PhraseGroupFilter) => {
    setPhraseGroup(nextGroup);
    setMode("untested");
    setRevealed(false);
    setPanelOpen(false);
    const next = order.find((word) => word.phase === "phrases"
      && matchesPhraseGroup(word, "phrases", nextGroup)
      && matchesMode(word.id, "untested", results))
      || order.find((word) => word.phase === "phrases" && matchesPhraseGroup(word, "phrases", nextGroup));
    if (next) setCurrentId(next.id);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal, mode: "untested", phase: "phrases", phraseGroup: nextGroup }));
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
    recordDailyActivity(currentId, status, goal);
    setResults(nextResults);
    setRevealed(false);
    setToast(status === "known" ? "已记录：认识" : "已记录：不认识");
    setCurrentId(findNext(nextResults, currentId));
  }, [currentId, findNext, goal, results]);

  const skip = useCallback(() => {
    setRevealed(false);
    setCurrentId(findNext(results, currentId));
  }, [currentId, findNext, results]);

  const pronounce = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.lemma || current.word);
    utterance.lang = "en-GB";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }, [current]);

  const revealAnswer = useCallback(() => {
    setRevealed(true);
    pronounce();
  }, [pronounce]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input, textarea, select")) return;
      if (event.key === "Escape" && panelOpen) {
        setPanelOpen(false);
        return;
      }
      if (panelOpen || phase === "phrases") return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        revealAnswer();
      } else if (revealed && event.key === "1") judge("unknown");
      else if (revealed && event.key === "2") judge("known");
      else if (event.key === "ArrowRight") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [judge, panelOpen, phase, revealAnswer, revealed, skip]);

  const updateGoal = (nextGoal: number) => {
    setGoal(nextGoal);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ goal: nextGoal, mode, phase, phraseGroup }));
  };

  const testedPercent = Math.round((stats.tested / phaseWords.length) * 100);
  const todayPercent = Math.min(100, Math.round((stats.today / goal) * 100));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A·</span>
          <div>
            <strong>认词簿</strong>
            <span>{phase === "phrases" ? "分类查看词组与释义" : "先说意思，再看答案"}</span>
          </div>
        </div>
        <div className="top-actions">
          <div className={`progress-pill ${phase !== "phrases" && stats.today >= goal ? "complete" : ""}`}>
            {phase === "phrases"
              ? `词组表 · ${phraseVocabulary.length} 个`
              : stats.today >= goal ? "今日目标完成 ✓" : `今日 ${stats.today} / ${goal}`}
          </div>
        </div>
      </header>

      <section className="session-bar" aria-label={phase === "phrases" ? "词组浏览" : "筛查进度"}>
        <button className="mode-summary" type="button" onClick={() => setPanelOpen(true)} aria-label="打开学习设置">
          <span className="eyebrow">{phaseLabels[phase]}</span>
          <strong>
            {phase === "phrases"
              ? `${phraseGroupLabels[phraseGroup]} · ${phaseWords.length.toLocaleString()} 个`
              : `${modeLabels[mode]} · ${modeCount.toLocaleString()} 词`}
          </strong>
        </button>
        {phase === "phrases" ? (
          <span className="browse-note">直接浏览，不计入辨识进度</span>
        ) : (
          <>
            <div className="progress-track" aria-label={`总进度 ${testedPercent}%`}>
              <span style={{ width: `${testedPercent}%` }} />
            </div>
            <span className="remaining">本阶段 {stats.tested.toLocaleString()} / {phaseWords.length.toLocaleString()}</span>
          </>
        )}
      </section>

      {phase === "phrases" && (
        <section className="phrase-filter-bar" aria-label="词组分类">
          <div>
            <span className="eyebrow">PHRASE GROUP</span>
            <strong>按开头与结构分类浏览</strong>
          </div>
          <label>
            <span>当前分类</span>
            <select
              value={phraseGroup}
              onChange={(event) => choosePhraseGroup(event.target.value as PhraseGroupFilter)}
            >
              {phraseGroupOrder.map((group) => (
                <option key={group} value={group}>
                  {phraseGroupLabels[group]} · {phraseGroupCounts[group]} 个
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {phase === "phrases" ? (
        <section className="phrase-library" aria-label={`${phraseGroupLabels[phraseGroup]}词组表`}>
          {phraseSections.map((section) => (
            <section className="phrase-section" key={section.group}>
              <header>
                <div>
                  <span className="eyebrow">PHRASE LIST</span>
                  <h2>{phraseGroupLabels[section.group]}</h2>
                </div>
                <strong>{section.words.length} 个</strong>
              </header>
              <div className="phrase-grid">
                {section.words.map((word) => (
                  <article className="phrase-row" key={word.id}>
                    <strong>{word.word}</strong>
                    <span>{word.translation}</span>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : (
      <section className={`word-card ${revealed ? "is-revealed" : ""}`} aria-live="polite">
        <div className="card-meta">
          <span>
            {phaseLabels[phase]}
            {phase === "phrases" ? ` · ${phraseGroupLabels[phraseGroup]}` : ` · ${current.priorityReason}`}
            {` · ${current.difficulty || "常用"}`}
          </span>
          <span>{modeCount ? `本组剩余 ${modeCount.toLocaleString()} 词` : "本组已完成"}</span>
        </div>
        {modeCount === 0 ? (
          <div className="empty-state">
            <span className="finish-mark">✓</span>
            <h1>这一组已经完成</h1>
            <p>可以复查不认识的词，或者切换到下一个阶段。</p>
            <div>
              <button type="button" onClick={() => chooseMode("unknown")}>复查不认识的词</button>
              <button type="button" onClick={() => setPanelOpen(true)}>切换阶段</button>
            </div>
          </div>
        ) : (
          <div className="word-stage">
            <p className="prompt">{revealed ? "现在对照答案，诚实判断" : "请先大声说出它的意思"}</p>
            <h1>{current.word}</h1>

            {!revealed ? (
              <div className="reveal-area">
                <button className="reveal-button" onClick={revealAnswer}>
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
                <h2>{current.translation}</h2>
                {current.definitionEn && <p className="english-definition">{current.definitionEn}</p>}
                {current.exampleEn && (
                  <div className="example-box">
                    <strong>例句</strong>
                    <p>{current.exampleEn}</p>
                    {current.exampleZh && <span>{current.exampleZh}</span>}
                  </div>
                )}
                {current.relatedWords && <p className="source-note">相关词：{current.relatedWords}</p>}
                <div className="judge-row">
                  <button className="judge no" onClick={() => judge("unknown")}>
                    <span className="judge-key">1</span><span><strong>不认识</strong><small>留到后面继续学</small></span>
                  </button>
                  <button className="judge yes" onClick={() => judge("known")}>
                    <span className="judge-key">2</span><span><strong>认识</strong><small>从学习池中剔除</small></span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      <footer className="hint-row">
        <span>{phase === "phrases" ? "词组表仅供浏览，不需要逐个判断" : "答案出现前不显示音标与词性，避免无意提示"}</span>
        {phase !== "phrases" && (
          <span className="today-track"><i style={{ width: `${todayPercent}%` }} /> 今日完成度 {todayPercent}%</span>
        )}
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      {panelOpen && (
        <div className="panel-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPanelOpen(false)}>
          <aside className="records-panel" aria-label="学习设置">
            <div className="panel-header">
              <div><span className="eyebrow">STUDY SETTINGS</span><h2>学习设置</h2></div>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="关闭">×</button>
            </div>

            <section className="panel-section">
              <h3>选择阶段</h3>
              <div className="phase-list">
                {(Object.keys(phaseLabels) as LearningPhase[]).map((item) => {
                  const count = vocabulary.filter((word) => word.phase === item).length;
                  return (
                    <button key={item} className={phase === item ? "active" : ""} onClick={() => choosePhase(item)}>
                      <span><strong>{phaseLabels[item]}</strong><small>{phaseDescriptions[item]}</small></span>
                      <b>{count.toLocaleString()}</b>
                    </button>
                  );
                })}
              </div>
              <p className="library-note">完整词库 {vocabulary.length.toLocaleString()} 条，统计信息请在学习记录后台查看。</p>
            </section>

            {phase !== "phrases" && (
              <section className="panel-section">
                <h3>选择筛查模式</h3>
                <div className="mode-list">
                  {(Object.keys(modeLabels) as PracticeMode[]).map((item) => (
                    <button key={item} className={mode === item ? "active" : ""} onClick={() => chooseMode(item)}>
                      <span>{modeLabels[item]}</span>
                      <small>{phaseWords.reduce((count, word) => count + (matchesMode(word.id, item, results) ? 1 : 0), 0)} 词</small>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {phase !== "phrases" && (
              <section className="panel-section">
                <h3>每日目标</h3>
                <div className="goal-row">
                  {[10, 20, 30, 50].map((item) => (
                    <button key={item} className={goal === item ? "active" : ""} onClick={() => updateGoal(item)}>{item} 词</button>
                  ))}
                </div>
              </section>
            )}

          </aside>
        </div>
      )}

      {!hydrated && <div className="loading-cover">正在读取词库…</div>}
    </main>
  );
}
