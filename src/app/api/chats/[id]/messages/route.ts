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
    fileData?: string; // base64 for images, plain text for text files
    fileType?: string; // "image" | "text"
  };

  if (typeof content !== "string") {
    return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
  }

  // Build what gets stored in DB for this user turn
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

  // Build Groq messages
  const systemMessage = {
    role: "system",
    content: "あなたはReinAIという親切なAIアシスタントです。日本語で分かりやすく答えてください。",
  };

  // For all past messages except the last one, use plain text
  const pastMessages = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

  // For the current user message, optionally include image
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
