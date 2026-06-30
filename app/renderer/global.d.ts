import type { DesktopApi } from "./bridge/api.js";

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export {};
