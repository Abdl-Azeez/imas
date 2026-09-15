import express from "express";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { join } from "node:path";
import { config } from "./config.js";
import { authenticate, hashPassword, issueToken, requireAuth } from "./auth.js";
import { generateTutorResponse } from "./tutor.js";
import { getConversationMessages, getOrCreateConversation, getUsage, incrementUsage, saveFeedback, saveStudentMessage, saveTutorMessage, seedDemoStudent, updateGuidanceLevel } from "./store.js";

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(join(process.cwd(), "public")));

const chatLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, message: { error: "Too many requests. Please wait a moment." } });

seedDemoStudent(await hashPassword("demo1234"));

app.post("/auth/login", async (req, res) => {
  const input = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Username and password are required" });
  const user = await authenticate(input.data.username, input.data.password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  return res.json({ token: issueToken(user), user });
});

app.get("/usage/today", requireAuth, (req, res) => {
  const usage = getUsage(req.user!.id);
  const tomorrow = new Date(`${usage.date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return res.json({ used: usage.used, limit: usage.limit, resetsAt: tomorrow.toISOString() });
});

app.post("/chat", chatLimiter, requireAuth, async (req, res) => {
  const input = z.object({ conversationId: z.string().uuid().nullable().optional(), message: z.string().trim().min(1).max(12000), mode: z.enum(["ask", "debug"]).default("ask") }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "A message of up to 12,000 characters is required" });
  const usage = getUsage(req.user!.id);
  if (usage.used >= usage.limit) return res.status(429).json({ error: "Daily question limit reached", usage: { used: usage.used, limit: usage.limit } });

  const conversation = getOrCreateConversation(req.user!.id, input.data.conversationId ?? undefined);
  const history = getConversationMessages(conversation.id).map(item => {
    const data = JSON.parse(item.content_json) as { text?: string };
    return { role: item.role, content: data.text ?? item.content_json };
  });

  try {
    saveStudentMessage(conversation.id, input.data.message);
    const result = await generateTutorResponse(conversation.guidance_level, input.data.mode, input.data.message, history);
    const messageId = saveTutorMessage(conversation.id, result.response, result.tokensUsed);
    updateGuidanceLevel(conversation.id, result.response.guidanceLevel);
    incrementUsage(req.user!.id, result.tokensUsed);
    const nextUsage = getUsage(req.user!.id);
    return res.json({ conversationId: conversation.id, messageId, ...result.response, usage: { used: nextUsage.used, limit: nextUsage.limit } });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    const providerError = error as { status?: number; code?: string; message?: string };
    if (providerError.code === "insufficient_quota" || providerError.code === "credit_balance_exhausted") {
      return res.status(503).json({ error: "The tutor service has no provider credits available. Add credits to the OpenAI project or configure a funded API key." });
    }
    if (providerError.status === 429) {
      return res.status(503).json({ error: "The tutor service is temporarily busy. Please try again shortly." });
    }
    return res.status(502).json({ error: "The tutor service could not complete that request." });
  }
});

app.post("/messages/:id/feedback", requireAuth, (req, res) => {
  const input = z.object({ helpful: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "helpful must be true or false" });
  saveFeedback(String(req.params.id), input.data.helpful);
  return res.status(204).send();
});

app.get("*", (_req, res) => res.sendFile(join(process.cwd(), "public", "imas-cs-tutor.html")));
app.listen(config.port, () => console.log(`IMAS CS Tutor listening on http://localhost:${config.port}`));
