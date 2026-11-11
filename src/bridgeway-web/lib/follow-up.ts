import type { Referral } from "./api";
export function isOverdue(referral: Referral, now = Date.now()) {
  return !["Completed", "Won", "Closed"].includes(referral.status) && !!referral.nextActionAt && Date.parse(referral.nextActionAt) < now;
}
