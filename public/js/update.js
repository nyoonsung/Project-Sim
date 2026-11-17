// 자동 업데이트: 새 버전이 올라오면 마을에 있는 사람은 바로 새로고침,
// 던전에 있는 사람은 진행이 날아가지 않게 마을로 돌아오는 순간 새로고침
import { VERSION } from "./version.js";

let pending = false, notified = false, reloading = false;

export async function latestVersion() {
  try {
    const t = await (await fetch("/js/version.js?t=" + Date.now(), { cache: "no-store" })).text();
    return /VERSION = "([^"]+)"/.exec(t)?.[1] ?? null;
  } catch { return null; }
}

export function reloadNow(show) {
  if (reloading) return;
  reloading = true;
  show?.("새 버전으로 업데이트하는 중...");
  setTimeout(() => location.reload(), 1200);
}

/** 1분마다 새 버전 확인 */
export function watchUpdates({ inTown, show, notice }) {
  if (VERSION === "dev") return;
  const check = async () => {
    if (pending || reloading) return;
    const v = await latestVersion();
    if (!v || v === VERSION) return;
    pending = true;
    if (inTown()) reloadNow(show);
    else if (!notified) { notified = true; notice("새 업데이트가 나왔어요! 마을로 돌아가면 자동으로 적용돼요."); }
  };
  setInterval(check, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}

/** 마을에 들어올 때 호출: 기다리던 업데이트가 있으면 적용 */
export function onTown(show) { if (pending) reloadNow(show); }

/** 연결이 끊겼을 때(배포하면 서버가 다시 시작됨): 서버가 다시 살아나면 자동으로 새로고침 */
export function autoReconnect(setMsg) {
  let wait = 1500;
  const tryIt = async () => {
    setMsg("서버에 다시 연결하는 중...");
    const v = await latestVersion();
    if (v) return reloadNow(setMsg);
    wait = Math.min(10_000, wait * 1.6);
    setTimeout(tryIt, wait);
  };
  setTimeout(tryIt, wait);
}
