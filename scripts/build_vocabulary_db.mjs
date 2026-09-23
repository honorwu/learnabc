import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "app", "data", "vocabulary.json");
const outputPath = process.env.VOCABULARY_DATABASE_PATH?.trim()
  || path.join(projectRoot, "data", "vocabulary.db");
const temporaryPath = `${outputPath}.tmp-${process.pid}`;

const sourceBuffer = readFileSync(sourcePath);
const sourceChecksum = createHash("sha256").update(sourceBuffer).digest("hex");
const vocabulary = JSON.parse(sourceBuffer.toString("utf8"));

if (!Array.isArray(vocabulary) || vocabulary.length === 0) {
  throw new Error("Vocabulary source must be a non-empty JSON array");
}

const previousWords = new Map();
if (existsSync(outputPath)) {
  try {
    const previous = new Database(outputPath, { readonly: true, fileMustExist: true });
    for (const row of previous.prepare("SELECT id, word FROM vocabulary").all()) {
      previousWords.set(row.id, row.word);
    }
    previous.close();
  } catch {
    // A broken generated database can be safely replaced from the JSON source.
  }
}

mkdirSync(path.dirname(outputPath), { recursive: true });
rmSync(temporaryPath, { force: true });

const database = new Database(temporaryPath);
database.pragma("journal_mode = DELETE");
database.pragma("synchronous = FULL");
database.exec(`
  CREATE TABLE vocabulary_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE vocabulary (
    id TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    lemma TEXT NOT NULL,
    letter TEXT NOT NULL,
    part_of_speech TEXT NOT NULL,
    phonetic TEXT NOT NULL,
    translation TEXT NOT NULL,
    definition_en TEXT NOT NULL,
    example_en TEXT NOT NULL,
    example_zh TEXT NOT NULL,
    related_words TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('core', 'growth', 'extension', 'phrases')),
    phase_order INTEGER NOT NULL,
    frequency REAL NOT NULL,
    difficulty TEXT NOT NULL,
    priority_reason TEXT NOT NULL,
    source_scope TEXT NOT NULL CHECK (source_scope IN ('PET', '小托福', 'PET+小托福')),
    oxford_core INTEGER NOT NULL CHECK (oxford_core IN (0, 1)),
    is_phrase INTEGER NOT NULL CHECK (is_phrase IN (0, 1)),
    phrase_head TEXT NOT NULL,
    phrase_group TEXT NOT NULL,
    legacy_pet_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE
  ) WITHOUT ROWID;

  CREATE INDEX idx_vocabulary_phase_order
  ON vocabulary (phase, phase_order);

  CREATE INDEX idx_vocabulary_phrase_group_order
  ON vocabulary (phrase_group, phase_order)
  WHERE is_phrase = 1;

  CREATE INDEX idx_vocabulary_source_scope
  ON vocabulary (source_scope);
`);

const insertWord = database.prepare(`
  INSERT INTO vocabulary (
    id, word, lemma, letter, part_of_speech, phonetic, translation,
    definition_en, example_en, example_zh, related_words, phase, phase_order,
    frequency, difficulty, priority_reason, source_scope, oxford_core,
    is_phrase, phrase_head, phrase_group, legacy_pet_id, sort_order
  ) VALUES (
    @id, @word, @lemma, @letter, @pos, @phonetic, @translation,
    @definitionEn, @exampleEn, @exampleZh, @relatedWords, @phase, @phaseOrder,
    @frequency, @difficulty, @priorityReason, @sourceScope, @oxfordCore,
    @isPhrase, @phraseHead, @phraseGroup, @legacyPetId, @sortOrder
  )
`);
const insertMeta = database.prepare("INSERT INTO vocabulary_meta (key, value) VALUES (?, ?)");

database.transaction(() => {
  vocabulary.forEach((word, index) => {
    insertWord.run({
      ...word,
      phaseOrder: word.phaseOrder ?? index + 1,
      oxfordCore: word.oxfordCore ? 1 : 0,
      isPhrase: word.isPhrase ? 1 : 0,
      sortOrder: index + 1,
    });
  });
  insertMeta.run("schema_version", "1");
  insertMeta.run("source_checksum", sourceChecksum);
  insertMeta.run("generated_at", new Date().toISOString());
  insertMeta.run("word_count", String(vocabulary.length));
})();

database.pragma("user_version = 1");
database.pragma("optimize");
database.close();

renameSync(temporaryPath, outputPath);
chmodSync(outputPath, 0o444);

const nextIds = new Set(vocabulary.map((word) => word.id));
const retained = [...previousWords.keys()].filter((id) => nextIds.has(id)).length;
const added = vocabulary.length - retained;
const removed = [...previousWords.keys()].filter((id) => !nextIds.has(id));

console.log(JSON.stringify({
  output: outputPath,
  words: vocabulary.length,
  checksum: sourceChecksum.slice(0, 12),
  compatibility: {
    previous: previousWords.size,
    retained,
    added,
    removed: removed.length,
    removedIds: removed.slice(0, 20),
  },
}, null, 2));
