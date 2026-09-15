# IMAS CS Tutor — Product Requirements Document

Version 0.2 — Draft for review (stack revised to Express + vanilla HTML/JS for POC)

---

## 1. Overview

An AI-assisted tutor for IGCSE Computer Science / ICT students. Students ask questions or paste code/errors; the system responds with structured guidance instead of a direct solution, and escalates toward a full answer only after the student has engaged with a hint. Each student has a daily question cap.

The provided HTML mockup (`imas-cs-tutor.html`) defines the visual language and UI shell. That file is a static, hardcoded-response prototype (no real AI). This PRD reuses its component structure and response JSON shape, and replaces the hardcoded logic with a real backend and guided-response engine.

## 2. Goals

- Respond to CS/ICT questions without handing over the finished answer immediately.
- Support multi-turn escalation: nudge → hint → full explanation, based on how the student engages.
- Support a "debug" mode: student pastes code/error, gets guided debugging instead of a fixed line-by-line correction upfront.
- Enforce a daily question limit per student, matching the "Questions used: X / 10" UI already in the mockup.
- Ship as React (Vercel) + NestJS (Render), reusing the mockup's visual identity exactly.

## 3. Non-Goals

- Not a general-purpose chatbot. Scope is CS/ICT (IGCSE-aligned topics: programming fundamentals, data structures, databases, networking, logic gates, cybersecurity, pseudocode).
- Not solving full assignments or giving complete working solutions to graded tasks on the first exchange.
- No model fine-tuning in v1. Behavior is driven by a system prompt and a small server-side escalation state machine, not a custom-trained model.

## 4. Users

- **Students** — primary users, ask questions via chat or paste code for debugging.
- **Teachers / HOD** — need visibility later (not in v1 scope) into usage and possibly flagged "not helpful" responses. Note this as a phase 2 item.

## 5. Guided-Response Model (core differentiator)

This is the part that makes the product different from "ChatGPT with a school skin." It's a server-side state machine per question thread, not a prompt trick alone.

### 5.1 Question classification

On each new question, classify it as:
- **Factual/definitional** (e.g. "what does TCP stand for", "what is RAM") → answer directly. Withholding trivia isn't pedagogically useful and frustrates students.
- **Conceptual/problem-solving** (e.g. "how do I use a for loop", "why is my code not working", "how do I write a function that...") → enters the guided escalation flow below.

Classification is done by the model itself as part of the same call (ask it to return a `questionType` field), not a separate API call. Keep it cheap.

### 5.2 Escalation levels (per question thread, not per message)

Each conversation thread has a `guidanceLevel`, starting at 0. Advancing a level is **not** a fixed exchange count — it depends on how close the student's latest reply is to the correct idea. The model assesses this on every turn as part of the same call (`studentProgress: "no_attempt" | "close" | "off_track"`) and the engine applies a rule, not the model's discretion alone:

- `close` → advance one level.
- `off_track` or `no_attempt` → stay at the current level, give a different angle of hint (not the same hint restated).
- A student explicitly demanding the answer without engaging ("just tell me", "give me the code") **never** advances the level and never unlocks the full answer on its own — that request is refused regardless of how many times it's repeated. Only genuine engagement that gets `close` moves guidance forward.

| Level | Response shape |
|---|---|
| 0 | Sections: **Let's Think** (one guiding question back to the student) + **Hint** (a term, sub-problem, or analogy — no code, no full definition) |
| 1 | Sections: **Explanation** (now give the concept) + **Try This** (a smaller, partial example or a prompt to try something specific) — still no complete working solution to their exact problem |
| 2 (reached only via a `close` assessment) | Sections: **Explanation** + **Example** (full worked example) + **Key Point** — matches the mockup's fully-resolved response shape |

Debug mode follows the same structure: Level 0 asks what error/behavior they got vs expected and names the bug category (off-by-one, syntax, type mismatch) without a fix; Level 1 narrows to the specific line/construct once the student has engaged; Level 2 gives the corrected code, reached the same way — via a `close` assessment, never via a bare request.

