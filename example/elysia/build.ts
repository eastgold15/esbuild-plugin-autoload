import autoload from "../../src";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "dist",
  target: "bun",
  plugins: [
    autoload({
      pattern: "**/*.{ts,tsx,js,jsx,mjs,cjs}",
      directory: process.cwd() + "/src/routes",
      debug: true
    }),
  ],
  sourcemap: 'inline'
}).then(console.log);


await Bun.$`bun build --compile dist/index.js`;