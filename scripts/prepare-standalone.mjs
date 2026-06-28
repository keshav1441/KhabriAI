// Copies the assets Next.js does NOT place in `.next/standalone` automatically
// (static assets, public files) plus the runtime .env, so the standalone server
// is fully self-contained for AppSail.
import { cpSync, existsSync } from "node:fs";

const dst = ".next/standalone";

cpSync(".next/static", `${dst}/.next/static`, { recursive: true });

if (existsSync("public")) {
  cpSync("public", `${dst}/public`, { recursive: true });
}

if (existsSync(".env")) {
  cpSync(".env", `${dst}/.env`);
}

console.log("Standalone assets prepared.");
