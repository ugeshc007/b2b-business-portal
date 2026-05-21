import { spawn } from "node:child_process";

const commands = [
  ["API", "npm", ["run", "dev"]],
  ["WEB", "npm", ["run", "web"]],
] as const;

for (const [label, command, args] of commands) {
  const child = spawn(command, args, { shell: true, stdio: "pipe" });
  child.stdout.on("data", (data) => process.stdout.write(`[${label}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${label}] ${data}`));
  child.on("exit", (code) => process.exitCode = code ?? 0);
}
