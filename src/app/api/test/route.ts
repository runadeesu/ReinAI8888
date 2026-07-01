import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    turso_url: process.env.TURSO_DATABASE_URL ? "set" : "NOT SET",
    turso_token: process.env.TURSO_AUTH_TOKEN ? "set" : "NOT SET",
    groq: process.env.GROQ_API_KEY ? "set" : "NOT SET",
    jwt: process.env.JWT_SECRET ? "set" : "NOT SET",
  });
}
