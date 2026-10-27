import { readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

const bundleDir = "src-tauri/target/aarch64-apple-darwin/release/bundle/macos";
const outDir = "dist";

mkdirSync(outDir, { recursive: true });

const app = readdirSync(bundleDir).find((f) => f.endsWith(".app"));
if (!app) {
  console.error("No .app found in", bundleDir);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const pkgName = `omp-launcher_${version}_aarch64.pkg`;
const dest = join(outDir, pkgName);

execFileSync("pkgbuild", [
  "--component", join(bundleDir, app),
  "--install-location", "/Applications",
  "--scripts", "scripts/pkg-scripts",
  dest,
], { stdio: "inherit" });

console.log("→", dest);
