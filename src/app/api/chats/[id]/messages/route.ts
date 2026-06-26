import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";

type ChatRow = { id: number; user_id: number };
type MessageRow = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = Number(id);
  const chat = db.prepare("SELECT id, user_id FROM chats WHERE id = ?").get(chatId) as ChatRow | undefined;
  if (!chat || chat.user_id !== session.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { content } = await req.json();
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
  }

  db.prepare("INSERT INTO messages (chat_id, role, content) VALUES (?, 'user', ?)").run(chatId, content);

  const titleRow = db.prepare("SELECT title FROM chats WHERE id = ?").get(chatId) as { title: string };
  if (titleRow.title === "新しいチャット") {
    const newTitle = content.trim().slice(0, 30);
    db.prepare("UPDATE chats SET title = ? WHERE id = ?").run(newTitle, chatId);
  }

  const history = db
    .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC")
    .all(chatId) as MessageRow[];

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY が設定されていません" }, { status: 500 });
  }

  let assistantText: string;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "あなたはReinAIという親切なAIアシスタントです。日本語で分かりやすく答えてください。" },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
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

  db.prepare("INSERT INTO messages (chat_id, role, content) VALUES (?, 'assistant', ?)").run(
    chatId,
    assistantText
  );

  return NextResponse.json({ reply: assistantText });
}
