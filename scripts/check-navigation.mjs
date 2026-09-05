import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "src", "app");
const sourceRoot = path.join(root, "src");

function walk(directory, predicate) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(fullPath, predicate));
    else if (predicate(fullPath)) results.push(fullPath);
  }
  return results;
}

const routes = walk(appRoot, (file) => file.endsWith(`${path.sep}page.tsx`)).map((file) => {
  const relative = path.relative(appRoot, path.dirname(file));
  return relative ? `/${relative.split(path.sep).join("/")}` : "/";
});

function matchesRoute(target) {
  const targetParts = target.split("/").filter(Boolean);
  return routes.some((route) => {
    const routeParts = route.split("/").filter(Boolean);
    if (routeParts.length !== targetParts.length) return false;
    return routeParts.every((part, index) => part.startsWith("[") || part === targetParts[index]);
  });
}

const sourceFiles = walk(sourceRoot, (file) => /\.(?:ts|tsx)$/.test(file));
const missing = new Map();
const hrefPattern = /href\s*[:=]\s*["'](\/[^"'?#${\s]*)/g;

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(hrefPattern)) {
    const href = match[1] || "/";
    if (href.startsWith("/api/") || matchesRoute(href)) continue;
    const locations = missing.get(href) ?? [];
    locations.push(path.relative(root, file));
    missing.set(href, locations);
  }
}

if (missing.size > 0) {
  console.error("Internal navigation targets without an App Router page:");
  for (const [href, files] of missing) console.error(`- ${href}: ${[...new Set(files)].join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Navigation check passed: ${routes.length} pages and ${sourceFiles.length} source files inspected.`);
}
