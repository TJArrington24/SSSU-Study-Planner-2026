// ===== Optional: connect your Supabase edge function for AI advice =====
const EDGE_URL = ""; // e.g. https://YOURPROJECT.supabase.co/functions/v1/study-plan
const ANON_KEY = ""; // Supabase anon (public) key

// ===== State (saved in the browser, no install or server needed) =====
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const state = {
  courses: load("courses", []),
  hours: load("hours", 12),
  quizScores: load("quizScores", {}),   // course -> [percent, ...]
  custom: load("custom", {})            // course -> [{q, a, w:[..]}]
};
const save = () => { Object.keys(state).forEach(k => localStorage.setItem(k, JSON.stringify(state[k]))); window.onSave && window.onSave(); };
const $ = id => document.getElementById(id);

// ===== Starter question bank (add more, or add your own in the app) =====
const BANK = {
  general: [
    { q: "Which method means testing yourself instead of re-reading?", a: "Active recall", w: ["Highlighting", "Passive review"] },
    { q: "Spreading study sessions over days is called…", a: "Spaced repetition", w: ["Cramming", "Multitasking"] },
    { q: "The Pomodoro technique uses…", a: "25-minute focus blocks with short breaks", w: ["Four-hour sessions", "Studying only at night"] },
    { q: "Best time to review new material for retention?", a: "Within 24 hours", w: ["One week later", "Night before the exam only"] },
    { q: "Explaining a topic in simple words is the…", a: "Feynman technique", w: ["Cornell method", "SQ3R"] }
  ]
};

// ===== Tabs =====
document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button, .tab").forEach(e => e.classList.remove("active"));
  b.classList.add("active"); $(b.dataset.tab).classList.add("active");
  render();
});

// ===== Courses =====
$("add-course").onclick = () => {
  const name = $("c-name").value.trim();
  if (!name) return alert("Enter a course name");
  state.courses.push({
    name, grade: +$("c-grade").value || 0, target: +$("c-target").value || 85,
    load: +$("c-load").value, exam: $("c-exam").value, due: $("c-due").value
  });
  ["c-name","c-grade","c-target","c-exam","c-due"].forEach(i => $(i).value = "");
  save(); render();
};
$("hours").onchange = e => { state.hours = +e.target.value || 1; save(); };

const daysUntil = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
const avgQuiz = n => { const s = state.quizScores[n]; return s?.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

// ===== Risk score: low grade, big gap to target, heavy load, close deadlines, weak quizzes =====
function risk(c) {
  let s = 0;
  s += Math.max(0, 80 - c.grade) * 0.6;
  s += Math.max(0, c.target - c.grade) * 0.3;
  s += c.load * 5;
  const e = daysUntil(c.exam), d = daysUntil(c.due);
  if (e !== null && e >= 0) s += Math.max(0, 30 - e);
  if (d !== null && d >= 0) s += Math.max(0, 14 - d);
  const q = avgQuiz(c.name);
  if (q !== null) s += Math.max(0, 70 - q) * 0.5;
  const level = s >= 45 ? "High" : s >= 25 ? "Medium" : "Low";
  return { score: Math.round(s), level };
}

// ===== Weekly plan: split hours in proportion to risk =====
function buildPlan() {
  const list = state.courses.map(c => ({ c, r: risk(c) }));
  const total = list.reduce((a, x) => a + x.r.score + 5, 0);
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return list.map((x, i) => {
    const hrs = Math.max(1, Math.round(state.hours * (x.r.score + 5) / total));
    const sessions = Math.min(5, Math.max(1, Math.round(hrs / 1.5)));
    const when = Array.from({ length: sessions }, (_, k) => days[(i + k * 2) % 7]);
    return { ...x, hrs, when };
  }).sort((a, b) => b.r.score - a.r.score);
}

// ===== Quizzes =====
let quiz = null;
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
$("start-quiz").onclick = () => {
  const name = $("q-course").value;
  const pool = [...(state.custom[name] || []), ...BANK.general];
  quiz = { name, qs: shuffle(pool).slice(0, 5), i: 0, right: 0 };
  showQ();
};
function showQ() {
  const area = $("quiz-area");
  if (quiz.i >= quiz.qs.length) {
    const pct = Math.round(quiz.right / quiz.qs.length * 100);
    (state.quizScores[quiz.name] ||= []).push(pct); save();
    area.innerHTML = `<div class="card"><h3>Score: ${pct}%</h3><p>Saved. Your plan and risk levels now use this result.</p></div>`;
    return;
  }
  const q = quiz.qs[quiz.i];
  area.innerHTML = `<div class="card"><b>Q${quiz.i + 1}/${quiz.qs.length}: </b>${esc(q.q)}</div>`;
  shuffle([q.a, ...q.w]).forEach(opt => {
    const b = document.createElement("button");
    b.className = "opt"; b.textContent = opt;
    b.onclick = () => {
      const ok = opt === q.a; if (ok) quiz.right++;
      b.classList.add(ok ? "right" : "wrong");
      area.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (x.textContent === q.a) x.classList.add("right"); });
      setTimeout(() => { quiz.i++; showQ(); }, 900);
    };
    area.appendChild(b);
  });
}
$("add-q").onclick = () => {
  const name = $("q-course").value;
  const q = $("n-q").value.trim(), a = $("n-a").value.trim();
  if (!name || !q || !a) return alert("Pick a course and fill in the question and answer");
  (state.custom[name] ||= []).push({ q, a, w: [$("n-w1").value || "None of these", $("n-w2").value || "All of these"] });
  ["n-q","n-a","n-w1","n-w2"].forEach(i => $(i).value = ""); save(); alert("Question saved");
};

