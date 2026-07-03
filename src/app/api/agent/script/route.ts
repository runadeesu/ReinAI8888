import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  const script = `#!/usr/bin/env node
/**
 * ReinAI PC連携エージェント
 *
 * 使い方:
 *   node reinai-agent.js <あなたのトークン>
 *
 * 初回実行時にトークンを ~/.reinai-agent.json に保存します。
 * 以降は "node reinai-agent.js" だけで起動できます。
 *
 * 【重要】このスクリプトは ReinAI のチャットで「実行」ボタンが押された
 * コマンドをこのPC上で実際に実行します。信頼できる自分のアカウントの
 * トークンのみを使用し、トークンを他人と共有しないでください。
 */
const https = require("https");
const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SERVER_ORIGIN = ${JSON.stringify(origin)};
const CONFIG_PATH = path.join(os.homedir(), ".reinai-agent.json");
const POLL_INTERVAL_MS = 2000;
const COMMAND_TIMEOUT_MS = 60000;

function loadToken() {
  const argToken = process.argv[2];
  if (argToken) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token: argToken }));
    return argToken;
  }
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (data.token) return data.token;
    } catch {}
  }
  console.error("トークンが見つかりません。初回は次のように実行してください:");
  console.error("  node reinai-agent.js <トークン>");
  process.exit(1);
}

const TOKEN = loadToken();

function request(pathName, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, SERVER_ORIGIN);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          Authorization: \`Bearer \${TOKEN}\`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode, body: null });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = (stdout || "") + (stderr ? "\\n" + stderr : "");
      resolve({ output: output.slice(0, 50000), exitCode: err ? (err.code ?? 1) : 0 });
    });
  });
}

async function pollOnce() {
  const res = await request("/api/agent/poll", "GET");
  if (res.status !== 200) {
    console.error("[ReinAI Agent] 認証エラー。トークンを確認してください。 status=" + res.status);
    return;
  }
  const command = res.body?.command;
  if (!command) return;

  console.log(\`[ReinAI Agent] コマンドを実行します: \${command.command}\`);
  const result = await runCommand(command.command);
  console.log(\`[ReinAI Agent] 終了コード: \${result.exitCode}\`);
  console.log(result.output);

  await request(\`/api/agent/commands/\${command.id}/result\`, "POST", result);
}

console.log(\`[ReinAI Agent] 起動しました。サーバー: \${SERVER_ORIGIN}\`);
console.log("[ReinAI Agent] チャットで「実行」ボタンが押されるのを待機しています...");

setInterval(() => {
  pollOnce().catch((err) => console.error("[ReinAI Agent] エラー:", err.message));
}, POLL_INTERVAL_MS);
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": "attachment; filename=reinai-agent.js",
    },
  });
}
