"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ログインに失敗しました");
        return;
      }
      router.push("/chat");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold mb-1 text-center">ReinAI</h1>
        <p className="text-sm text-zinc-500 text-center mb-6">ログイン</p>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <label className="block text-sm font-medium mb-1">ユーザーID または メールアドレス</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full mb-4 rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black dark:focus:border-white"
        />

        <label className="block text-sm font-medium mb-1">パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-6 rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black dark:focus:border-white"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500">
          アカウントをお持ちでない方は{" "}
          <Link href="/register" className="font-medium underline">
            新規登録
          </Link>
        </p>
      </form>
    </div>
  );
}
