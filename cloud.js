// ===== Fill these in (Supabase > Project Settings > API). The anon key is safe to be public. =====
const SUPABASE_URL = "";      // https://YOURPROJECT.supabase.co
const SUPABASE_ANON_KEY = ""; // anon public key
const PLAN_FN = "study-plan"; // your existing edge function name
const QUIZ_FN = "generate-quiz";

let sb = null, user = null;
const authBox = $("auth");
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  authBox.innerHTML = "<small>Offline mode: data stays in this browser. Add your Supabase keys in cloud.js to enable logins.</small>";
} else {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((_e, session) => { user = session?.user ?? null; drawAuth(); if (user) pullState(); });
  sb.auth.getSession().then(({ data }) => { user = data.session?.user ?? null; drawAuth(); if (user) pullState(); });
}

function drawAuth() {
  authBox.innerHTML = user
    ? `Signed in as <b>${esc(user.email)}</b> <button id="out" class="secondary">Log out</button>`
    : `<input id="em" type="email" placeholder="Email"><input id="pw" type="password" placeholder="Password (6+ chars)">
       <button id="in">Log in</button> <button id="up" class="secondary">Sign up</button> <small id="amsg"></small>`;
  if (user) $("out").onclick = () => sb.auth.signOut();
  else {
    const msg = t => ($("amsg").textContent = t);
    $("in").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("em").value, password: $("pw").value }); if (error) msg(error.message); };
    $("up").onclick = async () => {
      const { data, error } = await sb.auth.signUp({ email: $("em").value, password: $("pw").value });
      msg(error ? error.message : data.session ? "" : "Check your email to confirm, then log in.");
    };
  }
}

// ----- Sync: load this student's data, or push local data if they have none yet -----
async function pullState() {
  const { data, error } = await sb.rpc("get_state");
  if (error) return console.warn(error.message);
  if (data && data.courses) {
    Object.assign(state, { courses: data.courses, hours: data.hours ?? 12, quizScores: data.quizScores ?? {}, custom: data.custom ?? {} });
    Object.keys(state).forEach(k => localStorage.setItem(k, JSON.stringify(state[k])));
    render();
  } else pushState();
}
let t; const pushState = () => { if (user) sb.rpc("save_state", { p: state }).then(({ error }) => error && console.warn(error.message)); };
window.onSave = () => { clearTimeout(t); t = setTimeout(pushState, 600); };

// ----- Save each generated plan to the student's own plans table -----
$("make-plan").addEventListener("click", () => {
  if (!user || !state.courses.length) return;
  const text = buildPlan().map(x => `${x.c.name}: ${x.hrs} hrs (${x.r.level} risk) on ${x.when.join(", ")}`).join("\n");
  sb.rpc("save_plan", { p_hours: state.hours, p_courses: state.courses, p_plan: text });
});

// ----- AI advice through the logged-in function call -----
$("ai-plan").onclick = async () => {
  if (!user) return ($("ai-out").textContent = "Log in to use AI advice.");
  $("ai-out").textContent = "Thinking…";
  const { data, error } = await sb.functions.invoke(PLAN_FN, { body: {
    courses: state.courses.map(c => ({ name: c.name, grade: c.grade, target: c.target })),
    hoursPerWeek: state.hours,
    notes: state.courses.map(c => `${c.name}: quiz avg ${avgQuiz(c.name) ?? "n/a"}, exam ${c.exam || "n/a"}, due ${c.due || "n/a"}`).join("; ")
  }});
  $("ai-out").textContent = error ? "AI is busy right now. Your built-in plan above still works." : (data.plan || JSON.stringify(data, null, 2));
};

// ----- AI-generated quiz questions -----
$("ai-quiz").onclick = async () => {
  const name = $("q-course").value, note = $("ai-quiz-msg");
  if (!user) return (note.textContent = "Log in to generate AI questions.");
  if (!name) return (note.textContent = "Add a course first.");
  note.textContent = "Generating…";
  const c = state.courses.find(x => x.name === name);
  const { data, error } = await sb.functions.invoke(QUIZ_FN, { body: { course: name, topic: $("ai-topic").value, count: 5, grade: c?.grade ?? null } });
  if (error || !data?.questions?.length) return (note.textContent = "AI is busy or out of quota. Built-in questions still work.");
  (state.custom[name] ||= []).push(...data.questions); save();
  note.textContent = `Added ${data.questions.length} AI questions. Press Start quiz.`;
};
