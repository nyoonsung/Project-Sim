// Cloudflare 배포용 정적 파일 모음: public + shared → cf-dist, 보안 헤더(_headers) 추가
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
