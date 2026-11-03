
interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
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
・日本語で自然かつ丁寧に回答してください。
・ユーザーの質問の意図を正確に理解してください。
・必要に応じて見出しや箇条書きを使ってください。
・初心者にも分かりやすく説明してください。
・不確かな情報は断定しないでください。
・回答は質問に対して必要十分な長さにしてください。

【会話の継続】
・過去の会話の要約を重要な記憶として扱ってください。
・直近の会話内容を踏まえて回答してください。
・以前指定された条件や希望を可能な限り維持してください。
・同じ質問を不必要に繰り返さないでください。

【安全性】
・危険な行為や不正行為を助長しないでください。
・事実と推測を区別してください。

ユーザーの継続的なパートナーとして振る舞ってください。
`;

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

function json(
  data: unknown,
  status = 200
): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function callGemini(
  env: Env,
  contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }>,
  systemInstruction: string,
  maxOutputTokens: number
): Promise<string> {

  const model =
    env.GEMINI_MODEL || "gemini-3.5-flash";

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
          parts: [
            { text: systemInstruction }
          ]
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
    const errorText = await response.text();

    console.error(
      "Gemini API Error:",
      response.status,
      errorText
    );

    if (response.status === 429) {
      throw new Error(
        "APIの利用上限に達しました。しばらく待ってから再試行してください。"
      );
    }

    if (response.status === 403) {
      throw new Error(
        "APIキーまたはAPIの利用権限を確認してください。"
      );
    }

    if (response.status === 400 || response.status === 404) {
      throw new Error(
        "モデル名またはAPIリクエストが正しくありません。"
      );
    }

    throw new Error(
      "Gemini APIとの通信に失敗しました。"
    );
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const result =
    data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("");

  if (!result) {
    throw new Error(
      "Geminiから回答を取得できませんでした。"
    );
  }

  return result;
}

async function summarize(
  env: Env,
  oldSummary: string,
  oldMessages: Message[]
): Promise<string> {

  const conversation = oldMessages
    .map(message => {
      const role =
        message.role === "user" ? "ユーザー" : "AI";

      return `${role}: ${message.text}`;
    })
    .join("\n\n");

  const prompt = `
以下の会話を今後の会話で利用するために要約してください。

【以前の要約】
${oldSummary || "なし"}

【今回の会話】
${conversation}

【要約ルール】
・ユーザーの目的を残す。
・重要な背景情報を残す。
・ユーザーの希望や指定条件を残す。
・重要な数値や決定事項を残す。
・進行中の作業や未解決の問題を残す。
・古い一時的な話題は優先度を下げる。
・事実と推測を区別する。
・最大2500文字程度にまとめる。

要約本文のみを返してください。
`;

  return callGemini(
    env,

    [
      {
        role: "user",
        parts: [
          { text: prompt }
        ]
      }
    ],

    "あなたは会話記憶を整理する要約エンジンです。重要情報を正確に保持してください。",

    1200
  );
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {

  const { request, env } = context;

  try {

    // APIキーの確認
    if (!env.GEMINI_API_KEY) {
      return json({
        error: "サーバーにAPIキーが設定されていません。"
      }, 500);
    }

    // リクエストサイズ制限
    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > 500000) {
      return json({
        error: "リクエストが大きすぎます。"
      }, 413);
    }

    let body: RequestBody;

    try {
      body = await request.json() as RequestBody;
    } catch {
      return json({
        error: "リクエスト形式が正しくありません。"
      }, 400);
    }

    // メッセージの検証
    if (
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 20000
    ) {
      return json({
        error: "メッセージが空、または長すぎます。"
      }, 400);
    }

    // 要約データの検証
    if (
      body.summary !== undefined &&
      (
        typeof body.summary !== "string" ||
        body.summary.length > 12000
      )
    ) {
      return json({
        error: "要約データが不正です。"
      }, 400);
    }

    // 会話履歴の検証
    const receivedHistory = body.history ?? [];

    if (
      !Array.isArray(receivedHistory) ||
      receivedHistory.length > 40
    ) {
      return json({
        error: "会話履歴が不正です。"
      }, 400);
    }

    const history: Message[] = [];

    for (const message of receivedHistory) {

      if (
        !message ||
        !["user", "model"].includes(message.role) ||
        typeof message.text !== "string" ||
        message.text.length > 20000
      ) {
        return json({
          error: "会話履歴に不正なデータがあります。"
        }, 400);
      }

      history.push({
        role: message.role,
        text: message.text
      });
    }

    let summary = body.summary || "";
    let currentHistory = [...history];
    let summarized = false;

    // 20件を超えたら古い10件を要約する
    if (currentHistory.length > 20) {

      const oldMessages =
        currentHistory.slice(0, 10);

      const recentMessages =
        currentHistory.slice(10);

      summary = await summarize(
        env,
        summary,
        oldMessages
      );

      currentHistory = recentMessages;
      summarized = true;
    }

    // 長期記憶
    const memoryInstruction = summary
      ? `
【過去の会話の長期記憶】

以下は以前の会話から作成された要約です。
必要に応じて回答に反映してください。

${summary}
`
      : "";

    // 現在の質問を最後に追加
    const contents = [
      ...currentHistory.map(message => ({
        role: message.role,
        parts: [
          { text: message.text }
        ]
      })),

      {
        role: "user",
        parts: [
          { text: body.message }
        ]
      }
    ];

    // Geminiに問い合わせ
    const reply = await callGemini(
      env,
      contents,
      SYSTEM_PROMPT + memoryInstruction,
      4096
    );

    // 次回に引き継ぐ会話
    const nextContext: Message[] = [
      ...currentHistory,

      {
        role: "user",
        text: body.message
      },

      {
        role: "model",
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

    console.error(
      "Pages Function Error:",
      error
    );

    return json({
      error: error instanceof Error
        ? error.message
        : "サーバー内部でエラーが発生しました。"
    }, 500);
  }
}
