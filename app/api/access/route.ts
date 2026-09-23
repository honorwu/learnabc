import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE,
  createSessionToken,
  getAccessCode,
  verifyAccessCode,
  verifySessionToken,
} from "../../lib/access";

type AttemptWindow = { count: number; resetAt: number };

const attemptWindows = new Map<string, AttemptWindow>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const secret = getAccessCode();
  if (!secret) return json({ authenticated: false, error: "访问码尚未配置" }, 503);
  const token = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
  const authenticated = await verifySessionToken(token, secret);
  return json({ authenticated });
}

export async function POST(request: Request) {
  const secret = getAccessCode();
  if (!secret) return json({ authenticated: false, error: "访问码尚未配置" }, 503);

  const client = clientKey(request);
  const now = Date.now();
  const current = attemptWindows.get(client);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return json({ authenticated: false, error: "尝试次数过多，请稍后再试" }, 429, { "Retry-After": String(retryAfter) });
  }

  let code = "";
  try {
    const body = await request.json() as { code?: unknown };
    code = typeof body.code === "string" ? body.code.slice(0, 64) : "";
  } catch {
    return json({ authenticated: false, error: "请求格式不正确" }, 400);
  }

  if (!(await verifyAccessCode(code, secret))) {
    const window = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + WINDOW_MS }
      : { count: current.count + 1, resetAt: current.resetAt };
    attemptWindows.set(client, window);
    return json({ authenticated: false, error: "访问码不正确" }, 401);
  }

  attemptWindows.delete(client);
  const token = await createSessionToken(secret);
  const secure = secureCookieAttribute(request);
  return json(
    { authenticated: true },
    200,
    { "Set-Cookie": `${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ACCESS_MAX_AGE}${secure}` },
  );
}

export async function DELETE(request: Request) {
  const secure = secureCookieAttribute(request);
  return json(
    { authenticated: false },
    200,
    { "Set-Cookie": `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` },
  );
}

function secureCookieAttribute(request: Request): string {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:"
    ? "; Secure"
    : "";
}

function readCookie(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}
