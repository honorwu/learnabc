import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type DailyActivity,
  type LearningResult,
  type LearningSettings,
  type LearningSnapshot,
  type ResultStatus,
} from "./learning-types";
import { getScreeningWordIds } from "./vocabulary-store";

type ResultRow = {
  word_id: string;
  status: ResultStatus;
  attempts: number;
  updated_at: string;
};

type SettingsRow = {
  goal: number;
  mode: LearningSettings["mode"];
  phase: LearningSettings["phase"];
  phrase_group: LearningSettings["phraseGroup"];
};

type ActivityRow = {
  activity_date: string;
  word_id: string;
  status: ResultStatus;
  goal: number | null;
};

const globalDatabase = globalThis as typeof globalThis & {
  learnabcDatabase?: Database.Database;
};

function databasePath() {
  return process.env.LEARNING_DATABASE_PATH?.trim()
    || path.join(process.cwd(), "data", "learning.db");
}

function openDatabase() {
  if (globalDatabase.learnabcDatabase) return globalDatabase.learnabcDatabase;

  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const database = new Database(file);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("synchronous = NORMAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS word_results (
      word_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('known', 'unknown')),
      attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_activity (
      activity_date TEXT NOT NULL,
      word_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('known', 'unknown')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (activity_date, word_id)
    );

    CREATE TABLE IF NOT EXISTS daily_goals (
      activity_date TEXT PRIMARY KEY,
      goal INTEGER NOT NULL CHECK (goal > 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      goal INTEGER NOT NULL,
      mode TEXT NOT NULL,
      phase TEXT NOT NULL,
      phrase_group TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  database.prepare(`
    INSERT OR IGNORE INTO learning_settings
      (id, goal, mode, phase, phrase_group, updated_at)
    VALUES
      (1, @goal, @mode, @phase, @phraseGroup, @updatedAt)
  `).run({
    ...DEFAULT_SETTINGS,
    updatedAt: new Date().toISOString(),
  });
  database.pragma("optimize");

  globalDatabase.learnabcDatabase = database;
  return database;
}

export function getAppDay(date = new Date()) {
  const timeZone = process.env.APP_TIME_ZONE?.trim() || "Asia/Shanghai";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function getLearningSnapshot(): LearningSnapshot {
  const database = openDatabase();
  const screeningWordIds = getScreeningWordIds();
  const resultRows = database.prepare(`
    SELECT word_id, status, attempts, updated_at
    FROM word_results
  `).all() as ResultRow[];
  const settingsRow = database.prepare(`
    SELECT goal, mode, phase, phrase_group
    FROM learning_settings
    WHERE id = 1
  `).get() as SettingsRow | undefined;
  const activityRows = database.prepare(`
    SELECT
      activity.activity_date,
      activity.word_id,
      activity.status,
      goals.goal
    FROM daily_activity AS activity
    LEFT JOIN daily_goals AS goals
      ON goals.activity_date = activity.activity_date
    ORDER BY activity.activity_date
  `).all() as ActivityRow[];

  const results: Record<string, LearningResult> = {};
  for (const row of resultRows) {
    if (!screeningWordIds.has(row.word_id)) continue;
    results[row.word_id] = {
      status: row.status,
      attempts: row.attempts,
      updatedAt: row.updated_at,
    };
  }

  const dailyActivity: DailyActivity = {};
  for (const row of activityRows) {
    if (!screeningWordIds.has(row.word_id)) continue;
    const current = dailyActivity[row.activity_date] || {
      goal: row.goal || DEFAULT_SETTINGS.goal,
      words: {},
    };
    current.words[row.word_id] = row.status;
    dailyActivity[row.activity_date] = current;
  }

  return {
    results,
    settings: settingsRow ? {
      goal: settingsRow.goal,
      mode: settingsRow.mode,
      phase: settingsRow.phase,
      phraseGroup: settingsRow.phrase_group,
    } : DEFAULT_SETTINGS,
    dailyActivity,
    today: getAppDay(),
  };
}

export function recordWordResult(wordId: string, status: ResultStatus, goal: number) {
  if (!getScreeningWordIds().has(wordId)) throw new Error("Unknown vocabulary id");

  const database = openDatabase();
  const updatedAt = new Date().toISOString();
  const activityDate = getAppDay();
  const write = database.transaction(() => {
    const result = database.prepare(`
      INSERT INTO word_results (word_id, status, attempts, updated_at)
      VALUES (@wordId, @status, 1, @updatedAt)
      ON CONFLICT(word_id) DO UPDATE SET
        status = excluded.status,
        attempts = word_results.attempts + 1,
        updated_at = excluded.updated_at
      RETURNING word_id, status, attempts, updated_at
    `).get({ wordId, status, updatedAt }) as ResultRow;

    database.prepare(`
      INSERT INTO daily_activity (activity_date, word_id, status, updated_at)
      VALUES (@activityDate, @wordId, @status, @updatedAt)
      ON CONFLICT(activity_date, word_id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run({ activityDate, wordId, status, updatedAt });

    database.prepare(`
      INSERT INTO daily_goals (activity_date, goal, updated_at)
      VALUES (@activityDate, @goal, @updatedAt)
      ON CONFLICT(activity_date) DO UPDATE SET
        goal = excluded.goal,
        updated_at = excluded.updated_at
    `).run({ activityDate, goal, updatedAt });

    return result;
  });
  const result = write();

  return {
    day: activityDate,
    result: {
      status: result.status,
      attempts: result.attempts,
      updatedAt: result.updated_at,
    } satisfies LearningResult,
  };
}

export function saveLearningSettings(settings: LearningSettings) {
  const database = openDatabase();
  const updatedAt = new Date().toISOString();
  const write = database.transaction(() => {
    database.prepare(`
      UPDATE learning_settings
      SET goal = @goal,
          mode = @mode,
          phase = @phase,
          phrase_group = @phraseGroup,
          updated_at = @updatedAt
      WHERE id = 1
    `).run({ ...settings, updatedAt });
    database.prepare(`
      UPDATE daily_goals
      SET goal = @goal, updated_at = @updatedAt
      WHERE activity_date = @activityDate
    `).run({ goal: settings.goal, updatedAt, activityDate: getAppDay() });
  });
  write();
}
