// 링크 데모 진입점
import { LocalNet } from "./local-net.js";
import { FX } from "./fx-registry.js";
globalThis.__FX_REGISTRY = FX;
globalThis.__LOCAL_NET = LocalNet;
await import("../public/js/main.js");
