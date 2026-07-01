"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Chat = { id: number; title: string; created_at: string };
type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  imagePreview?: string;
};
type AttachedFile = {
  name: string;
  type: "image" | "text";
  data: string;
  preview?: string;
};
type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; lang: string; code: string; filename: string };

const TEXT_EXTENSIONS = [
  ".txt", ".md", ".csv", ".json", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".html", ".css",
  ".xml", ".yaml", ".yml",
];

function detectFileType(name: string): "image" | "text" | null {
  if (/\.(jpe?g|png|gif|webp)$/i.test(name)) return "image";
  if (TEXT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) return "text";
  return null;
}

const LANG_EXT: Record<string, string> = {
  python: "py", javascript: "js", typescript: "ts", html: "html",
  css: "css", bash: "sh", shell: "sh", sh: "sh", go: "go", rust: "rs",
  java: "java", c: "c", cpp: "cpp", csharp: "cs", cs: "cs",
  powershell: "ps1", ps1: "ps1", batch: "bat", bat: "bat",
  sql: "sql", yaml: "yml", yml: "yml", json: "json", rb: "rb",
  ruby: "rb", php: "php", swift: "swift", kotlin: "kt",
};

function extractFilename(code: string, lang: string): string {
  const first = code.split("\n")[0].trim();
  const m = first.match(/^(?:\/\/|#|REM|::|\/\*|<!--)\s*([\w. -]+\.[\w]+)/i);
  if (m) return m[1].trim();
  const ext = LANG_EXT[lang.toLowerCase()];
  return ext ? `code.${ext}` : "code.txt";
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      blocks.push({ kind: "text", text: content.slice(last, match.index) });
    }
    const lang = match[1] || "text";
    const code = match[2];
    const filename = extractFilename(code, lang);
    blocks.push({ kind: "code", lang, code, filename });
    last = re.lastIndex;
  }
  if (last < content.length) {
    blocks.push({ kind: "text", text: content.slice(last) });
  }
  return blocks;
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip(files: { filename: string; code: string }[]) {
  const { zipSync, strToU8 } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    // avoid duplicate names
    let name = f.filename;
    let i = 1;
    while (entries[name]) name = `${i++}_${f.filename}`;
    entries[name] = strToU8(f.code);
  }
  const zipped = zipSync(entries);
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reinai_files.zip";
  a.click();
  URL.revokeObjectURL(url);
}

