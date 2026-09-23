export type ResultStatus = "known" | "unknown";
export type PracticeMode = "untested" | "unknown" | "all";
export type LearningPhase = "core" | "growth" | "extension" | "phrases";
export type PhraseGroup =
  | "get" | "put" | "turn" | "look" | "take" | "go" | "give" | "keep" | "set" | "break"
  | "in" | "at" | "on" | "out" | "up" | "by" | "as"
  | "verb_other" | "preposition_other" | "noun_compound" | "adjective_phrase" | "daily_expression";
export type PhraseGroupFilter = "all" | PhraseGroup;

export type LearningResult = {
  status: ResultStatus;
  attempts: number;
  updatedAt: string;
};

export type LearningSettings = {
  goal: number;
  mode: PracticeMode;
  phase: LearningPhase;
  phraseGroup: PhraseGroupFilter;
};

export type DailyActivity = Record<string, {
  goal: number;
  words: Record<string, ResultStatus>;
}>;

export type LearningSnapshot = {
  results: Record<string, LearningResult>;
  settings: LearningSettings;
  dailyActivity: DailyActivity;
  today: string;
};

export const DEFAULT_SETTINGS: LearningSettings = {
  goal: 20,
  mode: "untested",
  phase: "core",
  phraseGroup: "all",
};

export const GOAL_OPTIONS = [10, 20, 30, 50] as const;
export const PRACTICE_MODES: PracticeMode[] = ["untested", "unknown", "all"];
export const LEARNING_PHASES: LearningPhase[] = ["core", "growth", "extension", "phrases"];