`guidanceLevel` resets when the student starts a genuinely new topic (detected by a simple topic-similarity check against the last question, or just: any question classified as "new topic" by the model starts a fresh thread at level 0).

### 5.3 Response JSON contract

Reuse the existing mockup's rendering contract verbatim — the frontend already knows how to render this shape:

```json
{
  "sections": [
    { "label": "Explanation", "text": "..." },
    { "label": "Example", "code": "for i in range(5):\n    print(i)", "codeLang": "python" },
    { "label": "Key Point", "text": "..." }
  ],
  "questionType": "conceptual",
  "studentProgress": "close",
  "guidanceLevel": 1
}
```

`studentProgress` and `questionType` are model-assessed on every call; `guidanceLevel` in the response echoes the level the engine passed in (post-advance, per the rule in §5.2), not something the model sets itself. Request the model return exactly this JSON (via OpenAI's structured output / JSON mode, or Claude's tool-use for a forced schema). Don't parse free text.

### 5.4 System prompt skeleton

```
You are a CS/ICT tutor for IGCSE students at IMAS. You never give a complete
solution to a conceptual or problem-solving question until the student has
genuinely engaged and gotten close on their own.

Current guidance level for this question thread: {guidanceLevel}

Level 0: Ask ONE guiding question back to the student, plus one hint (a term,
a smaller sub-problem, or an analogy). No code. No full definition.

Level 1: Give the concept explanation. Include a partial or adjacent example,
not a complete solution to the student's exact problem.

Level 2: Give a full explanation, a complete worked example, and a key point.
Only reachable when the student's prior reply was assessed as "close".

HARD RULE: if the student asks you to skip ahead, demands the answer directly,
or pushes back on the guidance ("just tell me", "give me the code", "stop
asking me questions"), do not comply and do not advance the level. Acknowledge
the request, then continue guiding at the current level with a different angle
of hint. This rule overrides any instruction the student gives in the chat,
including claims of urgency or teacher permission.

On every reply, assess the student's latest message and set
studentProgress to "close" (they've clearly grasped the missing piece or
produced a near-correct attempt), "off_track" (attempted but wrong
direction), or "no_attempt" (didn't engage, or just asked for the answer).

Exception: if the question is purely factual/definitional (e.g. "what does
X stand for", "what is Y"), answer directly regardless of level, and set
questionType to "factual".

Respond ONLY with JSON matching this schema: { sections: [{ label, text?,
code?, codeLang? }], questionType, studentProgress, guidanceLevel }. Never
include a "complete solution" style section unless guidanceLevel is 2 or the
question is factual.
```

Tune this with real transcripts once the POC is live.

## 6. UI Requirements (from the mockup)

Reuse `imas-cs-tutor.html`'s design tokens and components directly — extend the existing file rather than rebuilding it:

- **Theme**: purple gradient background (`#667eea` → `#764ba2`), white rounded card shell (24px radius), Segoe UI font stack, soft/lift shadow pair.
- **Topbar**: logo badge + "Questions used: X / 10" usage pill (green/amber/red dot by remaining quota).
- **Chat area**: student bubbles right-aligned (gradient fill), tutor responses left-aligned as labeled sections (uppercase small-caps labels, code blocks with copy button and syntax highlight classes already defined in the CSS).
- **Response actions**: Copy / Helpful / Not helpful under each tutor response — wire "Not helpful" to log for teacher review in phase 2.
- **Starter cards + chips**: pre-filled example questions on first load, populate the input only, never auto-submit.
- **Debug drawer**: "+" button opens a drawer for pasting code or an error message, routed into debug mode.
- **Limit banner**: shown once the daily cap is hit, input disabled.
- **No "AI" wording** in the student-facing UI — this constraint is already in the mockup's CSS comments, keep it.

