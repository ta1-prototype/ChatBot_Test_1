export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const body = await request.json();

        const SYSTEM_INSTRUCTION = "あなたは熱心で優しく褒め上手な、現役トップ講師クラスの高校生専用AI学習チューターです。高校生の質問に対して分かりやすく、順を追って解説してください。数式はLaTeX記法（$や$$）を使用してください。";

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        const payload = {
            contents: body.contents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
        };

        // 一時的な混雑に対応するための強固なリトライ処理（最大5回）
        let response;
        let data;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            attempts++;
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            data = await response.json();

            // 成功、またはリトライ対象外のエラーならループを抜ける
            if (response.ok || (data.error && !data.error.message.includes('high demand') && response.status !== 503 && response.status !== 429)) {
                break;
            }

            // 混雑エラーの場合は段階的に待機時間を延ばして再試行 (1.5s, 3s, 4.5s, 6s)
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, attempts * 1500));
            }
        }

        if (data.error) {
            return new Response(JSON.stringify({ error: data.error.message }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
