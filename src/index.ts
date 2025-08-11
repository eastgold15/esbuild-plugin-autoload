import fs from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";

export const IS_BUN = typeof Bun !== "undefined";

const DEFAULT_PATTERN = "**/*.{ts,tsx,js,jsx,mjs,cjs}";
const DEFAULT_DIRECTORY = "./example/routes";

// 正则表达式常量
// 匹配 @gramio/autoload 或 GRAMIO/autoload
const GRAMIO_FILTER = /(.*)(@gramio|GRAMIO)[/\\]autoload[/\\]dist[/\\]index\.(js|mjs|cjs)$/i;
// 匹配 elysia-autoload 或 ELYSIA/autoload
// const ELYSIA_FILTER = /(.*)elysia-autoload(\/|\\)dist(\/|\\)index\.(js|mjs|cjs)/i;
const ELYSIA_FILTER = /(.*)elysia-autoload(-[a-z]{2})?(\/|\\)dist(\/|\\)index\.(js|mjs|cjs)/i;
if (!IS_BUN && !fs.globSync) throw new Error("Node@>=22 or Bun is required");

export function globSync(
  globPatterns: string | string[],
  globOptions: { cwd?: string } = {}
) {
  const patterns = Array.isArray(globPatterns) ? globPatterns : [globPatterns];
  const options = globOptions;

  if (IS_BUN) {
    // Bun 环境下使用 Bun.Glob
    const allFiles = new Set<string>();
    // 🔹 Step 1: 先处理所有正常的包含模式
    const includePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));
    for (const pattern of includePatterns) {
      const glob = new Bun.Glob(pattern);
      for (const file of glob.scanSync({ cwd: options.cwd })) {
        allFiles.add(file);
      }
    }

    // 🔹 Step 2: 再处理所有否定模式（即以 ! 开头的排除模式）
    const excludePatterns = patterns.filter((pattern) => pattern.startsWith('!'));
    for (const pattern of excludePatterns) {
      const actualPattern = pattern.slice(1); // 去掉 !
      const glob = new Bun.Glob(actualPattern);
      for (const file of glob.scanSync({ cwd: options.cwd })) {
        allFiles.delete(file);
      }
    }

    return Array.from(allFiles);
  } else {
    // Node.js 环境逻辑（类似处理，先包含后排除）
    const allFiles = new Set<string>();
    const includePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));
    const excludePatterns = patterns.filter((pattern) => pattern.startsWith('!'));

    for (const pattern of includePatterns) {
      const files = fs.globSync(pattern, { cwd: options.cwd });
      for (const file of files) {
        allFiles.add(file);
      }
    }

    for (const pattern of excludePatterns) {
      const actualPattern = pattern.slice(1);
      const files = fs.globSync(actualPattern, { cwd: options.cwd });
      for (const file of files) {
        allFiles.delete(file);
      }
    }

    return Array.from(allFiles);
  }
}

export interface AutoloadOptions {
  pattern?: string | string[];
  directory?: string;
  debug?: boolean;
}

const fsUsageMock = /* ts */ `{
    default: {
        existsSync() {
            return true;
        },
        statSync() {
            return {
                isDirectory() {
                    return true;
                }
            }
        }
    }
}`;

export function autoload(options?: AutoloadOptions): BunPlugin;
export function autoload(options?: string): BunPlugin;
export function autoload(options?: AutoloadOptions | string) {
  const pattern =
    typeof options === "object"
      ? (options?.pattern ?? DEFAULT_PATTERN)
      : DEFAULT_PATTERN;
  const directory =
    typeof options === "object"
      ? (options?.directory ?? DEFAULT_DIRECTORY)
      : options ?? DEFAULT_DIRECTORY;

  const debug =
    typeof options === "object"
      ? options?.debug ?? false
      : false;

  return {
    name: "autoload",
    setup(build) {
      console.info("🚀 Autoload plugin setup started with debug:", debug);
      // 处理 @gramio/autoload 库的构建时转换
      build.onLoad(
        {
          filter: GRAMIO_FILTER
        },
        async (args) => {
          console.info("🔍 GRAMIO Filter matched file:", args.path);
          console.info("args", args);
          console.info("args.path", args.path);

          let content = String(await fs.promises.readFile(args.path));
          const files = globSync(pattern, { cwd: directory });

          // 生成静态导入映射
          const fileImports = files
            .map((file) => {
              const absolutePath = path.resolve(directory, file).replace(/\\/gi, "\\\\");
              return `"${file}": await import("${absolutePath}")`;
            })
            .join(",\n                            ");

          // 替换 autoload 函数，注入静态文件源
          content = content.replace(
            "autoload(options) {",
            `autoload(options) {
                        const fileSources = {
                            ${fileImports}
                        }`
          );

          // 替换动态文件获取为静态映射查找
          content = content.replace(
            /const file = (.*);/i,
            "const file = fileSources[filePath];"
          );

          // 移除动态扫描依赖
          content = content
            .replace("var fdir = require('fdir');", "")
            .replace('import { fdir } from "fdir";', "");

          // 替换路径数组为静态列表
          const pathsList = files.map((file) => `"${file}"`).join(", ");
          content = content.replace(
            /const paths = ([\s\S]*?);/m,
            `const paths = [${pathsList}];`
          );

          if (debug) {
            console.log("Transformed GRAMIO content:", content);
          }

          return { contents: content };
        }
      );

      // 处理 elysia-autoload 库的构建时转换
      build.onLoad(
        {
          filter: ELYSIA_FILTER
        },
        async (args) => {
          console.info("🔍 ELYSIA Filter matched file:", args.path);
          if (debug) {
            console.info("Processing ELYSIA autoload:", args.path);
          }

          let content = String(await fs.promises.readFile(args.path));
          const files = globSync(pattern, { cwd: directory });

          // 替换动态文件扫描为静态文件列表
          const filesList = files.map((file) => `"${file.replace(/\\/g, "/")}"`).join(", ");
          content = content.replace(
            "let files = globSync(globPattern, globOptions);",
            `let files = [${filesList}];`
          );

          // 替换 fs 模块为模拟实现
          content = content.replace(
            `import fs from 'node:fs';`,
            `var { default: fs} = ${fsUsageMock}`
          );

          // 生成静态导入映射
          const fileImports = files
            .map((file) => {
              // const absolutePath = path.resolve(directory, file).replace(/\/gi, "\\\\");
              const absolutePath = path.resolve(directory, file).replace(/\\/g, "/");
              const normalizedFile = file.replace(/\\/g, "/");
              return `"${normalizedFile}": await import("${absolutePath}")`;
            })
            .join(",\n                            ");

          // 替换 autoload 函数，注入静态文件源
          content = content.replace(
            "autoload(options = {}) {",
            `autoload(options = {}) {
                        const fileSources = {
                            ${fileImports}
                        }`
          );

          // 替换动态文件获取为静态映射查找
          content = content.replace(
            /const file = (.*);/i,
            "const file = fileSources[filePath];"
          );

          if (debug) {
            console.log("Transformed ELYSIA content:", content);
          }

          return { contents: content };
        }
      );
    }
  } satisfies BunPlugin;
}

export default autoload;