// ===== Study options =====
const METHODS = {
  High: ["Daily active-recall sessions (flashcards, past papers)", "Book a tutor, office hours or study group this week", "Redo the problems you got wrong, then re-quiz"],
  Medium: ["Spaced repetition: 3 short sessions this week", "Summarize each topic in your own words (Feynman)", "Take a quiz every 2–3 days"],
  Low: ["Keep a light weekly review", "One practice quiz per week", "Try teaching a classmate to lock it in"]
};

// ===== Render =====
const esc = s => String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
function render() {
  $("hours").value = state.hours;
  $("course-list").innerHTML = state.courses.map((c, i) => {
    const r = risk(c), q = avgQuiz(c.name);
    return `<div class="card"><b>${esc(c.name)}</b> — grade ${c.grade}% (target ${c.target}%)
      · <span class="risk-${r.level}">${r.level} risk</span>
      ${q !== null ? `· quiz avg ${Math.round(q)}%` : ""}
      ${c.exam ? `<br>Exam: ${c.exam}` : ""} ${c.due ? `· Due: ${c.due}` : ""}
      <br><button class="secondary" onclick="removeCourse(${i})">Remove</button></div>`;
  }).join("") || "<p>No courses yet.</p>";
  $("q-course").innerHTML = state.courses.map(c => `<option>${esc(c.name)}</option>`).join("");
  $("study-out").innerHTML = state.courses.map(c => {
    const r = risk(c);
    return `<div class="card"><b>${esc(c.name)}</b> <span class="risk-${r.level}">(${r.level})</span><ul>${METHODS[r.level].map(m => `<li>${m}</li>`).join("")}</ul></div>`;
  }).join("") || "<p>Add courses first.</p>";
}
window.removeCourse = i => { state.courses.splice(i, 1); save(); render(); };

$("make-plan").onclick = () => {
  const p = buildPlan();
  $("plan-out").innerHTML = p.map(x => `<div class="card"><b>${esc(x.c.name)}</b>
    <span class="risk-${x.r.level}">${x.r.level} risk</span><br>
    ${x.hrs} hrs this week · ${x.when.join(", ")}</div>`).join("") || "<p>Add courses first.</p>";
};

// Optional AI advice via your existing Supabase edge function
$("ai-plan").onclick = async () => {
  if (!EDGE_URL) return ($("ai-out").textContent = "Set EDGE_URL and ANON_KEY at the top of app.js to enable AI advice.");
  $("ai-out").textContent = "Thinking…";
  try {
    const r = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        courses: state.courses.map(c => ({ name: c.name, grade: c.grade, target: c.target })),
        hoursPerWeek: state.hours,
        notes: state.courses.map(c => `${c.name}: quiz avg ${avgQuiz(c.name) ?? "n/a"}, exam ${c.exam || "n/a"}, due ${c.due || "n/a"}`).join("; ")
      })
    });
    const d = await r.json();
    $("ai-out").textContent = d.plan || JSON.stringify(d, null, 2);
  } catch (e) { $("ai-out").textContent = "AI is unavailable right now. Your built-in plan above still works."; }
};
render();
