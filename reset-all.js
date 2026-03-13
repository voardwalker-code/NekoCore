#!/usr/bin/env node
// reset-all.js — Remove all persistent settings, history, and entity data for a true first run
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const filesToDelete = [
  path.join('memories', 'identity.json'),
  path.join('memories', 'persona.json'),
];
const foldersToDelete = [
  'entities',
  path.join('memories', 'Memory2'),
  path.join('memories', 'archives'),
  path.join('memories', 'dreams'),
  path.join('memories', 'goals'),
  path.join('memories', 'traces'),
];

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  if (fs.lstatSync(target).isDirectory()) {
    fs.readdirSync(target).forEach(f => rmrf(path.join(target, f)));
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

// Delete files
for (const rel of filesToDelete) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    console.log('Deleted', abs);
  }
}
// Delete folders
for (const rel of foldersToDelete) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    rmrf(abs);
    console.log('Deleted', abs);
  }
}
console.log('All persistent data removed. Ready for true first run.');