function CodeBlock({ lang, code, filename }: { lang: string; code: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-zinc-900 dark:bg-zinc-950 text-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 dark:bg-zinc-900 text-zinc-300 text-xs">
        <span className="font-mono font-medium">{filename}</span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="hover:text-white transition-colors"
            title="コピー"
          >
            {copied ? "✓ コピー済み" : "コピー"}
          </button>
          <button
            onClick={() => downloadFile(filename, code)}
            className="hover:text-white transition-colors"
            title="ダウンロード"
          >
            ↓ DL
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-zinc-100 font-mono leading-relaxed">
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  const codeBlocks = blocks.filter((b): b is Extract<Block, { kind: "code" }> => b.kind === "code");

  return (
    <div className="max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm bg-zinc-100 dark:bg-zinc-800 text-foreground">
      {blocks.map((b, i) =>
        b.kind === "text" ? (
          <span key={i} className="whitespace-pre-wrap break-words">{b.text}</span>
        ) : (
          <CodeBlock key={i} lang={b.lang} code={b.code} filename={b.filename} />
        )
      )}
      {codeBlocks.length >= 2 && (
        <button
          onClick={() => downloadZip(codeBlocks.map((b) => ({ filename: b.filename, code: b.code })))}
          className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          すべてZIPでダウンロード ({codeBlocks.length}ファイル)
        </button>
      )}
    </div>
  );
}

export default function ChatApp({ username }: { username: string }) {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data.chats ?? []);
    return data.chats as Chat[];
  }, []);

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
      if (loaded?.length > 0) setActiveChatId(loaded[0].id);
    });
  }, [loadChats]);

  useEffect(() => {
    if (activeChatId !== null) loadMessages(activeChatId);
    else setMessages([]);
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

  async function handleDeleteChat(chatId: number) {
    if (!confirm("このチャットを削除しますか？")) return;
    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    const loaded = await loadChats();
    if (activeChatId === chatId) setActiveChatId(loaded.length > 0 ? loaded[0].id : null);
  }

  async function handleDeleteAllChats() {
    if (!confirm("すべてのチャット履歴を削除しますか？この操作は取り消せません。")) return;
    await fetch("/api/chats", { method: "DELETE" });
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    const fileType = detectFileType(file.name);
    if (!fileType) {
      setFileError("対応していないファイル形式です（画像・テキストファイルのみ）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("ファイルサイズは10MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    if (fileType === "image") {
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedFile({ name: file.name, type: "image", data: dataUrl.split(",")[1], preview: dataUrl });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (ev) => {
        setAttachedFile({ name: file.name, type: "text", data: ev.target?.result as string });
      };
      reader.readAsText(file);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && !attachedFile) || sending) return;

    let chatId = activeChatId;
    if (chatId === null) {
      const res = await fetch("/api/chats", { method: "POST" });
      const data = await res.json();
      chatId = data.id;
      setActiveChatId(chatId);
      await loadChats();
    }

    const content = input.trim();
    const file = attachedFile;
    setInput("");
    setAttachedFile(null);
    setFileError(null);

    const optimisticContent = file
      ? `${content}${content ? "\n" : ""}${file.type === "image" ? `【画像添付: ${file.name}】` : `【ファイル添付: ${file.name}】`}`
      : content;

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content: optimisticContent, created_at: new Date().toISOString(), imagePreview: file?.preview },
    ]);
    setSending(true);

    try {
      const body: Record<string, string> = { content };
      if (file) { body.fileName = file.name; body.fileData = file.data; body.fileType = file.type; }

      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: res.ok ? data.reply : `エラー: ${data.error}`,
          created_at: new Date().toISOString(),
        },
      ]);
      await loadChats();
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
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
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
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-zinc-400 hover:text-foreground p-1">✕</button>
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
                chat.id === activeChatId ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
              }`}
              onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false); }}
            >
              <span className="truncate">{chat.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-400 hover:text-red-500 text-xs px-1 shrink-0"
                title="削除"
              >✕</button>
            </div>
          ))}
        </div>
        {chats.length > 0 && (
          <button
            onClick={handleDeleteAllChats}
            className="mx-3 mb-1 rounded-full border border-red-200 dark:border-red-900 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            履歴をすべて削除
          </button>
        )}
        <button
          onClick={handleLogout}
          className="m-3 mt-1 rounded-full border border-black/15 dark:border-white/15 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          ログアウト
        </button>
      </aside>

      <main className="flex flex-1 flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 border-b border-black/10 dark:border-white/10 px-3 py-2.5 bg-white dark:bg-zinc-900">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-1 text-foreground" aria-label="メニューを開く">
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
            <div className="text-center text-zinc-400 text-sm mt-20 space-y-2">
              <p className="text-base font-medium text-zinc-500">ReinAI コードアシスタント</p>
              <p>コードの作成・修正・説明など何でも聞いてください</p>
              <p className="text-xs">ファイル添付・ZIP/スクリプトダウンロード対応</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words bg-foreground text-background">
                    {m.imagePreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imagePreview} alt="添付画像" className="rounded-lg mb-2 max-w-full max-h-60 object-contain" />
                    )}
                    {m.content}
                  </div>
                ) : (
                  <AssistantMessage content={m.content} />
                )}
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

        <div className="border-t border-black/10 dark:border-white/10 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-3xl w-full mx-auto">
          {attachedFile && (
            <div className="flex items-center gap-2 px-3 pt-2">
              {attachedFile.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachedFile.preview} alt={attachedFile.name} className="h-12 w-12 rounded-lg object-cover border border-black/10 dark:border-white/10" />
              ) : (
                <div className="h-12 w-12 rounded-lg border border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 font-mono">
                  {attachedFile.name.split(".").pop()?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-zinc-500 truncate max-w-[200px]">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="ml-auto text-zinc-400 hover:text-red-500 text-xs shrink-0" title="外す">✕</button>
            </div>
          )}
          {fileError && <p className="px-4 pt-1.5 text-xs text-red-500">{fileError}</p>}
          <form onSubmit={handleSend} className="flex gap-2 p-3 sm:p-4 pt-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.html,.css,.xml,.yaml,.yml"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-black/15 dark:border-white/15 p-2.5 text-zinc-500 hover:text-foreground hover:border-black/30 dark:hover:border-white/30 shrink-0"
              title="ファイルを添付"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="コードについて質問してください… (Shift+Enterで改行)"
              rows={1}
              className="flex-1 min-w-0 rounded-2xl border border-black/15 dark:border-white/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-black dark:focus:border-white resize-none overflow-hidden"
              style={{ minHeight: "42px", maxHeight: "160px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
            />
            <button
              type="submit"
              disabled={sending || (!input.trim() && !attachedFile)}
              className="rounded-full bg-foreground text-background px-4 sm:px-5 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
            >
              送信
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
