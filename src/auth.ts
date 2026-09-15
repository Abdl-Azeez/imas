import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { findStudent, publicUser } from "./store.js";
import type { AuthUser } from "./types.js";

const scrypt = promisify(scryptCallback);

type TokenPayload = AuthUser & { iat: number; exp: number };

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}

export function issueToken(user: AuthUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, config.jwtSecret) as TokenPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

export async function authenticate(username: string, password: string) {
  const student = findStudent(username);
  if (!student || !(await verifyPassword(password, student.password_hash))) return undefined;
  return publicUser(student);
}
