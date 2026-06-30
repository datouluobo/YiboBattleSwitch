import { execFile } from "node:child_process";

export function execCommand(command: string, args: string[] = []): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function execPowerShell(script: string): Promise<{ stdout: string; stderr: string }> {
  return execCommand("powershell.exe", ["-NoProfile", "-Command", script]);
}
