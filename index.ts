// Supabase Edge Function: generate-quiz
// Secrets needed: GEMINI_API_KEY (optional GEMINI_MODEL, default gemini-3.8-flash)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { course = "", topic = "", count = 5, grade = null } = await req.json();
    if (!course) return json({ error: "course required" }, 400);
    const n = Math.min(10, Math.max(1, Number(count) || 5));
    const key = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
    if (!key) return json({ questions: [], fallback: true });

    const prompt = `Write ${n} multiple-choice quiz questions for a university student.
Course: ${course}. ${topic ? "Topic: " + topic + "." : ""} ${grade !== null ? "Current grade: " + grade + "%, so aim for foundational-to-medium difficulty." : ""}
Return ONLY JSON: {"questions":[{"q":"...","a":"correct answer","w":["wrong 1","wrong 2"]}]}
Each question has exactly one correct answer "a" and exactly two plausible wrong answers in "w". Keep answers short.`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        }),
      },
    );
    if (!r.ok) return json({ questions: [], fallback: true });
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const questions = (parsed.questions ?? [])
      .filter((x: any) => x?.q && x?.a && Array.isArray(x?.w) && x.w.length >= 2)
      .map((x: any) => ({ q: String(x.q), a: String(x.a), w: x.w.slice(0, 2).map(String) }));
    return json({ questions, fallback: questions.length === 0 });
  } catch (_e) {
    return json({ questions: [], fallback: true });
  }
});
