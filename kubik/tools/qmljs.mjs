// Transforma um bundle ESM do esbuild num .js importável pelo QML
// (`import "logic.js" as Logic` → Logic.<Nome>.<export>).
// Uso: node tools/qmljs.mjs <bundle-esm.js> <Nome> <saída.js>
//
// Por que não o formato iife com --global-name: ele registra os exports com
// getters NO INÍCIO do arquivo, antes das declarações, e o QML avisa
// "Variable ... is used before its declaration" a cada carga (no journal do
// usuário). Aqui o objeto é montado no FIM, com tudo já declarado.
import { readFileSync, writeFileSync } from "node:fs";

const [inPath, name, outPath] = process.argv.slice(2);
const src = readFileSync(inPath, "utf8");
const m = src.match(/\nexport\s*\{([^}]*)\};?\s*$/);
if (!m) throw new Error("bundle sem o `export { … }` final do esbuild (use --format=esm)");
const body = src.slice(0, m.index);
if (/^\s*(import|export)\b/m.test(body)) throw new Error("import/export no meio do bundle");
const fields = m[1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [local, exported] = s.split(/\s+as\s+/);
    return `  ${exported ?? local}: ${local}`;
  });
const header = `// GERADO por esbuild + kubik/tools/qmljs.mjs a partir de kubik/src/tray. NÃO EDITE.\n`;
writeFileSync(outPath, `${header}${body.trimEnd()}\nvar ${name} = {\n${fields.join(",\n")}\n};\n`);
