import express from "express";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { generateTutorResponse } from "./tutor.js";
import {
  deleteConversation,
  getConversationMessages,
  getOrCreateConversation,
  listConversations,
  saveFeedback,
  saveStudentMessage,
  saveTutorMessage,
  updateGuidanceState,
} from "./store.js";

const app = express();
app.set("trust proxy", 1);
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

app.get("/usage/today", (_req, res) => {
  return res.json({ used: 0, limit: 0, resetsAt: new Date().toISOString() });
});

app.get("/conversations/:id", (req, res) => {
  const conversationId = String(req.params.id);
  if (!z.string().uuid().safeParse(conversationId).success) {
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

app.get("/conversations", (_req, res) => {
  return res.json({ conversations: listConversations("anonymous") });
});

app.delete("/conversations/:id", (req, res) => {
  const conversationId = String(req.params.id);
  if (!z.string().uuid().safeParse(conversationId).success || !deleteConversation("anonymous", conversationId)) {
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

app.post("/chat", chatLimiter, async (req, res) => {
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

  const userId = "anonymous";
  const conversation = getOrCreateConversation(
    userId,
    input.data.conversationId ?? undefined,
  );
  const history = getConversationMessages(conversation.id).map((item) => {
    const data = JSON.parse(item.content_json) as { text?: string };
    return { role: item.role, content: data.text ?? item.content_json };
  });

  try {
    saveStudentMessage(conversation.id, input.data.message);
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
    return res.json({
      conversationId: conversation.id,
      messageId,
      ...result.response,
      usage: { used: 0, limit: 0 },
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

app.post("/messages/:id/feedback", (req, res) => {
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
