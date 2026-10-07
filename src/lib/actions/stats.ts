"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  STATS_COOKIE,
  allowStatsAttempt,
  passwordMatches,
  readStatsToken,
  statsCookieOptions,
  statsCookieValue,
} from "@/lib/stats/access";
import { recordUsage } from "@/lib/stats/usage";
import { getClientIp } from "@/lib/shared/client-ip";
import { env } from "@/lib/shared/env";

export async function recordVisitAction(): Promise<void> {
  const ip = await getClientIp();
  recordUsage({ type: "visit", visitorIp: ip });
}

async function cookieSecure(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  if (proto === "http") return false;
  return process.env.NODE_ENV === "production";
}

export async function unlockStatsAction(formData: FormData): Promise<void> {
  const token = readStatsToken(env.STATS_TOKEN);
  if (!token) redirect("/stats");

  const ip = await getClientIp();
  if (!allowStatsAttempt(ip)) redirect("/stats?e=limited");

  const password = String(formData.get("password") ?? "").trim();
  if (!passwordMatches(password, token)) redirect("/stats?e=invalid");

  const jar = await cookies();
  jar.set(
    STATS_COOKIE,
    statsCookieValue(token),
    statsCookieOptions(60 * 60 * 24 * 30, await cookieSecure())
  );
  redirect("/stats");
}

export async function lockStatsAction(): Promise<void> {
  const jar = await cookies();
  jar.set(STATS_COOKIE, "", statsCookieOptions(0, await cookieSecure()));
  redirect("/stats");
}
