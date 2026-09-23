import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import test, { after, before } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const accessCode = "TEST-FAMILY-CODE";
let baseUrl;
let databasePath;
const vocabularyDatabasePath = path.join(projectRoot, "data/vocabulary.db");
let temporaryDirectory;
let serverProcess;
let serverOutput = "";

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next.js server did not start.\n${serverOutput}`);
}

async function login() {
  const response = await fetch(`${baseUrl}/api/access`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ code: accessCode }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /; Secure/);
  return setCookie.split(";", 1)[0];
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "learnabc-test-"));
  databasePath = path.join(temporaryDirectory, "learning.db");
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [path.join(projectRoot, ".next/standalone/server.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ACCESS_CODE: accessCode,
      APP_TIME_ZONE: "Asia/Shanghai",
      LEARNING_DATABASE_PATH: databasePath,
      VOCABULARY_DATABASE_PATH: vocabularyDatabasePath,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test("redirects unauthenticated visitors and renders the login page", async () => {
  const home = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/login");

  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /输入家庭访问码后继续/);
});

test("rejects an incorrect family access code", async () => {
  const response = await fetch(`${baseUrl}/api/access`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "incorrect" }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    authenticated: false,
    error: "访问码不正确",
  });
});

test("persists progress and settings in SQLite", async () => {
  const cookie = await login();
  const vocabularyDatabase = new Database(vocabularyDatabasePath, { readonly: true, fileMustExist: true });
  const word = vocabularyDatabase.prepare(`
    SELECT id, word
    FROM vocabulary
    WHERE phase != 'phrases'
    ORDER BY sort_order
    LIMIT 1
  `).get();
  const vocabularyTables = vocabularyDatabase.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
  vocabularyDatabase.close();
  assert.ok(word?.id);
  assert.deepEqual(vocabularyTables, ["vocabulary", "vocabulary_meta"]);

  const progress = await fetch(`${baseUrl}/api/progress`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ wordId: word.id, status: "known", goal: 20 }),
  });
  assert.equal(progress.status, 200);
  const savedProgress = await progress.json();
  assert.equal(savedProgress.result.status, "known");
  assert.equal(savedProgress.result.attempts, 1);

  const settings = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ goal: 30, mode: "unknown", phase: "growth", phraseGroup: "all" }),
  });
  assert.equal(settings.status, 200);

  const database = new Database(databasePath, { readonly: true });
  const resultRow = database.prepare("SELECT status, attempts FROM word_results WHERE word_id = ?").get(word.id);
  const activityRow = database.prepare("SELECT status FROM daily_activity WHERE word_id = ?").get(word.id);
  const settingsRow = database.prepare("SELECT goal, mode, phase FROM learning_settings WHERE id = 1").get();
  const learningTables = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
  database.close();

  assert.deepEqual(resultRow, { status: "known", attempts: 1 });
  assert.deepEqual(activityRow, { status: "known" });
  assert.deepEqual(settingsRow, { goal: 30, mode: "unknown", phase: "growth" });
  assert.deepEqual(learningTables, ["daily_activity", "daily_goals", "learning_settings", "word_results"]);

  const home = await fetch(`${baseUrl}/`, { headers: { cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), new RegExp(word.word, "i"));

  const admin = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
  assert.equal(admin.status, 200);
  const html = await admin.text();
  assert.match(html, /学习打卡日历/);
  assert.match(html, /记录保存在云主机数据库中/);
});
