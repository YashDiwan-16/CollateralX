import { loadConfig } from "./config"
import { buildOracleRuntime, buildRuntime, startReadRuntime } from "./runtime"
import { sleep } from "./infra/retry"

const command = process.argv[2] ?? "help"

async function main() {
  const config = loadConfig()

  if (command === "keeper:once") {
    const runtime = buildRuntime(config)
    await runtime.keeper.runOnce()
    return
  }

  if (command === "keeper:loop") {
    const runtime = buildRuntime(config)
    runtime.logger.info("keeper loop starting", {
      intervalMs: config.keeper.intervalMs,
      dryRun: config.keeper.dryRun,
      executionEnabled: config.keeper.executionEnabled,
    })
    while (true) {
      await runtime.keeper.runOnce()
      await sleep(config.keeper.intervalMs)
    }
  }

  if (command === "oracle:update") {
    const runtime = buildOracleRuntime(config)
    await runtime.oracle.runOnce()
    return
  }

  if (command === "read-api") {
    await startReadRuntime(config)
    return
  }

  console.log([
    "Usage:",
    "  pnpm keeper:once",
    "  pnpm keeper:loop",
    "  pnpm oracle:update",
    "  pnpm read-api",
  ].join("\n"))
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    message: "service command failed",
    command,
    error: error instanceof Error ? error.message : String(error),
  }))
  process.exitCode = 1
})
