import { promises as fs } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2";
import { execPowerShell } from "../battlenet/command.js";

const EXPORT_MAGIC = Buffer.from("YBSX1");
const ARGON2_OPTIONS = { t: 3, m: 65536, p: 1, dkLen: 32 } as const;

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function runDpapi(inputPath: string, outputPath: string, operation: "Protect" | "Unprotect"): Promise<void> {
  await execPowerShell([
    "Add-Type -AssemblyName System.Security",
    `$input = [System.IO.File]::ReadAllBytes(${quotePowerShell(inputPath)})`,
    `$output = [System.Security.Cryptography.ProtectedData]::${operation}($input, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    `[System.IO.File]::WriteAllBytes(${quotePowerShell(outputPath)}, $output)`
  ].join("; "));
}

export async function protectFileWithDpapi(inputPath: string, outputPath: string): Promise<void> {
  await runDpapi(inputPath, outputPath, "Protect");
}

export async function unprotectFileWithDpapi(inputPath: string, outputPath: string): Promise<void> {
  await runDpapi(inputPath, outputPath, "Unprotect");
}

function deriveKey(password: string, salt: Buffer): Buffer {
  if (password.length < 12) {
    throw new Error("导出密码至少需要 12 个字符。");
  }
  return Buffer.from(argon2id(Buffer.from(password, "utf8"), salt, ARGON2_OPTIONS));
}

export async function encryptFileWithPassword(inputPath: string, outputPath: string, password: string): Promise<void> {
  const plaintext = await fs.readFile(inputPath);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = deriveKey(password, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const header = Buffer.from(JSON.stringify({ version: 1, kdf: "Argon2id", ...ARGON2_OPTIONS, salt: salt.toString("base64"), nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64") }), "utf8");
    const headerLength = Buffer.alloc(4);
    headerLength.writeUInt32BE(header.length);
    await fs.writeFile(outputPath, Buffer.concat([EXPORT_MAGIC, headerLength, header, ciphertext]));
  } finally {
    key.fill(0);
  }
}

export async function decryptFileWithPassword(inputPath: string, outputPath: string, password: string): Promise<void> {
  const payload = await fs.readFile(inputPath);
  if (payload.subarray(0, EXPORT_MAGIC.length).compare(EXPORT_MAGIC) !== 0) {
    throw new Error("不是受支持的加密导出文件。");
  }
  const headerLength = payload.readUInt32BE(EXPORT_MAGIC.length);
  const headerStart = EXPORT_MAGIC.length + 4;
  const header = JSON.parse(payload.subarray(headerStart, headerStart + headerLength).toString("utf8")) as { kdf: string; t: number; m: number; p: number; dkLen: number; salt: string; nonce: string; tag: string };
  if (header.kdf !== "Argon2id" || header.dkLen !== 32) {
    throw new Error("不支持的导出文件加密参数。");
  }
  const key = deriveKey(password, Buffer.from(header.salt, "base64"));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(header.tag, "base64"));
    await fs.writeFile(outputPath, Buffer.concat([decipher.update(payload.subarray(headerStart + headerLength)), decipher.final()]));
  } catch {
    throw new Error("密码错误或导出文件已损坏。");
  } finally {
    key.fill(0);
  }
}
