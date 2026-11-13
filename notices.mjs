// Writes THIRD-PARTY-NOTICES.md. The extension bundles acorn and its TypeScript
// plugin, so their licenses ship with it, and lists of names read from the type
// files of Drizzle's packages. Packaging runs this, so the file always matches
// the pinned versions.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

function readPackage(name) {
  return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
}

function section(name) {
  const { version, license, author } = readPackage(name);
  const file = readdirSync(`node_modules/${name}`).find((entry) => /^licen[cs]e/i.test(entry));
  const text = file
    ? readFileSync(`node_modules/${name}/${file}`, 'utf8').trim()
    : `${license}, by ${author?.name ?? author}. This package includes no license file.`;
  return `## ${name} ${version}\n\nLicense: ${license}\n\n\`\`\`text\n${text}\n\`\`\``;
}

// The packages scripts/generateShapes.ts reads, as installed under these names.
const DRIZZLE_PACKAGES = [
  'drizzle-orm',
  'drizzle-orm-1',
  'drizzle-kit',
  'drizzle-kit-1',
  'drizzle-zod',
  'drizzle-valibot',
  'drizzle-typebox',
  'drizzle-arktype',
  'drizzle-seed',
];

function drizzleLine(folder) {
  const { name, version, license, author } = readPackage(folder);
  return `- ${name} ${version}, ${license}, by ${author?.name ?? author}`;
}

const intro = `# Third-party notices

Drizzle Marker includes the acorn parser and its TypeScript plugin. Their licenses are below.`;

const drizzle = `## Drizzle's packages

Drizzle Marker includes lists of the names Drizzle's packages export, and of the members, options and strings their values have, read from the packages' type files. None of their code is included. The packages ship no license file of their own, and their package.json files give these licenses:

${DRIZZLE_PACKAGES.map(drizzleLine).join('\n')}`;

writeFileSync(
  'THIRD-PARTY-NOTICES.md',
  [intro, ...['acorn', '@sveltejs/acorn-typescript'].map(section), drizzle].join('\n\n') + '\n',
);
