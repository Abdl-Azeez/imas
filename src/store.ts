import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { AuthUser, TutorResponse } from "./types.js";

mkdirSync(dirname(config.databasePath), { recursive: true });
type StudentRow = { id: string; username: string; display_name: string; password_hash: string; daily_limit: number };
type ConversationRow = { id: string; student_id: string; guidance_level: number };
type MessageRow = { id: string; conversation_id: string; role: "student" | "tutor"; content_json: string; student_progress?: string; tokens_used: number };
type UsageRow = { student_id: string; usage_date: string; questions_used: number; tokens_used: number };
type FeedbackRow = { id: string; message_id: string; helpful: number };
type StoreData = { students: StudentRow[]; conversations: ConversationRow[]; messages: MessageRow[]; usage: UsageRow[]; feedback: FeedbackRow[] };

const emptyStore = (): StoreData => ({ students: [], conversations: [], messages: [], usage: [], feedback: [] });
let data: StoreData = existsSync(config.databasePath) ? JSON.parse(readFileSync(config.databasePath, "utf8")) : emptyStore();
function persist() { writeFileSync(config.databasePath, JSON.stringify(data, null, 2)); }

export function seedDemoStudent(passwordHash: string) {
  if (!data.students.some(student => student.username === "demo")) {
    data.students.push({ id: randomUUID(), username: "demo", display_name: "Demo Student", password_hash: passwordHash, daily_limit: config.dailyLimit });
    persist();
  }
}

export function findStudent(username: string): StudentRow | undefined {
  return data.students.find(student => student.username === username);
}

export function publicUser(student: StudentRow): AuthUser {
  return { id: student.id, username: student.username, displayName: student.display_name };
}

export function getUsage(studentId: string) {
  const date = new Date().toISOString().slice(0, 10);
  const row = data.usage.find(item => item.student_id === studentId && item.usage_date === date);
  const student = data.students.find(item => item.id === studentId)!;
  return { used: row?.questions_used ?? 0, limit: student.daily_limit, date };
}

export function incrementUsage(studentId: string, tokensUsed: number) {
  const date = new Date().toISOString().slice(0, 10);
  const row = data.usage.find(item => item.student_id === studentId && item.usage_date === date);
  if (row) { row.questions_used += 1; row.tokens_used += tokensUsed; }
  else data.usage.push({ student_id: studentId, usage_date: date, questions_used: 1, tokens_used: tokensUsed });
  persist();
}

export function getOrCreateConversation(studentId: string, conversationId?: string): ConversationRow {
  if (conversationId) {
    const existing = data.conversations.find(item => item.id === conversationId && item.student_id === studentId);
    if (existing) return existing;
  }
  const id = randomUUID();
  data.conversations.push({ id, student_id: studentId, guidance_level: 0 });
  persist();
  return { id, student_id: studentId, guidance_level: 0 };
}

export function getConversationMessages(conversationId: string) {
  return data.messages.filter(item => item.conversation_id === conversationId);
}

export function saveStudentMessage(conversationId: string, text: string) {
  data.messages.push({ id: randomUUID(), conversation_id: conversationId, role: "student", content_json: JSON.stringify({ text }), tokens_used: 0 });
  persist();
}

export function saveTutorMessage(conversationId: string, response: TutorResponse, tokensUsed: number) {
  const id = randomUUID();
  data.messages.push({ id, conversation_id: conversationId, role: "tutor", content_json: JSON.stringify(response), student_progress: response.studentProgress, tokens_used: tokensUsed });
  persist();
  return id;
}

export function updateGuidanceLevel(conversationId: string, level: number) {
  const conversation = data.conversations.find(item => item.id === conversationId);
  if (conversation) conversation.guidance_level = level;
  persist();
}

export function saveFeedback(messageId: string, helpful: boolean) {
  data.feedback.push({ id: randomUUID(), message_id: messageId, helpful: helpful ? 1 : 0 });
  persist();
}
