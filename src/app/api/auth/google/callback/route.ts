import { NextRequest, NextResponse } from "next/server";
import db, { ensureSchema } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
};

function slugifyUsername(base: string) {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
  return cleaned || "user";
}

export async function GET(req: NextRequest) {
  await ensureSchema();

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = req.cookies.get("google_oauth_state")?.value;

  const loginUrl = new URL("/login", req.url);

  if (!code || !state || !savedState || state !== savedState) {
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    loginUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      loginUrl.searchParams.set("error", "google_auth_failed");
      return NextResponse.redirect(loginUrl);
    }

    const tokenData = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoRes.ok) {
      loginUrl.searchParams.set("error", "google_auth_failed");
      return NextResponse.redirect(loginUrl);
    }
    const userInfo: GoogleUserInfo = await userInfoRes.json();

    const existing = await db.execute({
      sql: "SELECT id, username FROM users WHERE google_id = ?",
      args: [userInfo.sub],
    });
    const existingUser = existing.rows[0] as unknown as { id: number; username: string } | undefined;

    let userId: number;
    let username: string;

    if (existingUser) {
      userId = existingUser.id;
      username = existingUser.username;
    } else {
      // Ensure a unique username derived from the Google email/name
      const base = slugifyUsername(userInfo.name ?? userInfo.email.split("@")[0]);
      let candidate = base;
      let suffix = 0;
      while (true) {
        const clash = await db.execute({
          sql: "SELECT id FROM users WHERE username = ?",
          args: [candidate],
        });
        if (clash.rows.length === 0) break;
        suffix += 1;
        candidate = `${base}${suffix}`;
      }

      const insertResult = await db.execute({
        sql: "INSERT INTO users (username, google_id, email) VALUES (?, ?, ?)",
        args: [candidate, userInfo.sub, userInfo.email],
      });
      userId = Number(insertResult.lastInsertRowid);
      username = candidate;
    }

    const token = await createSessionToken({ userId, username });
    await setSessionCookie(token);

    const res = NextResponse.redirect(new URL("/chat", req.url));
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (err) {
    console.error("Google OAuth error:", err);
    loginUrl.searchParams.set("error", "google_auth_failed");
    return NextResponse.redirect(loginUrl);
  }
}
