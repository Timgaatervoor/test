import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Heuristics, not a claim that an unknown real key can be identified.
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:STAMHOOFD_API_KEY|SYNC_ACCESS_TOKEN)\s*[:=]\s*['"][A-Za-z0-9_+/=-]{32,}['"]/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
];
const failures = [];
const check = (label, content) => { if (patterns.some(p => p.test(content))) failures.push(label); };
const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
};
let files = git('ls-files', '--cached', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean);
if (!files.length) {
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk('.');
}
for (const file of files) {
  if (/\.(?:ts|tsx|js|mjs|json|toml|md|ya?ml)$/.test(file)) check(file, readFileSync(file, 'utf8'));
}
let blobs = 0;
for (const entry of git('rev-list', '--objects', '--all').split(/\r?\n/).filter(Boolean)) {
  const [id, ...path] = entry.split(' ');
  if (!/\.(?:ts|tsx|js|mjs|json|toml|md|ya?ml|env)$/.test(path.join(' '))) continue;
  check(`history:${id}`, git('cat-file', 'blob', id)); blobs++;
}
let assets = 0;
function scanBuild(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) scanBuild(path);
    else if (/\.(?:js|css|html|json|map)$/.test(name)) {
      const content = readFileSync(path, 'utf8'); check(path, content); assets++;
      if (content.includes('STAMHOOFD_API_KEY') || content.includes('test-upstream-placeholder') || content.includes('BUILD_ONLY_STAMHOOFD_LEAK_SENTINEL')) failures.push(path);
    }
  }
}
scanBuild('dist');
if (failures.length) {
  console.error('Mogelijke secrets gevonden (waarden worden niet getoond):', [...new Set(failures)]);
  process.exitCode = 1;
} else console.log(`Geen secretpatronen gevonden: ${files.length} bestanden, ${blobs} historische blobs, ${assets} buildbestanden. Geen echte API-key beschikbaar voor exacte vergelijking.`);
