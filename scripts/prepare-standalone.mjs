// Prepares `.next/standalone` for AppSail deployment.
//
// 1. Copies the assets Next.js does NOT place in `.next/standalone` automatically
//    (static assets, public files) plus the runtime .env.
// 2. Dereferences symlinks inside the bundle. Turbopack pins server-external
//    packages (e.g. @prisma/client, pg) as SYMLINKED aliases under
//    `.next/node_modules/<name>-<hash>`. The Catalyst CLI does not preserve
//    symlinks when zipping the upload, so in the container they resolve to
//    nothing ("Cannot find module '@prisma/client-<hash>/runtime/client'").
//    Replacing them with real copies makes the bundle self-contained.
import {
  cpSync,
  existsSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const standalone = ".next/standalone";

cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });

if (existsSync("public")) {
  cpSync("public", `${standalone}/public`, { recursive: true });
}

if (existsSync(".env")) {
  cpSync(".env", `${standalone}/.env`);
}

let dereferenced = 0;

function dereferenceSymlinks(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = realpathSync(full);
      } catch {
        continue; // dangling link — nothing to copy
      }
      rmSync(full, { recursive: true, force: true });
      cpSync(target, full, { recursive: true, dereference: true });
      dereferenced++;
    } else if (entry.isDirectory()) {
      dereferenceSymlinks(full);
    }
  }
}

dereferenceSymlinks(standalone);

console.log(`Standalone assets prepared. Dereferenced ${dereferenced} symlink(s).`);
