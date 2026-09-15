import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required("JWT_SECRET"),
  adminResetToken: process.env.ADMIN_RESET_TOKEN,
  aiProvider: process.env.AI_PROVIDER ?? "openai",
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
  dailyLimit: Number(process.env.DAILY_QUESTION_LIMIT ?? 10),
  databasePath: process.env.DATABASE_PATH ?? "./data/imas.sqlite",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
