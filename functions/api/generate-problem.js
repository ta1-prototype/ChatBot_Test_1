export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const { subject, contextNote, image } = await request.json();

        const prompt = `対象教科: ${subject}\n` +
            (contextNote ? `補足リクエスト: ${contextNote}\n` : '') +
            `添付された画像をもとに、高校生の${subject}の観点から深掘りした学問的解説を行い、その現象に関連する【高校生レベルのオリジナル演習問題】とその【詳しい解答・解説】を作成してください。LaTeX記法（$や$$）を使用して数式を美しく記述してください。`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: image.mimeType, data: image.data } }
                    ]
                }]
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