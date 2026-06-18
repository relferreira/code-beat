import { appendFileSync } from "node:fs";
import { EOL } from "node:os";

export function getInput(name: string, options?: { required?: boolean }): string {
  const envName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = process.env[envName]?.trim() ?? "";

  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`);
  }

  return value;
}

export function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}<<CODE_BEAT_OUTPUT${EOL}${value}${EOL}CODE_BEAT_OUTPUT${EOL}`);
    return;
  }

  console.log(`${name}=${value}`);
}

export function setFailed(message: string): void {
  process.exitCode = 1;
  console.error(`::error::${escapeCommand(message)}`);
}

function escapeCommand(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
