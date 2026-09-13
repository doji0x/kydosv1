import { base44 } from "@/api/base44Client";

// In-house HOOD account — no external wallet needed.
export const STARTING_BALANCE = 100;

export function cashOf(profile) {
  return profile?.hood_balance ?? STARTING_BALANCE;
}

export async function adjustBalance(profile, delta) {
  const next = Math.max(0, cashOf(profile) + delta);
  await base44.entities.Profile.update(profile.id, { hood_balance: next });
  return next;
}