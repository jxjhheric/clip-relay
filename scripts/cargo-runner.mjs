import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function quote(arg) {
  if (arg === "") return '""';
  if (!/[\s"]/u.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}

function resolveCargo() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    const candidate = join(home, ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "cargo.exe" : "cargo";
}

function resolveVcVars() {
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    join(pf86, "Microsoft Visual Studio", "2022", "BuildTools", "VC", "Auxiliary", "Build", "vcvars64.bat"),
    join(pf86, "Microsoft Visual Studio", "2022", "Community", "VC", "Auxiliary", "Build", "vcvars64.bat"),
    join(pf86, "Microsoft Visual Studio", "2022", "Professional", "VC", "Auxiliary", "Build", "vcvars64.bat"),
    join(pf86, "Microsoft Visual Studio", "2022", "Enterprise", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

const cargo = resolveCargo();
const cargoArgs = process.argv.slice(2);
if (cargoArgs.length === 0) {
  console.error("Usage: node scripts/cargo-runner.mjs <cargo-args...>");
  process.exit(1);
}

let child;
if (process.platform === "win32") {
  const vcvars = resolveVcVars();
  const command = vcvars
    ? `${quote(vcvars)} >nul && ${quote(cargo)} ${cargoArgs.map(quote).join(" ")}`
    : `${quote(cargo)} ${cargoArgs.map(quote).join(" ")}`;
  child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
    stdio: "inherit",
    env: process.env,
  });
} else {
  child = spawn(cargo, cargoArgs, {
    stdio: "inherit",
    env: process.env,
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
