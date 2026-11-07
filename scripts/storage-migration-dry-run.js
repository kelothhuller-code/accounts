#!/usr/bin/env node
/**
 * Dry-run only. Copies a synthetic or caller-supplied JSON store to a backup
 * next to it and prints a migration proposal. It does not convert the file
 * and it refuses the application data directory.
 *
 * Usage: node scripts/storage-migration-dry-run.js /tmp/some-store.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const input = process.argv[2];
if (!input) {
  console.error('Pass a JSON store path. This script does not look up the live database.');
  process.exit(1);
}
const resolved = path.resolve(input);
const liveNames = ['commodity_store.json', 'coffee_store.json'];
const workspaceData = path.resolve(process.cwd(), 'data');
if (resolved.startsWith(workspaceData + path.sep) || liveNames.includes(path.basename(resolved)) && resolved.includes(`${path.sep}data${path.sep}`)) {
  console.error('Refusing a path inside the application data directory. Point this at a temp copy.');
  process.exit(2);
}
if (!resolved.startsWith(os.tmpdir()) && process.env.ALLOW_DRY_RUN_OUTSIDE_TMP !== '1') {
  console.error('Refusing a path outside the temp directory. Set ALLOW_DRY_RUN_OUTSIDE_TMP=1 only for a copy you made yourself.');
  process.exit(2);
}
if (!fs.existsSync(resolved)) {
  console.error('File not found: ' + resolved);
  process.exit(1);
}

const raw = fs.readFileSync(resolved);
const backup = resolved + '.dry-run-backup.json';
fs.copyFileSync(resolved, backup);
const parsed = JSON.parse(raw.toString('utf8'));
const counts = {};
for (const key of Object.keys(parsed)) {
  counts[key] = Array.isArray(parsed[key]) ? parsed[key].length : typeof parsed[key];
}
const proposal = {
  mode: 'dry-run',
  applied: false,
  source: resolved,
  backup,
  bytes: raw.length,
  counts,
  proposal: [
    'Keep the JSON document as the compatible store.',
    'If save time on this file is too high, a future migration can append a journal of changes and compact to JSON on demand.',
    'That migration must take this backup first, run on a copy, and must not be applied to the live store from this script.'
  ]
};
console.log(JSON.stringify(proposal, null, 2));
