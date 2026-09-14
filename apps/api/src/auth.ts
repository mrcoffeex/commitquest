import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { env } from "./env.js";

export type AuthPayload = {
  sub: string;
  login: string;
  characterId?: string;
};

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function readToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.cq_token;
  return cookie;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  const payload = token ? readToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthedRequest).auth = payload;
  next();
}

export function requireInternal(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header !== `Bearer ${env.internalSecret}`) {
    res.status(401).json({ error: "Unauthorized internal" });
    return;
  }
  next();
}

export type AuthedRequest = Request & { auth: AuthPayload };
