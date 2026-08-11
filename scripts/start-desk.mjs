import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "codex:bridge"], { stdio: "inherit", env: { ...process.env, XIAOBU_CODEX_BRIDGE_START_PAUSED: "1" } }),
  spawn("npm", ["run", "start"], { stdio: "inherit", env: process.env }),
];

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0) {
      process.stderr.write(`工作台服务异常结束（${signal || code}）\n`);
      shutdown(code || 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
