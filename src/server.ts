import express from "express";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { authenticate, hashPassword, issueToken, requireAuth } from "./auth.js";
import { generateTutorResponse } from "./tutor.js";
import {
  createStudent,
  deleteConversation,
  getConversationMessages,
  getGuestUsage,
  getOrCreateConversation,
  getUsage,
  incrementGuestUsage,
  incrementUsage,
  listConversations,
  ownsConversation,
  publicUser,
  saveFeedback,
  saveStudentMessage,
  saveTutorMessage,
  resetStudentUsage,
  seedDemoStudent,
  updateGuidanceState,
} from "./store.js";

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(join(process.cwd(), "public")));

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  message: { error: "Too many requests. Please wait a moment." },
});

seedDemoStudent(await hashPassword("demo1234"));

app.post("/auth/login", async (req, res) => {
  const input = z
    .object({
      username: z.string().min(1).max(80),
      password: z.string().min(1).max(200),
    })
    .safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  const user = await authenticate(input.data.username, input.data.password);
  if (!user)
    return res.status(401).json({ error: "Invalid username or password" });
  return res.json({ token: issueToken(user), user });
});

app.post("/auth/register", async (req, res) => {
  const input = z
    .object({
      username: z
        .string()
        .trim()
        .min(3)
        .max(40)
        .regex(/^[a-zA-Z0-9_.-]+$/),
      displayName: z.string().trim().min(1).max(80),
      password: z.string().min(8).max(200),
    })
    .safeParse(req.body);
  if (!input.success)
    return res.status(400).json({
      error:
        "Use a username, display name, and password of at least 8 characters.",
    });
  const student = createStudent(
    input.data.username,
    input.data.displayName,
    await hashPassword(input.data.password),
  );
  if (!student)
    return res.status(409).json({ error: "That username is already in use." });
  const user = publicUser(student);
  return res.status(201).json({ token: issueToken(user), user });
});

app.post("/auth/guest", (_req, res) => {
  const user = {
    id: `guest-${randomUUID()}`,
    username: "guest",
    displayName: "Guest",
    isGuest: true,
  };
  return res.json({ token: issueToken(user), user });
});

app.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

app.get("/usage/today", requireAuth, (req, res) => {
  const usage =
    req.user!.isGuest || req.user!.username === "guest"
      ? getGuestUsage(req.user!.id)
      : getUsage(req.user!.id);
  const tomorrow = new Date(`${usage.date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return res.json({
    used: usage.used,
    limit: usage.limit,
    resetsAt: tomorrow.toISOString(),
  });
});

app.post("/dev/reset-demo-usage", (req, res) => {
  const suppliedToken = req.header("x-admin-reset-token");
  if (!config.adminResetToken || suppliedToken !== config.adminResetToken) {
    return res.status(404).json({ error: "Not found" });
  }
  resetStudentUsage("demo");
  return res.json({ username: "demo", used: 0, limit: config.dailyLimit });
});

app.get("/conversations/:id", requireAuth, (req, res) => {
  const conversationId = String(req.params.id);
  if (
    !z.string().uuid().safeParse(conversationId).success ||
    !ownsConversation(req.user!.id, conversationId)
  ) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  const messages = getConversationMessages(conversationId).map((message) => {
    const content = JSON.parse(message.content_json);
    return message.role === "student"
      ? { role: "student", text: content.text }
      : { role: "tutor", response: content, messageId: message.id };
  });
  return res.json({ conversationId, messages });
});

app.get("/conversations", requireAuth, (req, res) => {
  return res.json({ conversations: listConversations(req.user!.id) });
});

app.delete("/conversations/:id", requireAuth, (req, res) => {
  const conversationId = String(req.params.id);
  if (
    !z.string().uuid().safeParse(conversationId).success ||
    !deleteConversation(req.user!.id, conversationId)
  ) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  return res.status(204).send();
});

function isGreeting(message: string) {
  return /^(hi|hey|hello|hiya|howdy|good morning|good afternoon|good evening|thanks|thank you|ok|okay|bye|goodbye|how are you|what'?s up|hows it going|how is it going)[!.?,\s]*$/i.test(
    message.trim(),
  );
}

function isGuestUser(req: express.Request) {
  return Boolean(req.user?.isGuest || req.user?.username === "guest");
}

app.post("/chat", chatLimiter, requireAuth, async (req, res) => {
  const input = z
    .object({
      conversationId: z.string().uuid().nullable().optional(),
      message: z.string().trim().min(1).max(12000),
      mode: z.enum(["ask", "debug"]).default("ask"),
    })
    .safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({ error: "A message of up to 12,000 characters is required" });
  const countsAsQuestion = !isGreeting(input.data.message);
  const guest = isGuestUser(req);
  const usage = guest ? getGuestUsage(req.user!.id) : getUsage(req.user!.id);
  if (countsAsQuestion && usage.used >= usage.limit)
    return res.status(429).json({
      error: guest
        ? "Guest questions used. Create an account to continue."
        : "Daily question limit reached",
      usage: { used: usage.used, limit: usage.limit },
      requiresAccount: guest,
    });

  const conversation = getOrCreateConversation(
    req.user!.id,
    input.data.conversationId ?? undefined,
  );
  const history = getConversationMessages(conversation.id).map((item) => {
    const data = JSON.parse(item.content_json) as { text?: string };
    return { role: item.role, content: data.text ?? item.content_json };
  });

  try {
    saveStudentMessage(conversation.id, input.data.message);
    // guidance_state is a per-part map ({ main: 0 } or { a: 1, b: 0 }), not a
    // single number - default to {} for a brand new conversation.
    const guidanceState = conversation.guidance_state ?? {};
    const result = await generateTutorResponse(
      guidanceState,
      input.data.mode,
      input.data.message,
      history,
    );
    const messageId = saveTutorMessage(
      conversation.id,
      result.response,
      result.tokensUsed,
    );
    updateGuidanceState(conversation.id, result.guidanceState);
    if (countsAsQuestion)
      guest
        ? incrementGuestUsage(req.user!.id, result.tokensUsed)
        : incrementUsage(req.user!.id, result.tokensUsed);
    const nextUsage = guest
      ? getGuestUsage(req.user!.id)
      : getUsage(req.user!.id);
    return res.json({
      conversationId: conversation.id,
      messageId,
      ...result.response,
      usage: { used: nextUsage.used, limit: nextUsage.limit },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    const providerError = error as {
      status?: number;
      code?: string;
      message?: string;
    };
    if (
      providerError.code === "insufficient_quota" ||
      providerError.code === "credit_balance_exhausted"
    ) {
      return res.status(503).json({
        error:
          "The tutor service has no provider credits available. Add credits to the OpenAI project or configure a funded API key.",
      });
    }
    if (providerError.status === 429) {
      return res.status(503).json({
        error:
          "The tutor service is temporarily busy. Please try again shortly.",
      });
    }
    return res
      .status(502)
      .json({ error: "The tutor service could not complete that request." });
  }
});

app.post("/messages/:id/feedback", requireAuth, (req, res) => {
  const input = z.object({ helpful: z.boolean() }).safeParse(req.body);
  if (!input.success)
    return res.status(400).json({ error: "helpful must be true or false" });
  saveFeedback(String(req.params.id), input.data.helpful);
  return res.status(204).send();
});

app.get("*", (_req, res) =>
  res.sendFile(join(process.cwd(), "public", "cs-tutor.html")),
);
app.listen(config.port, () =>
  console.log(`IMAS CS Tutor listening on http://localhost:${config.port}`),
);