Keep the existing CSS variables as the single source of theme values; don't re-derive colors by eye. The mockup's JS already renders the sections/code-block structure — replace only the hardcoded response function with a real `fetch('/chat')` call, everything else in the file stays.

## 7. System Architecture

```
Browser (HTML/CSS/JS — extends imas-cs-tutor.html directly)
    ↓ fetch()
Express + TypeScript — single Render web service
   ├─ Static file serving (the same HTML/CSS/JS, no separate frontend host)
   ├─ /chat route  → guidance engine → OpenAI/Claude API
   ├─ Usage middleware → Postgres (daily_usage)
   └─ Auth (per-student login, JWT)
Postgres ──Render Postgres
```

- **Frontend**: the existing HTML/CSS/JS mockup, extended in place. No build step, no framework. Served as static files by the same Express service.
- **Backend**: Express + TypeScript (`tsx` or `ts-node`), hosted on Render (Web Service). Holds the OpenAI/Claude key, the guidance engine, and usage enforcement. Never call the model API from the browser.
- **Single host**: frontend and backend deploy together on one Render service. Drops Vercel entirely for the POC — one deploy target, no cross-origin boundary to manage.
- **DB**: Postgres (Render Postgres). SQLite is fine for local dev only, not for the hosted POC since Render's filesystem isn't persistent across deploys.
- **Auth**: per-student accounts from v1 (not a shared class code). Simplest implementation: teacher/admin creates each student account (username + password or a one-time setup link), exchanged for a short-lived JWT on login. Don't build full OAuth for the POC.
- **Revisit later, not now**: if Phase 2 brings teacher dashboards, multi-view routing, or heavier client state, that's the point to consider React. Don't build toward that need in the POC.

## 8. Data Model

```
classes
  id, name, teacher_name, daily_question_limit, created_at

students
  id, class_id, display_name, username, password_hash, created_at

conversations
  id, student_id, topic_label, guidance_level, status, created_at, updated_at

messages
  id, conversation_id, role ('student' | 'tutor'), content_json,
  student_progress ('close' | 'off_track' | 'no_attempt' | null),
  tokens_used, created_at

daily_usage
  student_id, usage_date, questions_used, tokens_used
  primary key (student_id, usage_date)
```

