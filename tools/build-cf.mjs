// Cloudflare 배포용 정적 파일 모음: public + shared → cf-dist (게임 코드는 묶고 난독화), 보안 헤더(_headers) 추가
import { cpSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "cf-dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });
cpSync(join(root, "shared"), join(out, "shared"), { recursive: true });
// 버전 표시: 배포마다 달라져서 접속 중인 사람에게 자동 업데이트를 알림
let ver = process.env.WORKERS_CI_COMMIT_SHA || "";
if (!ver) try { ver = (await import("node:child_process")).execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch {}
if (!ver) ver = String(Date.now());
ver = ver.slice(0, 12) + "-" + Date.now().toString(36);
writeFileSync(join(out, "js", "version.js"), `// 자동 생성\nexport const VERSION = "${ver}";\n`);

// ── 소스 보호: 게임 코드를 한 파일로 묶고 압축 + 난독화. 원본 파일(js/*, shared/*)은 배포본에서 지움 ──
// (브라우저가 실행하는 코드는 원리상 100% 숨길 수 없음. 대신 읽고 고치기 매우 어렵게 만들고, 판정은 전부 서버가 함)
const { build } = await import("esbuild");
const JO = (await import("javascript-obfuscator")).default;
const bundles = {};
for (const name of ["main", "gm"]) {
  const r = await build({
    entryPoints: [join(out, "js", name + ".js")], bundle: true, format: "esm", target: "es2022", minify: true,
    write: false, legalComments: "none", sourcemap: false, charset: "utf8", logLevel: "error",
    plugins: [{ name: "paths", setup(b) {
      b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: join(root, a.path) }));
      b.onResolve({ filter: /^\/vendor\// }, (a) => ({ path: a.path, external: true }));
    } }],
  });
  const code = r.outputFiles[0].text;
  bundles[name] = JO.obfuscate(code, {
    target: "browser", compact: true, sourceMap: false, seed: 7,
    identifierNamesGenerator: "hexadecimal", renameGlobals: false,
    stringArray: true, stringArrayThreshold: 0.6, stringArrayRotate: true, stringArrayShuffle: true,
    stringArrayIndexShift: true, stringArrayWrappersCount: 1, stringArrayWrappersType: "variable",
    // 느려지는 옵션은 끔 (게임이 초당 60번 그려야 해서)
    controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
    numbersToExpressions: false, splitStrings: false, transformObjectKeys: false, unicodeEscapeSequence: false,
  }).getObfuscatedCode();
}
rmSync(join(out, "js"), { recursive: true, force: true });
rmSync(join(out, "shared"), { recursive: true, force: true });
mkdirSync(join(out, "js"), { recursive: true });
for (const [name, code] of Object.entries(bundles)) writeFileSync(join(out, "js", name + ".js"), code);
writeFileSync(join(out, "js", "version.js"), `export const VERSION = "${ver}";\n`);
writeFileSync(join(out, "_headers"), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=15552000

# 글꼴은 파일 이름이 바뀔 때만 내용이 바뀜 → 30일 보관 (재접속·자동 업데이트 때 다시 안 받음)
/fonts/*
  Cache-Control: public, max-age=2592000, immutable

# 이펙트 그림(pixelfx)은 거의 안 바뀜 → 7일 보관
/vendor/*
  Cache-Control: public, max-age=604800
`);
console.log("cf-dist ready");
