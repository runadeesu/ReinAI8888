# ReinAI

Next.js で作られたチャットAIサイト。ログイン・新規登録・自動ログイン・チャット保存・チャット履歴削除・Groq APIによるAI応答を備えています。

## ローカル開発

```bash
npm install
npm run dev
```

`.env` に以下を設定してください（`.env.example` 参照）。

```
GROQ_API_KEY=...
JWT_SECRET=...
```

`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` を未設定のままにすると、`data/reinai.db` というローカルSQLiteファイルが自動的に使われます（開発用）。

## 本番デプロイ（Vercel + Turso）

Vercel のようなサーバーレス環境はファイルシステムが永続化されないため、本番では [Turso](https://turso.tech)（libSQL）を使います。

### 1. Tursoデータベースを作成

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup   # または turso auth login
turso db create reinai
turso db show reinai --url        # → TURSO_DATABASE_URL
turso db tokens create reinai     # → TURSO_AUTH_TOKEN
```

### 2. Vercelにデプロイ

```bash
npm i -g vercel
vercel
```

Vercel のプロジェクト設定（Environment Variables）に以下を追加してください。

| Key | Value |
|---|---|
| `GROQ_API_KEY` | Groq APIキー |
| `JWT_SECRET` | ランダムな長い文字列 |
| `TURSO_DATABASE_URL` | `turso db show` で取得したURL |
| `TURSO_AUTH_TOKEN` | `turso db tokens create` で取得したトークン |

設定後、`vercel --prod` で本番デプロイします。