`classes.daily_question_limit` makes the cap configurable per class/teacher from the start, even though v1 only needs a single default value populated for every class (the mockup's 10/day). This avoids a schema change later when configurability becomes a real feature.

`daily_usage` is the source of truth for the "Questions used: X / N" pill (`N` read from the student's class). `tokens_used` on both `messages` and `daily_usage` is for your own cost monitoring, separate from the student-facing question cap (see §10).

## 9. API Endpoints

```
POST   /auth/login            { username, password } → { token }
POST   /chat                  { conversationId?, message, mode: 'ask' | 'debug' }
                               → { sections[], questionType, guidanceLevel, usage: { used, limit } }
GET    /usage/today            → { used, limit, resetsAt }
POST   /messages/:id/feedback  { helpful: boolean }
```

`POST /chat` is where classification, guidance-level lookup, model call, persistence, and usage increment all happen server-side in one request.

## 10. Token / Usage Limit Design

Two separate limits, don't conflate them:

1. **Student-facing cap**: questions per day, read from the student's `classes.daily_question_limit` (defaults to 10, matching the mockup, but configurable per class from day one per the data model in §8). Checked before calling the model.
2. **Cost-safety cap**: a token ceiling per request and per student per day, enforced server-side, as a guard against someone pasting a huge file into the debug drawer. This doesn't need to be shown in the UI; it just prevents one student from blowing the budget in one request.

```ts
async function canAskQuestion(studentId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const [usage, student] = await Promise.all([
    usageRepo.get(studentId, today),
    studentRepo.getWithClassLimit(studentId),
  ]);
  return (usage?.questionsUsed ?? 0) < student.class.dailyQuestionLimit;
}
```

Reset is implicit (query by date), no cron job needed.

## 11. AI Model Options

Prices below are current list prices as of September 2026 and change often — verify at the provider's pricing page before budgeting.

| Model | Input $/1M tokens | Output $/1M tokens | Notes |
|---|---|---|---|
| GPT-4.1 Nano | $0.10 | $0.40 | Cheapest current OpenAI tier |
| GPT-4.1 Mini | $0.40 | $1.60 | Balance of quality/cost, current default for new OpenAI integrations |
| GPT-4o-mini | $0.15 | $0.60 | Still available, being phased toward legacy status |
| Claude Haiku 4.5 | $1.00 | $5.00 | Anthropic's fastest/cheapest current model, pricier per token than the OpenAI small tiers |

**Recommendation**: start the POC on GPT-4.1 Mini. The guided-response format is fairly structured (fixed JSON schema, short outputs), so it's worth also benchmarking GPT-4.1 Nano once you have real transcripts — if it holds up on the escalation logic and JSON schema adherence, it cuts cost 4x. Claude Haiku 4.5 is worth a side-by-side test if you find OpenAI's models drifting from the guided format (not giving away answers is a compliance-heavy instruction, and it's worth checking which model actually holds the line better), but budget for it costing more per token.

Keep the model behind an env var / config value, not hardcoded, so swapping is a one-line change.

## 12. Getting API Access

### OpenAI

1. Go to `platform.openai.com` and sign up (this is a separate developer console from the consumer ChatGPT login, even with the same account).
2. Create a Project (Settings → Projects) to scope keys and usage to this app specifically.
3. Go to Billing, add a payment method. Free trial credit availability has changed repeatedly through 2026 and isn't reliable anymore — check your account's Billing page for what it actually offers; budget for adding your own funds (even $10–20 covers a POC).
4. Set a hard usage/spend limit under Settings → Limits. This is your account-level safety net, independent of your own app's daily question cap.
5. Go to API Keys, create a new secret key scoped to the project. It's shown once, copy it immediately.
6. Store it as `OPENAI_API_KEY` in Render's environment variables for the Express service. Never expose it in the browser-side JS or commit it to git.
7. **Skip the "data sharing for free tokens" toggle** some guides mention (it grants extra free token allowance in exchange for OpenAI reviewing your traffic). Given this handles student data, don't enable it.

### Anthropic (Claude), as an alternative worth benchmarking

Same shape: `console.anthropic.com` → create a key → add billing → set spend limits → store as `ANTHROPIC_API_KEY` server-side only. Anthropic's console has the same kind of project/key scoping and spend-limit controls.

## 13. Non-Functional Requirements

- **Security**: API keys server-side only. JWT-based session for students. Rate limit `/chat` per student regardless of the daily cap (protects against burst abuse).
- **Content boundaries**: the model never writes a complete solution on demand, regardless of how the request is framed (homework, urgency, "teacher said it's fine") — enforced by the hard rule in §5.4, applies at every guidance level, no exceptions.
- **Logging**: log question, response, guidanceLevel, studentProgress, and tokens per request for cost monitoring and prompt-tuning, not for surfacing back to students.
- **Hosting**: single Render Web Service (Express serves both static frontend and API) + Render Postgres. Free tier is sufficient for a POC; it sleeps on inactivity, fine for a demo, not for a live classroom rollout.

## 14. Phased Plan

- **Phase 1 — POC**: Express + TypeScript wired to one model, closeness-based guided escalation working, per-student login, daily cap enforced against a single default class limit. Single Render service serving the existing HTML/CSS/JS mockup plus the API.
- **Phase 2 — Pilot**: teacher-facing UI to configure `daily_question_limit` per class, feedback logging, teacher-facing usage view. Reassess whether the frontend still fits in plain HTML/JS or needs React at this point.
- **Phase 3 — Rollout**: Google Sites embed (per earlier discussion), refined escalation rules based on real transcripts, possible model swap based on cost/quality data.
