const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceFiles = {
  HTML: [path.join(root, "MD_Manager.html")],
  CSS: [path.join(root, "styles.css")],
  JS: [
    path.join(root, "app.js"),
    ...javascriptFiles(path.join(root, "domain")),
    ...javascriptFiles(path.join(root, "io")),
    ...javascriptFiles(path.join(root, "ui"))
  ]
};

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
    .map(entry => path.join(directory, entry.name))
    .sort();
}

function sourceLines(file, language) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const blockStart = language === "HTML" ? "<!--" : "/*";
  const blockEnd = language === "HTML" ? "-->" : "*/";
  let inBlockComment = false;

  return lines.filter(line => {
    let remainder = line;

    while (remainder.length > 0) {
      if (inBlockComment) {
        const end = remainder.indexOf(blockEnd);
        if (end === -1) return false;
        remainder = remainder.slice(end + blockEnd.length);
        inBlockComment = false;
        continue;
      }

      const start = remainder.indexOf(blockStart);
      if (start === -1) break;
      const end = remainder.indexOf(blockEnd, start + blockStart.length);
      if (end === -1) {
        remainder = remainder.slice(0, start);
        inBlockComment = true;
        break;
      }
      remainder = remainder.slice(0, start) + remainder.slice(end + blockEnd.length);
    }

    const trimmed = remainder.trim();
    return trimmed !== "" && !(language === "JS" && trimmed.startsWith("//"));
  }).length;
}

function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(target);
    return entry.isFile() && /\.(?:test|spec)\.js$/.test(entry.name) ? [target] : [];
  });
}

const counts = Object.fromEntries(Object.entries(sourceFiles).map(([language, files]) => [
  language,
  files.reduce((total, file) => total + sourceLines(file, language), 0)
]));
const tests = testFiles(path.join(root, "tests")).reduce((total, file) => {
  const source = fs.readFileSync(file, "utf8");
  return total + (source.match(/^\s*test(?:\.(?:only|skip|fixme|fail|slow))?\s*\(/gm) || []).length;
}, 0);
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

console.log("Application LoC (without blank and comment-only lines)");
for (const [language, count] of Object.entries(counts)) console.log(`${language.padEnd(5)} ${count}`);
console.log(`${"Total".padEnd(5)} ${total}`);
console.log(`Tests ${tests}`);
