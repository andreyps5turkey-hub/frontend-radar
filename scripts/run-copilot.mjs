import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const instructions = await readFile(new URL("../.github/prompts/digest.md", import.meta.url), "utf8");
const prompt = `${instructions}\n\nThe candidate data is in data/candidates.json. Start now.`;

const child = spawn("copilot", [
  "-p",
  prompt,
  "--no-ask-user",
  "--disable-builtin-mcps",
  "--disallow-temp-dir",
  "--available-tools=view,edit,create",
  "--allow-tool=write(data/digest.json)",
], {
  env: process.env,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  throw new Error(`Copilot CLI exited with code ${exitCode}.`);
}
