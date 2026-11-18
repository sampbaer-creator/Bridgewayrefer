// Fails when source files are not UTF-8 or contain mojibake (UTF-8 text decoded as Windows-1252 and saved again).
// Run: node scripts/check-encoding.mjs  (from src/bridgeway-web)
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const roots = ["app", "components", "lib"];
const extensions = new Set([".ts", ".tsx", ".css", ".md", ".json"]);
// Typical mojibake for ’ “ ” — – … · → ✓ and friends, plus the U+FFFD replacement character.
const mojibake = /â€|â†|âœ|Ã[\u0080-¿]|Â[ -¿]|�/;
const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!extensions.has(extname(entry.name))) continue;
    const bytes = readFileSync(path);
    if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) { failures.push(`${path}: UTF-16 file, save as UTF-8`); continue; }
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { failures.push(`${path}: not valid UTF-8`); continue; }
    text.split("\n").forEach((line, index) => { if (mojibake.test(line)) failures.push(`${path}:${index + 1}: garbled text: ${line.trim().slice(0, 100)}`); });
  }
}

for (const root of roots) walk(root);
if (failures.length) { console.error("Encoding check failed:\n" + failures.join("\n")); process.exit(1); }
console.log("Encoding check passed.");
