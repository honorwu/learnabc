import "server-only";

import Database from "better-sqlite3";
import path from "node:path";
import type { LearningPhase, PhraseGroup } from "./learning-types";
import type { VocabularySummaryEntry, WordEntry } from "./vocabulary";

type VocabularyRow = {
  id: string;
  word: string;
  lemma: string;
  letter: string;
  part_of_speech: string;
  phonetic: string;
  translation: string;
  definition_en: string;
  example_en: string;
  example_zh: string;
  related_words: string;
  phase: LearningPhase;
  phase_order: number;
  frequency: number;
  difficulty: string;
  priority_reason: string;
  source_scope: WordEntry["sourceScope"];
  oxford_core: 0 | 1;
  is_phrase: 0 | 1;
  phrase_head: string;
  phrase_group: PhraseGroup | "";
  legacy_pet_id: string;
};

type SummaryRow = {
  id: string;
  phase: LearningPhase;
  source_scope: WordEntry["sourceScope"];
};

const globalVocabulary = globalThis as typeof globalThis & {
  learnabcVocabularyDatabase?: Database.Database;
  learnabcScreeningWordIds?: Set<string>;
};

function vocabularyDatabasePath() {
  return process.env.VOCABULARY_DATABASE_PATH?.trim()
    || path.join(process.cwd(), "data", "vocabulary.db");
}

function openVocabularyDatabase() {
  if (globalVocabulary.learnabcVocabularyDatabase) {
    return globalVocabulary.learnabcVocabularyDatabase;
  }

  const database = new Database(vocabularyDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  });
  database.pragma("query_only = ON");
  database.pragma("busy_timeout = 5000");
  globalVocabulary.learnabcVocabularyDatabase = database;
  return database;
}

export function getVocabulary(): WordEntry[] {
  const rows = openVocabularyDatabase().prepare(`
    SELECT
      id, word, lemma, letter, part_of_speech, phonetic, translation,
      definition_en, example_en, example_zh, related_words, phase,
      phase_order, frequency, difficulty, priority_reason, source_scope,
      oxford_core, is_phrase, phrase_head, phrase_group, legacy_pet_id
    FROM vocabulary
    ORDER BY sort_order
  `).all() as VocabularyRow[];

  return rows.map((row) => ({
    id: row.id,
    word: row.word,
    lemma: row.lemma,
    letter: row.letter,
    pos: row.part_of_speech,
    phonetic: row.phonetic,
    translation: row.translation,
    definitionEn: row.definition_en,
    exampleEn: row.example_en,
    exampleZh: row.example_zh,
    relatedWords: row.related_words,
    phase: row.phase,
    phaseOrder: row.phase_order,
    frequency: row.frequency,
    difficulty: row.difficulty,
    priorityReason: row.priority_reason,
    sourceScope: row.source_scope,
    oxfordCore: row.oxford_core === 1,
    isPhrase: row.is_phrase === 1,
    phraseHead: row.phrase_head,
    phraseGroup: row.phrase_group,
    legacyPetId: row.legacy_pet_id,
  }));
}

export function getVocabularySummary(): VocabularySummaryEntry[] {
  const rows = openVocabularyDatabase().prepare(`
    SELECT id, phase, source_scope
    FROM vocabulary
    ORDER BY sort_order
  `).all() as SummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    phase: row.phase,
    sourceScope: row.source_scope,
  }));
}

export function getScreeningWordIds() {
  if (globalVocabulary.learnabcScreeningWordIds) {
    return globalVocabulary.learnabcScreeningWordIds;
  }

  const rows = openVocabularyDatabase().prepare(`
    SELECT id
    FROM vocabulary
    WHERE phase != 'phrases'
  `).all() as Array<{ id: string }>;
  const ids = new Set(rows.map((row) => row.id));
  globalVocabulary.learnabcScreeningWordIds = ids;
  return ids;
}
