import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync("src/server/defaultAdminPin.ts", "utf8");
const match = src.match(/"([0-9]{4})"/);
if (!match) {
  console.log("PIN_SOURCE_MISSING");
  process.exit(1);
}
const pin = match[1];

function walk(dir, hits) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "server" || ent.name === "node_modules") continue;
      walk(full, hits);
    } else if (/\.(js|html|css|json|txt|ts|tsx)$/.test(ent.name)) {
      const text = fs.readFileSync(full, "utf8");
      if (text.includes(pin)) hits.push(path.relative(process.cwd(), full));
    }
  }
}

const bundleHits = [];
walk(path.join(".next", "static"), bundleHits);
const sourceHits = [];
walk("src", sourceHits);
console.log(bundleHits.length === 0 ? "CLIENT_BUNDLE_CLEAN" : `CLIENT_BUNDLE_HIT ${bundleHits.length}`);
console.log(sourceHits.length === 0 ? "CLIENT_SOURCE_CLEAN" : `CLIENT_SOURCE_HIT ${sourceHits.length}`);
