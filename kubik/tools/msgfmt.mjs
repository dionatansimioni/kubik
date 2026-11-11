// Compila um .po (só msgid/msgstr simples, sem plurais nem contexto) num .mo
// do GNU gettext, sem depender do msgfmt do sistema.
// Uso: node tools/msgfmt.mjs <entrada.po> <saída.mo>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [inPath, outPath] = process.argv.slice(2);
const unquote = (s) => JSON.parse(s.replace(/\\'/g, "'"));
const entries = new Map();
let cur = null;
let field = null;
for (const raw of readFileSync(inPath, "utf8").split("\n")) {
  const line = raw.trim();
  if (line === "" || line.startsWith("#")) continue;
  let m;
  if ((m = line.match(/^msgid\s+(".*")$/))) {
    if (cur) entries.set(cur.id, cur.str);
    cur = { id: unquote(m[1]), str: "" };
    field = "id";
  } else if ((m = line.match(/^msgstr\s+(".*")$/))) {
    cur.str = unquote(m[1]);
    field = "str";
  } else if (line.startsWith('"') && cur) {
    cur[field] += unquote(line);
  } else throw new Error(`linha não suportada: ${raw}`);
}
if (cur) entries.set(cur.id, cur.str);

const keys = [...entries.keys()].sort();
const enc = (s) => Buffer.from(s, "utf8");
const ids = keys.map(enc);
const strs = keys.map((k) => enc(entries.get(k)));
const n = keys.length;
const headerSize = 28;
const origTable = headerSize;
const transTable = origTable + n * 8;
let offset = transTable + n * 8;
const table = Buffer.alloc(n * 16);
const blobs = [];
const place = (bufs, base) =>
  bufs.forEach((b, i) => {
    table.writeUInt32LE(b.length, base + i * 8);
    table.writeUInt32LE(offset, base + i * 8 + 4);
    blobs.push(b, Buffer.from([0]));
    offset += b.length + 1;
  });
place(ids, 0);
place(strs, n * 8);
const header = Buffer.alloc(headerSize);
header.writeUInt32LE(0x950412de, 0);
header.writeUInt32LE(0, 4);
header.writeUInt32LE(n, 8);
header.writeUInt32LE(origTable, 12);
header.writeUInt32LE(transTable, 16);
header.writeUInt32LE(0, 20);
header.writeUInt32LE(0, 24);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([header, table, ...blobs]));
