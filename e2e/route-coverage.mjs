import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(repoRoot, 'src', 'app');
const testsRoot = path.join(repoRoot, 'e2e', 'tests');

const childModules = [
  {
    parent: '/admin',
    file: path.join(srcRoot, 'modules', 'admin', 'admin.module.ts'),
    includeEmptyPath: false,
  },
  {
    parent: '/staff',
    file: path.join(srcRoot, 'modules', 'staff', 'staff.module.ts'),
    includeEmptyPath: false,
  },
  {
    parent: '/payment',
    file: path.join(srcRoot, 'modules', 'payment', 'payment.module.ts'),
    includeEmptyPath: true,
  },
];

const dynamicSamples = new Map([
  ['/otp/:option/:phoneno', '/otp/register/0812345678'],
  ['/staff/boarding/:scheduleId', '/staff/boarding/e2e-schedule-id'],
]);

const rootRoutesWithChildManifests = new Set(['/admin', '/staff', '/payment']);

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function toRoute(parent, routePath) {
  const pathPart = routePath.trim();

  if (pathPart === '') {
    return parent || '/';
  }

  return `${parent}/${pathPart}`.replace(/\/+/g, '/');
}

function routeToRegex(routePath) {
  const escaped = routePath
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        return '[^/]+';
      }

      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return new RegExp(`^${escaped}$`);
}

function normalizeEvidencePath(value) {
  const cleaned = value
    .replace(/^\*\*/, '')
    .replace(/\*\*$/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

  return cleaned === '' ? '/' : cleaned;
}

function extractPathFromLine(line) {
  const routeCall =
    line.includes('page.goto') ||
    line.includes('waitForURL') ||
    line.includes('toHaveURL') ||
    line.includes('toContain') ||
    line.includes('startsWith');

  if (!routeCall) {
    return [];
  }

  const paths = [];
  const literalPattern = /(['"`])((?:\*\*)?\/(?!api\/|private\/|assets\/|images\/|icons\/)[^'"`)\s]*)\1/g;
  let match;

  while ((match = literalPattern.exec(line)) !== null) {
    paths.push(normalizeEvidencePath(match[2]));
  }

  return paths;
}

function routeFromPath(parent, routePath) {
  const path = toRoute(parent, routePath);

  return {
    path,
    sample: dynamicSamples.get(path) ?? path,
    source: null,
    evidence: [],
  };
}

function extractRoutePaths(filePath, parent = '', options = {}) {
  const includeEmptyPath = options.includeEmptyPath ?? true;
  const text = readText(filePath);
  const routes = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const pathMatch = line.match(/\bpath:\s*['"]([^'"]*)['"]/);
    if (!pathMatch || line.includes('redirectTo')) {
      return;
    }

    const pathValue = pathMatch[1];
    if (pathValue === '**') {
      return;
    }

    if (pathValue === '' && !includeEmptyPath) {
      return;
    }

    const route = routeFromPath(parent, pathValue);
    route.source = `${path.relative(repoRoot, filePath)}:${index + 1}`;
    routes.push(route);
  });

  return routes;
}

function collectAppRoutes() {
  const rootRoutes = extractRoutePaths(path.join(srcRoot, 'app-routing.module.ts'))
    .filter((route) => !rootRoutesWithChildManifests.has(route.path));

  const childRoutes = childModules.flatMap(({ parent, file, includeEmptyPath }) =>
    extractRoutePaths(file, parent, { includeEmptyPath })
  );

  const unique = new Map();
  for (const route of [...rootRoutes, ...childRoutes]) {
    unique.set(route.path, route);
  }

  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectE2eEvidence() {
  const evidence = [];

  for (const file of walkFiles(testsRoot)) {
    const relativeFile = path.relative(repoRoot, file);
    readText(file)
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const routePath of extractPathFromLine(line)) {
          evidence.push({
            path: routePath,
            source: `${relativeFile}:${index + 1}`,
          });
        }
      });
  }

  return evidence;
}

function attachCoverage(routes, evidence) {
  for (const route of routes) {
    const matcher = routeToRegex(route.path);
    route.evidence = evidence.filter((item) => matcher.test(item.path));
  }
}

function formatRoute(route) {
  const evidence = route.evidence.length
    ? ` covered by ${route.evidence.map((item) => item.source).join(', ')}`
    : ` source ${route.source}`;

  const sample = route.sample !== route.path ? ` (sample: ${route.sample})` : '';

  return `- ${route.path}${sample}: ${evidence}`;
}

const routes = collectAppRoutes();
const evidence = collectE2eEvidence();
attachCoverage(routes, evidence);

const verbose = process.argv.includes('--verbose');
const coveredRoutes = routes.filter((route) => route.evidence.length > 0);
const missingRoutes = routes.filter((route) => route.evidence.length === 0);

console.log(`E2E route coverage: ${coveredRoutes.length}/${routes.length} routes have Playwright navigation evidence.`);

if (missingRoutes.length > 0) {
  console.log('\nRoutes without E2E navigation evidence:');
  for (const route of missingRoutes) {
    console.log(formatRoute(route));
  }
} else {
  console.log('\nAll discovered routes have E2E navigation evidence.');
}

if (verbose && coveredRoutes.length > 0) {
  console.log('\nCovered routes:');
  for (const route of coveredRoutes) {
    console.log(formatRoute(route));
  }
}

if (missingRoutes.length > 0 && process.argv.includes('--fail-on-missing')) {
  process.exitCode = 1;
}
