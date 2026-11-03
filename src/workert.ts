
interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  ASSETS: Fetcher;
}

interface Message {
  role: "user" | "model";
  text: string;
}

interface RequestBody {
  message: string;
  summary?: string;
  history?: Message[];
}

const SYSTEM_PROMPT = `
あなたはGemini Chat Studioの専属AIアシスタントです。

【基本方針】
・日本語で自然かつ丁寧に回答する。
・質問の意図を正確に理解する。
・必要に応じて見出し、箇条書き、表を使う。
・専門的な内容は初心者にも理解できるよう説明する。
・不確かな情報は断定しない。
・質問に対して必要十分な回答をする。
・ユーザーとの過去の会話を踏まえて回答する。

【会話の継続】
・過去の会話の要約は重要な記憶として扱う。
・直近の会話内容と矛盾しないようにする。
・ユーザーが以前に指定した条件を可能な限り維持する。
・同じ質問を不必要に繰り返さない。

【安全性】
・危険、不正、違法な行為を助長しない。
・事実と推測を区別する。

あなたは単なる検索エンジンではなく、
ユーザーの継続的なパートナーとして振る舞ってください。
`;

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function callGemini(
  env: Env,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  maxOutputTokens: number
): Promise<string> {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash";

  const response = await fetch(
    `${API_BASE}${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();

    console.error("Gemini API error:", response.status, errorBody);

    if (response.status === 429) {
      throw new Error("APIの利用上限に達しました。しばらく待ってください。");
    }

    if (response.status === 400 || response.status === 404) {
      throw new Error("モデル名またはAPIリクエストを確認してください。");
    }

    if (response.status === 403) {
      throw new Error("APIキーまたはAPIの利用権限を確認してください。");
    }

    throw new Error("Gemini APIとの通信に失敗しました。");
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const result = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("");

  if (!result) {
    throw new Error("Geminiから回答を取得できませんでした。");
  }

  return result;
}

async function summarize(
  env: Env,
  oldSummary: string,
  oldMessages: Message[]
): Promise<string> {
  const historyText = oldMessages
    .map(m =>
      `${m.role === "user" ? "ユーザー" : "AI"}: ${m.text}`
    )
    .join("\n\n");

  const prompt = `
以下の会話を、今後の会話で利用するために要約してください。

【以前の要約】
${oldSummary || "なし"}

【今回要約する会話】
${historyText}

【要約ルール】
・ユーザーの目的や重要な背景を残す。
・ユーザーが指定した条件や好みを残す。
・進行中の作業や未解決の課題を残す。
・重要な数値、固有名詞、決定事項を残す。
・古い一時的な話題は優先度を下げる。
・事実と推測を混同しない。
・簡潔にまとめる。
・最大2500文字程度にする。

要約本文だけを返してください。
`;

  return callGemini(
    env,
    [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    "あなたは会話記憶を整理する要約エンジンです。重要情報を正確に保持してください。",
    1200
  );
}

async function handleChat(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "サーバーにAPIキーが設定されていません。" }, 500);
  }

  let body: RequestBody;

  try {
    body = await request.json() as RequestBody;
  } catch {
    return json({ error: "不正なJSONです。" }, 400);
  }

  if (
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.length > 20000
  ) {
    return json({ error: "メッセージが空、または長すぎます。" }, 400);
  }

  if (
    body.summary !== undefined &&
    (typeof body.summary !== "string" || body.summary.length > 12000)
  ) {
    return json({ error: "要約データが不正です。" }, 400);
  }

  if (
    body.history !== undefined &&
    (!Array.isArray(body.history) || body.history.length > 40)
  ) {
    return json({ error: "会話履歴が不正です。" }, 400);
  }

  let history: Message[] = (body.history || []).map((m) => {
    if (
      !m ||
      !["user", "model"].includes(m.role) ||
      typeof m.text !== "string" ||
      m.text.length > 20000
    ) {
      throw new Error("会話履歴に不正なデータがあります。");
    }

    return {
      role: m.role,
      text: m.text
    };
  });

  let summary = body.summary || "";
  let summarized = false;

  try {
    // 20メッセージを超えた場合、古い10件を要約
    if (history.length > 20) {
      const oldMessages = history.slice(0, 10);
      const recentMessages = history.slice(10);

      summary = await summarize(
        env,
        summary,
        oldMessages
      );

      history = recentMessages;
      summarized = true;
    }

    const memoryPrompt = summary
  ? `
【過去の会話の要約・長期記憶】
${summary}
`
  : "";

const contents = [
  ...history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  })),
  {
    role: "user",
    parts: [{ text: body.message }]
  }
];

const reply = await callGemini(
  env,
  contents,
  SYSTEM_PROMPT + "\n" + memoryPrompt,
  4096
);

    const nextContext = [
      ...history,
      {
        role: "user" as const,
        text: body.message
      },
      {
        role: "model" as const,
        text: reply
      }
    ];

    return json({
      reply,
      summary,
      context: nextContext,
      summarized
    });

  } catch (error) {
    console.error("Chat processing error:", error);

    return json({
      error: error instanceof Error
        ? error.message
        : "サーバー内部でエラーが発生しました。"
    }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return json({ error: "Method Not Allowed" }, 405);
      }

      return handleChat(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not Found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
