"use client";

import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/access", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { authenticated?: boolean }) => {
        if (result.authenticated) window.location.replace("/");
      })
      .catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json() as { authenticated?: boolean; error?: string };
      if (response.ok && result.authenticated) {
        window.location.replace("/");
        return;
      }
      setError(result.error || "暂时无法验证，请稍后再试");
    } catch {
      setError("无法连接，请确认本地服务正在运行");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-card">
        <span className="brand-mark login-mark" aria-hidden="true">A·</span>
        <span className="eyebrow">PRIVATE SPACE</span>
        <h1>认词簿</h1>
        <p>输入家庭访问码后继续</p>
        <form onSubmit={submit}>
          <label htmlFor="access-code">家庭访问码</label>
          <input
            id="access-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoComplete="current-password"
            maxLength={64}
            placeholder="请输入访问码"
          />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" disabled={submitting || !code.trim()}>
            {submitting ? "正在验证…" : "进入认词簿"}
          </button>
        </form>
        <small>验证后将在本设备保持登录 30 天</small>
      </section>
    </main>
  );
}
