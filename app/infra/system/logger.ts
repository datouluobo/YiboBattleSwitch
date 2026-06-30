import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir } from "./fs.js";

type LogLevel = "INFO" | "WARN" | "ERROR";

class AppLogger {
  private logFilePath = "";
  private recent: string[] = [];

  async initialize(logDirectory: string): Promise<void> {
    await ensureDir(logDirectory);
    this.logFilePath = path.join(logDirectory, "main.log");
    await this.info("Logger initialized");
  }

  getRecentLines(): string[] {
    return [...this.recent];
  }

  async info(message: string): Promise<void> {
    await this.write("INFO", message);
  }

  async warn(message: string): Promise<void> {
    await this.write("WARN", message);
  }

  async error(message: string): Promise<void> {
    await this.write("ERROR", message);
  }

  async clear(): Promise<string[]> {
    this.recent = [];
    if (!this.logFilePath) {
      return [];
    }
    await fs.writeFile(this.logFilePath, "", "utf8");
    return [this.logFilePath];
  }

  private async write(level: LogLevel, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    this.recent.push(line);
    if (this.recent.length > 200) {
      this.recent.shift();
    }

    console.log(line);

    if (!this.logFilePath) {
      return;
    }

    await fs.appendFile(this.logFilePath, `${line}\n`, "utf8");
  }
}

export const logger = new AppLogger();
