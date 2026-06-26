"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Chat = { id: number; title: string; created_at: string };
type Message = { id: number; role: "user" | "assistant"; content: string; created_at: string };

export default function ChatApp({ username }: { username: string }) {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadChats() {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data.chats ?? []);
    return data.chats as Chat[];
  }

  async function loadMessages(chatId: number) {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    loadChats().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setActiveChatId(loaded[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (activeChatId !== null) {
      loadMessages(activeChatId);
    } else {
      setMessages([]);
    }
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewChat() {
    const res = await fetch("/api/chats", { method: "POST" });
    const data = await res.json();
    await loadChats();
    setActiveChatId(data.id);
    setSidebarOpen(false);
  }

  async function handleSelectChat(chatId: number) {
    setActiveChatId(chatId);
    setSidebarOpen(false);
  }

  async function handleDeleteChat(chatId: number) {
    if (!confirm("このチャットを削除しますか？")) return;
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    const loaded = await loadChats();
    if (activeChatId === chatId) {
      setActiveChatId(loaded.length > 0 ? loaded[0].id : null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    let chatId = activeChatId;
    if (chatId === null) {
      const res = await fetch("/api/chats", { method: "POST" });
      const data = await res.json();
      chatId = data.id;
      setActiveChatId(chatId);
      await loadChats();
    }

    const content = input;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content, created_at: new Date().toISOString() },
    ]);
    setSending(true);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "assistant", content: data.reply, created_at: new Date().toISOString() },
        ]);
        await loadChats();
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "assistant", content: `エラー: ${data.error}`, created_at: new Date().toISOString() },
        ]);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative flex flex-1 h-[100dvh] overflow-hidden bg-zinc-50 dark:bg-black">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 max-w-[85vw] md:w-64 md:max-w-none flex flex-col border-r border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">ReinAI</h1>
            <p className="text-xs text-zinc-500 truncate">{username}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-zinc-400 hover:text-foreground p-1"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <button
          onClick={handleNewChat}
          className="m-3 rounded-full bg-foreground text-background py-2 text-sm font-medium hover:opacity-90"
        >
          + 新しいチャット
        </button>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer ${
                chat.id === activeChatId
                  ? "bg-zinc-200 dark:bg-zinc-800"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              }`}
              onClick={() => handleSelectChat(chat.id)}
            >
              <span className="truncate">{chat.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-400 hover:text-red-500 text-xs px-1 shrink-0"
                title="削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="m-3 rounded-full border border-black/15 dark:border-white/15 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          ログアウト
        </button>
      </aside>

      <main className="flex flex-1 flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 border-b border-black/10 dark:border-white/10 px-3 py-2.5 bg-white dark:bg-zinc-900">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 text-foreground"
            aria-label="メニューを開く"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-semibold">ReinAI</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-3xl w-full mx-auto">
          {loadingMessages ? (
            <p className="text-center text-zinc-400 text-sm">読み込み中...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-zinc-400 text-sm mt-20">ReinAIにメッセージを送ってみましょう</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-foreground text-background"
                      : "bg-zinc-100 dark:bg-zinc-800 text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                ReinAIが入力中...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-black/10 dark:border-white/10 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-w-3xl w-full mx-auto flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="メッセージを入力..."
            className="flex-1 min-w-0 rounded-full border border-black/15 dark:border-white/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-black dark:focus:border-white"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-foreground text-background px-4 sm:px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            送信
          </button>
        </form>
      </main>
    </div>
  );
}
