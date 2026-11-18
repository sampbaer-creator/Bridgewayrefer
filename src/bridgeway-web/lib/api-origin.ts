export function apiOrigin() {
  return process.env.BRIDGEWAYREFER_API_ORIGIN || process.env.BRIDGEWAY_API_ORIGIN || "http://127.0.0.1:5180";
}
