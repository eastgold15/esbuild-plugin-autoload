import { $ } from "bun";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  target: "bun",
  outdir: "./dist",
  sourcemap: 'inline'
}).then(console.log);

await $`./node_modules/.bin/tsc --emitDeclarationOnly`;
