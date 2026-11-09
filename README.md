# AI Student Planner
Free site: courses, risk-ranked weekly plan, quizzes (built-in, your own, and AI-generated), study options, and student logins with a separate set of tables per student.

## Setup (no installs)
1. **Database:** Supabase > SQL Editor > paste `supabase/setup.sql` > Run. Each new sign-up automatically gets `plans_<id>` and `state_<id>` tables.
2. **Edge function:** Supabase > Edge Functions > new function `generate-quiz` > paste `supabase/functions/generate-quiz/index.ts` > Deploy. Secret `GEMINI_API_KEY` must be set (same one your plan function uses).
3. **Keys:** in `cloud.js` set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. If your plan function isn't named `study-plan`, change `PLAN_FN`.
4. **Publish:** upload all files to GitHub, Settings > Pages > deploy from `main`.
5. For testing, Supabase > Authentication > Providers > Email > turn off "Confirm email".

Without keys the site still works offline (data stays in the browser). Never put `GEMINI_API_KEY` in the repo.
