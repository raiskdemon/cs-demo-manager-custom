import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire("C:\\Users\\FernandoPC\\.gemini\\antigravity\\scratch\\rea\\package.json");
const asar = require("@electron/asar");

const sourceDir = resolve(import.meta.dirname, "..", "app-extracted");
const outputAsar = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(import.meta.dirname, "..", "build", "app.asar");

await asar.createPackage(sourceDir, outputAsar);
console.log(`Repacked ${sourceDir} -> ${outputAsar}`);
