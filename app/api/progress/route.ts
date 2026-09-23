import { requestHasAccess } from "../../lib/access";
import { GOAL_OPTIONS, type ResultStatus } from "../../lib/learning-types";
import { recordWordResult } from "../../lib/learning-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requestHasAccess(request))) {
    return Response.json({ error: "请先验证家庭访问码" }, { status: 401 });
  }

  let body: { wordId?: unknown; status?: unknown; goal?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (typeof body.wordId !== "string" || body.wordId.length > 64) {
    return Response.json({ error: "单词编号不正确" }, { status: 400 });
  }
  if (body.status !== "known" && body.status !== "unknown") {
    return Response.json({ error: "判断结果不正确" }, { status: 400 });
  }
  if (typeof body.goal !== "number" || !GOAL_OPTIONS.some((goal) => goal === body.goal)) {
    return Response.json({ error: "每日目标不正确" }, { status: 400 });
  }

  try {
    const saved = recordWordResult(body.wordId, body.status as ResultStatus, body.goal);
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unknown vocabulary id") {
      return Response.json({ error: "词库中不存在这个单词" }, { status: 400 });
    }
    console.error("Failed to save learning progress", error);
    return Response.json({ error: "学习记录保存失败" }, { status: 500 });
  }
}
