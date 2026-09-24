import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import path from "node:path";

export interface AstroDevServer {
  stop(): Promise<void>;
}

interface StartOptions {
  repoRoot: string;
  port: number;
  readyUrl: string;
  timeoutMs?: number;
}

function killWhateverIsOnPort(port: number): void {
  let pids = "";
  try {
    pids = execFileSync("lsof", ["-t", `-i:${port}`], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  for (const pidText of pids.split("\n").filter(Boolean)) {
    const pid = Number(pidText);
    if (pid === process.pid || pid === process.ppid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

async function waitForReady(child: ChildProcess, url: string, timeoutMs: number, output: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`astro dev exited with code ${child.exitCode}: ${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`astro dev did not become ready at ${url} within ${timeoutMs}ms: ${output()}`);
}

async function stopChild(child: ChildProcess, port: number): Promise<void> {
  if (child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
  if (child.exitCode === null) child.kill("SIGKILL");
  killWhateverIsOnPort(port);
}

/**
 * Start Astro as the foreground process it is in current Astro versions,
 * retain the child handle, and wait for HTTP readiness. Older browser tests
 * used execFileSync and assumed the CLI detached; that now times out in CI.
 */
export async function startAstroDevServer({
  repoRoot,
  port,
  readyUrl,
  timeoutMs = 30_000,
}: StartOptions): Promise<AstroDevServer> {
  killWhateverIsOnPort(port);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let logs = "";
    const child = spawn(
      path.join(repoRoot, "node_modules", ".bin", "astro"),
      ["dev", "--host", "127.0.0.1", "--port", String(port)],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout?.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-8_000);
    });
    child.stderr?.on("data", (chunk) => {
      logs = (logs + chunk.toString()).slice(-8_000);
    });

    try {
      await waitForReady(child, readyUrl, timeoutMs, () => logs);
      return { stop: () => stopChild(child, port) };
    } catch (error) {
      lastError = error;
      await stopChild(child, port);
    }
  }

  throw new Error(`astro dev failed to start after 3 attempts: ${lastError}`);
}
