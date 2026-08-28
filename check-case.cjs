const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const exts = ['.js', '.jsx', '.css'];
const importRegex = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]|require\(['"](\.[^'"]+)['"]\)/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (exts.includes(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const allFiles = walk(SRC);
let problems = 0;

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const rawImport = match[1] || match[2] || match[3];
    let resolved = path.resolve(path.dirname(file), rawImport);

    let candidates = [resolved, resolved + '.js', resolved + '.jsx', resolved + '.css'];
    let found = null;
    for (const c of candidates) {
      const dir = path.dirname(c);
      const base = path.basename(c);
      if (!fs.existsSync(dir)) continue;
      const actualNames = fs.readdirSync(dir);
      const exactMatch = actualNames.find((n) => n === base);
      const caseInsensitiveMatch = actualNames.find((n) => n.toLowerCase() === base.toLowerCase());
      if (exactMatch) { found = 'ok'; break; }
      if (caseInsensitiveMatch) {
        console.log(`MOS EMAS: ${path.relative(__dirname, file)}`);
        console.log(`   import: "${rawImport}"`);
        console.log(`   haqiqiy fayl: "${caseInsensitiveMatch}"`);
        console.log('');
        problems++;
        found = 'mismatch';
        break;
      }
    }
  }
}

console.log(problems === 0 ? 'Muammo topilmadi.' : `Jami ${problems} ta nomuvofiqlik topildi.`);