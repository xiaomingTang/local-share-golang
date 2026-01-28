import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pathExists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(p) {
  try {
    const st = await fs.lstat(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      // If someone created a real directory here, don't delete it automatically.
      // It may contain real files and would be dangerous to remove.
      return { removed: false, reason: "exists-as-real-directory" };
    }

    await fs.rm(p, { recursive: true, force: true });
    return { removed: true };
  } catch (err) {
    if (err && err.code === "ENOENT") return { removed: false };
    throw err;
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..");

  // The script is invoked from a workspace package (frontend/ or web/).
  // Use CWD to determine which package is being installed.
  const cwd = process.cwd();
  const packageDir = path.resolve(cwd);

  const commonDir = path.resolve(repoRoot, "common");
  const commonNodeModules = path.join(commonDir, "node_modules");
  const packageNodeModules = path.join(packageDir, "node_modules");

  // Only link if we're running inside repoRoot/frontend or repoRoot/web.
  // This avoids surprising behavior if someone runs it elsewhere.
  const rel = path.relative(repoRoot, packageDir).replaceAll("\\", "/");
  if (rel !== "frontend" && rel !== "web") {
    console.log(
      `[ensure-common-node-modules] Skip: unexpected cwd '${packageDir}' (expected repoRoot/frontend or repoRoot/web).`,
    );
    return;
  }

  if (!(await pathExists(packageNodeModules))) {
    console.log(
      `[ensure-common-node-modules] Skip: '${packageNodeModules}' not found (did npm install run?).`,
    );
    return;
  }

  const removed = await removeIfExists(commonNodeModules);
  if (removed.reason === "exists-as-real-directory") {
    console.log(
      `[ensure-common-node-modules] Skip: '${commonNodeModules}' is a real directory (won't replace).`,
    );
    return;
  }

  // Use 'junction' on Windows for best compatibility.
  const type = process.platform === "win32" ? "junction" : "dir";

  // Create as relative link so it works across machines.
  const linkTarget = path.relative(
    path.dirname(commonNodeModules),
    packageNodeModules,
  );

  try {
    await fs.symlink(linkTarget, commonNodeModules, type);
    console.log(
      `[ensure-common-node-modules] Linked common/node_modules -> ${rel}/node_modules`,
    );
  } catch (err) {
    // Some environments disallow symlinks; give a clear actionable message.
    const msg = err?.message ? String(err.message) : String(err);
    console.error(
      `[ensure-common-node-modules] Failed to create symlink/junction (${type}). ${msg}`,
    );
    console.error(
      `[ensure-common-node-modules] Workaround: enable Windows Developer Mode or run terminal as Administrator, or create the link manually.`,
    );
    process.exitCode = 1;
  }
}

await main();
