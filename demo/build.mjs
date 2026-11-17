// 링크(데모) 빌드: 서버 엔진 + 클라이언트를 한 파일로 묶고, 폰트를 CSS에 넣는다
//   node demo/build.mjs  →  demo/dist/
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, ".."), out = join(here, "dist");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "entry.js")], bundle: true, format: "esm", target: "es2022", minify: true, outfile: join(out, "game.js"), legalComments: "eof",
  plugins: [{ name: "paths", setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: join(root, a.path) }));
    b.onResolve({ filter: /(^|\/)db\.js$/ }, (a) => a.importer.includes("/server/") ? { path: join(here, "db-stub.js") } : undefined);
  } }],
});
const font = (f) => `url(data:font/woff2;base64,${readFileSync(join(root, "public/fonts", f)).toString("base64")}) format("woff2")`;
let css = readFileSync(join(root, "public/css/game.css"), "utf8")
  .replace(/url\("\/fonts\/([^"]+)"\) format\("woff2"\)/g, (_, f) => font(f));
writeFileSync(join(out, "game.css"), css);
let html = readFileSync(join(root, "public/index.html"), "utf8")
  .replace('href="/css/game.css"', 'href="game.css"')
  .replace('<script type="module" src="/js/main.js"></script>', '<script type="module" src="game.js"></script>')
  .replace("<title>Project-Sim — 던전 RPG</title>", "<title>Project-Sim — 던전 RPG (데모)</title>");
writeFileSync(join(out, "index.html"), html);
console.log("built", out);
