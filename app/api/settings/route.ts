import { requestHasAccess } from "../../lib/access";
import {
  GOAL_OPTIONS,
  LEARNING_PHASES,
  PRACTICE_MODES,
  type LearningSettings,
  type PhraseGroupFilter,
} from "../../lib/learning-types";
import { saveLearningSettings } from "../../lib/learning-store";

export const runtime = "nodejs";

const phraseGroups: PhraseGroupFilter[] = [
  "all",
  "get", "put", "turn", "look", "take", "go", "give", "keep", "set", "break",
  "in", "at", "on", "out", "up", "by", "as",
  "verb_other", "preposition_other", "noun_compound", "adjective_phrase", "daily_expression",
];

export async function PUT(request: Request) {
  if (!(await requestHasAccess(request))) {
    return Response.json({ error: "请先验证家庭访问码" }, { status: 401 });
  }

  let body: Partial<LearningSettings>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (
    typeof body.goal !== "number"
    || !GOAL_OPTIONS.some((goal) => goal === body.goal)
    || !body.mode
    || !PRACTICE_MODES.includes(body.mode)
    || !body.phase
    || !LEARNING_PHASES.includes(body.phase)
    || !body.phraseGroup
    || !phraseGroups.includes(body.phraseGroup)
  ) {
    return Response.json({ error: "学习设置不正确" }, { status: 400 });
  }

  try {
    saveLearningSettings(body as LearningSettings);
    return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to save learning settings", error);
    return Response.json({ error: "学习设置保存失败" }, { status: 500 });
  }
}
