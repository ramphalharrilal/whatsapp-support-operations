import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const requiredPaths = [
  "README.md",
  "package.json",
  "src/application/supportEngine.js",
  "src/infrastructure/whatsappWebhook.js",
  "src/security/privacy.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "test/supportEngine.test.js",
  "test/whatsappWebhook.test.js",
  "test/server.test.js",
  "docs/architecture.md",
  "docs/security-and-privacy.md",
  "docs/product-case-study.md",
  "docs/operations-runbook.md",
  "docs/relaydesk-dashboard.svg",
  "openapi.yaml",
  ".github/workflows/ci.yml"
];
const textExtensions = new Set([".js", ".json", ".md", ".html", ".css", ".yaml", ".yml", ".svg"]);
const placeholderWords = ["TO" + "DO", "T" + "BD", "FIX" + "ME", "LOREM" + " IPSUM"];
const placeholderPattern = new RegExp(`\\b(?:${placeholderWords.join("|")})\\b`, "i");
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bEAA[A-Za-z0-9]{40,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/
];
const markdownLinkPattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
const htmlAssetPattern = /\b(?:src|href)=["']([^"']+)["']/g;

const errors = [];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    errors.push(`Missing required artifact: ${path}`);
  }
}

const files = walk(root).filter((path) => textExtensions.has(extname(path)));
for (const path of files) {
  const text = readFileSync(path, "utf8");
  const label = relative(root, path);
  if (placeholderPattern.test(text)) {
    errors.push(`Unfinished placeholder in ${label}`);
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      errors.push(`Possible committed secret in ${label}: ${pattern}`);
    }
  }
  if (extname(path) === ".md") {
    validateMarkdownLinks(path, text);
  }
  if (extname(path) === ".html") {
    validateHtmlAssets(path, text);
  }
}

const JavaScriptFiles = files.filter((path) => extname(path) === ".js");
for (const path of JavaScriptFiles) {
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (check.status !== 0) {
    errors.push(`JavaScript syntax check failed for ${relative(root, path)}: ${check.stderr.trim()}`);
  }
}

const packageData = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["start", "test", "validate", "check"]) {
  if (!packageData.scripts?.[script]) {
    errors.push(`package.json is missing the ${script} script`);
  }
}
if (Object.keys(packageData.dependencies ?? {}).length > 0) {
  errors.push("Runtime dependencies were added; document and review the supply-chain change");
}

if (errors.length) {
  console.error("Repository validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Repository validation passed: ${files.length} text assets and ${JavaScriptFiles.length} JavaScript files checked.`
);

function validateMarkdownLinks(path, text) {
  for (const match of text.matchAll(markdownLinkPattern)) {
    const target = match[1].trim().split(/\s+/)[0].split("#")[0];
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) {
      continue;
    }
    const resolved = resolve(join(path, ".."), decodeURIComponent(target));
    if (!resolved.startsWith(root) || !existsSync(resolved)) {
      errors.push(`Broken or unsafe link in ${relative(root, path)}: ${target}`);
    }
  }
}

function validateHtmlAssets(path, text) {
  for (const match of text.matchAll(htmlAssetPattern)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) {
      continue;
    }
    const relativeTarget = target.startsWith("/") ? target.slice(1) : target;
    const resolved = target.startsWith("/")
      ? resolve(root, "public", relativeTarget)
      : resolve(join(path, ".."), relativeTarget);
    if (!resolved.startsWith(root) || !existsSync(resolved)) {
      errors.push(`Missing HTML asset in ${relative(root, path)}: ${target}`);
    }
  }
}

function walk(directory) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "coverage"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walk(path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}
