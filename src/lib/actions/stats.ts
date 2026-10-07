"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  STATS_COOKIE,
  allowStatsAttempt,
  passwordMatches,
  statsCookieOptions,
  statsCookieValue,
} from "@/lib/stats/access";
import { recordUsage } from "@/lib/stats/usage";
import { getClientIp } from "@/lib/shared/client-ip";
import { env } from "@/lib/shared/env";
import { err, ok, type Result } from "@/lib/shared/result";

export async function recordVisitAction(): Promise<void> {
  const ip = await getClientIp();
  recordUsage({ type: "visit", visitorIp: ip });
}

export async function unlockStatsAction(
  formData: FormData
): Promise<Result<true>> {
  const token = env.STATS_TOKEN;
  if (!token) return err("Indisponible", "STATS_DISABLED");

  const ip = await getClientIp();
  if (!allowStatsAttempt(ip)) {
    return err(
      "Trop de tentatives, réessaie dans quelques minutes.",
      "RATE_LIMITED"
    );
  }

  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password, token)) {
    return err("Mot de passe incorrect.", "INVALID_PASSWORD");
  }

  const jar = await cookies();
  jar.set(STATS_COOKIE, statsCookieValue(token), statsCookieOptions());
  return ok(true);
}

export async function lockStatsAction(): Promise<void> {
  const jar = await cookies();
  jar.set(STATS_COOKIE, "", statsCookieOptions(0));
  redirect("/stats");
}
