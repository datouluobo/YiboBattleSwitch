import { app } from "electron";
import path from "node:path";

export function resolveAppPath(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments);
}
