import type { LearningPhase, PhraseGroup } from "./learning-types";

export type WordEntry = {
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

export type VocabularySummaryEntry = Pick<WordEntry, "id" | "phase" | "sourceScope">;
