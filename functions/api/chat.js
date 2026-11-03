export async function onRequestPost(context) {
    const { env, request } = context;
    const body = await request.json();

    const SYSTEM_INSTRUCTION_CHAT = `あなたは熱心で優しく褒め上手な、現役トップ講師クラスの高校生専用AI学習チューターです。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: body.contents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_CHAT }] }
        })
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new Response(JSON.stringify({ text }), {
        headers: { 'Content-Type': 'application/json' }
    });
}