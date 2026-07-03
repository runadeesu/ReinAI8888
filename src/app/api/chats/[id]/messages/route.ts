import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

type ChatRow = { id: number; user_id: number };
type MessageRow = { role: "user" | "assistant"; content: string };

const TEXT_EXTENSIONS = [
  ".txt", ".md", ".csv", ".json", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".html", ".css", ".xml", ".yaml", ".yml",
];

function isTextFile(fileName: string) {
  return TEXT_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
}

function isImageFile(fileName: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(fileName);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chatResult = await db.execute({
    sql: "SELECT id, user_id FROM chats WHERE id = ?",
    args: [chatId],
  });
  const chat = chatResult.rows[0] as unknown as ChatRow | undefined;
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  const { content, fileName, fileData, fileType } = body as {
    content: string;
    fileName?: string;
    fileData?: string;
    fileType?: string;
  };

  if (typeof content !== "string") {
    return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
  }

  let storedContent = content.trim();
  if (fileType === "text" && fileName && fileData) {
    storedContent = `${content.trim()}\n\n【添付ファイル: ${fileName}】\n${fileData}`.trim();
  } else if (fileType === "image" && fileName) {
    storedContent = `${content.trim()}${content.trim() ? "\n" : ""}【画像添付: ${fileName}】`.trim();
  }
  if (!storedContent) {
    return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
  }

  await db.execute({
    sql: "INSERT INTO messages (chat_id, role, content) VALUES (?, 'user', ?)",
    args: [chatId, storedContent],
  });

  const titleResult = await db.execute({
    sql: "SELECT title FROM chats WHERE id = ?",
    args: [chatId],
  });
  const titleRow = titleResult.rows[0] as unknown as { title: string };
  if (titleRow.title === "新しいチャット") {
    const newTitle = (content.trim() || fileName || "ファイル").slice(0, 30);
    await db.execute({ sql: "UPDATE chats SET title = ? WHERE id = ?", args: [newTitle, chatId] });
  }

  const historyResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC",
    args: [chatId],
  });
  const history = historyResult.rows as unknown as MessageRow[];

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY が設定されていません" }, { status: 500 });
  }

  const systemMessage = {
    role: "system",
    content: `あなたはReinAIというコード作成専門のAIアシスタントです。\nプログラミングの質問に答え、質の高いコードを生成することが得意です。\n\n【コードブロックのルール】\n- コードを書くときは必ずコードブロック(\`\`\`言語名)を使う\n- コードブロックの1行目に必ずファイル名をコメントで記載する\n  例: # main.py / // index.js / <!-- index.html --> / /* style.css */ / REM run.bat / # script.ps1\n- 複数ファイルが必要なプロジェクトはすべてのファイルを順番に提供する\n\n【実行可能ファイルについて】\n- Windowsで直接実行したい場合 → .bat または .ps1 スクリプトを提供\n- .exe が必要な場合 → PythonはPyInstaller、GoやRustは直接コンパイル可能なソースコードを提供し、コンパイル手順も説明する\n- .sh はLinux/macOSで実行可能なシェルスクリプトを提供\n\n【絶対に守るルール】\n- コードは必ず最初から最後まで完全に出力する\n- 「省略」「...」「// 残りは同じ」「// 以下略」などは絶対に使わない\n- どんなに長くても必ず全部書ききる\n- 修正が必要な場合もファイル全体を出力する\n\n【PC操作（コマンド実行）について】
- ユーザーがコマンドの実行やファイル操作の代行を求めた場合は、\`\`\`exec というコードブロックでコマンドを1つだけ書く
  例:
  \`\`\`exec
  npm install express
  \`\`\`
- execブロックは実行可能な1つのシェルコマンド/PowerShellコマンドのみを書く。説明文はブロックの外に書く
- execブロックはユーザーのPC上でユーザー自身が「実行」ボタンを押した場合のみ実行される。危険な操作（削除・フォーマット等）を提案する場合は必ず事前にリスクを説明する
- execブロックは1回の返答につき基本的に1つまで

日本語・英語どちらの質問にも対応します。`,
  };

  const pastMessages = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

  let currentUserMessage: object;
  if (fileType === "image" && fileData) {
    const mimeType = /\.png$/i.test(fileName ?? "") ? "image/png"
      : /\.gif$/i.test(fileName ?? "") ? "image/gif"
      : /\.webp$/i.test(fileName ?? "") ? "image/webp"
      : "image/jpeg";
    currentUserMessage = {
      role: "user",
      content: [
        ...(content.trim() ? [{ type: "text", text: content.trim() }] : []),
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileData}` } },
      ],
    };
  } else {
    currentUserMessage = { role: "user", content: storedContent };
  }

  const model = fileType === "image"
    ? "meta-llama/llama-4-scout-17b-16e-instruct"
    : "llama-3.3-70b-versatile";

  let assistantText: string;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...pastMessages, currentUserMessage],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq API error:", res.status, errText);
      return NextResponse.json({ error: "AIからの応答取得に失敗しました" }, { status: 502 });
    }

    const data = await res.json();
    assistantText = data.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("Groq API request failed:", err);
    return NextResponse.json({ error: "AIからの応答取得に失敗しました" }, { status: 502 });
  }

  await db.execute({
    sql: "INSERT INTO messages (chat_id, role, content) VALUES (?, 'assistant', ?)",
    args: [chatId, assistantText],
  });

  return NextResponse.json({ reply: assistantText });
}