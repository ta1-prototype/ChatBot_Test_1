export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const body = await request.json();

        // Gemini API用のシステムプロンプト
        const SYSTEM_INSTRUCTION = "あなたは熱心で優しく褒め上手な、現役トップ講師クラスの高校生専用AI学習チューターです。高校生の質問に対して分かりやすく、順を追って解説してください。数式はLaTeX記法（$や$$）を使用してください。";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: body.contents,
                systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
            })
        });

        const data = await response.json();
        
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
