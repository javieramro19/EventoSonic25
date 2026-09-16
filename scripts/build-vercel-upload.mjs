import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, ".vercel-upload");
const expectedDirectory = resolve(join(projectRoot, ".vercel-upload"));

if (outputDirectory !== expectedDirectory || !outputDirectory.startsWith(`${projectRoot}\\`)) {
  throw new Error("Directorio de despliegue no válido.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const files = [
  "index.html",
  "panel.html",
  "plan-esencial.html",
  "plan-premium.html",
  "plan-total.html",
  "site.webmanifest",
  "package.json",
  "vercel.json"
];
const directories = ["css", "images", "js", "partials"];

for (const file of files) {
  await cp(join(projectRoot, file), join(outputDirectory, file));
}
for (const directory of directories) {
  await cp(join(projectRoot, directory), join(outputDirectory, directory), { recursive: true });
}

await mkdir(join(outputDirectory, "api"), { recursive: true });
await cp(join(projectRoot, "api", "config.js"), join(outputDirectory, "api", "config.js"));
await cp(join(projectRoot, "api", "requests.js"), join(outputDirectory, "api", "requests.js"));
await cp(join(projectRoot, "api", "workers.js"), join(outputDirectory, "api", "workers.js"));

await mkdir(join(outputDirectory, ".vercel"), { recursive: true });
await cp(join(projectRoot, ".vercel", "project.json"), join(outputDirectory, ".vercel", "project.json"));

console.log(`Despliegue preparado en ${outputDirectory}`);
