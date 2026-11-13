// Embute o bundle do esbuild no modelo QML (ver src/qml/Kubik.qml).
// Uso: node tools/embed.mjs <bundle.js> <modelo.qml> <saída.qml> [Nome]
// Nome: o `var` que o bundle define (padrão: Kubik).
import { readFileSync, writeFileSync } from "node:fs";

const [bundlePath, templatePath, outPath, name = "Kubik"] = process.argv.slice(2);
const MARKER = "/* @@KUBIK_BUNDLE@@ */";
const bundle = readFileSync(bundlePath, "utf8");
const template = readFileSync(templatePath, "utf8");
if (template.split(MARKER).length !== 2) throw new Error(`marcador ${MARKER} ausente ou repetido`);
if (!new RegExp(`\\bvar ${name}\\b`).test(bundle)) throw new Error(`o bundle não define \`var ${name}\``);
const header =
  "// GERADO por kubik/tools/embed.mjs a partir de kubik/src. NÃO EDITE.\n";
writeFileSync(outPath, header + template.replace(MARKER, () => bundle.trimEnd()));
