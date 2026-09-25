import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AppUser } from "@workspace/db";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN_SECONDS = (() => {
  const raw = process.env.JWT_EXPIRES_IN ?? "7d";
  const match = raw.match(/^(\d+)(d|h|m|s)?$/);
  if (!match) return 7 * 24 * 3600;
  const n = parseInt(match[1], 10);
  const unit = match[2] ?? "s";
  return unit === "d" ? n * 86400 : unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
})();

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set");
  return secret;
}

export async function hashPassword(password: string) {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return { hash, salt: "" };
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  sub: string;
  role: string;
}

export function signToken(user: Pick<AppUser, "clerkUserId" | "role">): string {
  const payload: JwtPayload = { sub: user.clerkUserId, role: user.role };
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN_SECONDS });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}
