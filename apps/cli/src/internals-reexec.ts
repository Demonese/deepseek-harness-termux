/**
 * Restart the CLI with `--expose-internals` where Node's internals addon
 * publishes no build. Profile resolution reads Node's internal module loader
 * through `node-addon-require-builtin`, which ships no Android package; the
 * flag serves the same purpose without one. A source launcher passes the flag
 * itself, so this restart exists for installed entries.
 * @module
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'

/** Node option that exposes internal modules to `require()`. */
export const INTERNALS_FLAG = '--expose-internals'

/**
 * Marker the restarted child carries: a child that still lacks the flag exits
 * with its own error instead of restarting forever.
 */
export const INTERNALS_REEXEC_MARKER = 'DSH_INTERNALS_REEXEC'

/** Facts the restart decision reads. */
export interface InternalsReexecState {
  /** Host platform of the running process. */
  readonly platform: NodeJS.Platform
  /** Node options the running process started with. */
  readonly execArgv: readonly string[]
  /** Value of {@link INTERNALS_REEXEC_MARKER} in the running process. */
  readonly marker: string | undefined
}

/** Signals forwarded to the child so a supervisor still stops the CLI. */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/**
 * Whether this process must restart to expose Node internals.
 * @param state - platform, Node options, and restart marker of the running process.
 * @returns whether Android started without the flag and this is the first attempt.
 */
export function needsInternalsReexec(state: InternalsReexecState): boolean {
  return state.platform === 'android'
    && state.marker === undefined
    && !state.execArgv.includes(INTERNALS_FLAG)
}

/**
 * Node options and arguments for the restarted process.
 * @param execArgv - Node options of the running process.
 * @param entry - module path of the CLI entry to run.
 * @param argv - command arguments after the CLI entry.
 * @returns the same command line with the internals flag added.
 */
export function internalsReexecArgv(execArgv: readonly string[], entry: string, argv: readonly string[]): string[] {
  return [...execArgv, INTERNALS_FLAG, entry, ...argv]
}

/**
 * Restart the entry with {@link INTERNALS_FLAG} and exit with the child's status.
 * @param entry - module path of the CLI entry to run.
 * @param argv - command arguments after the CLI entry.
 * @returns never; the process exits with the child's status or termination signal.
 */
export async function reexecWithInternals(entry: string, argv: readonly string[]): Promise<never> {
  const child = spawn(process.execPath, internalsReexecArgv(process.execArgv, entry, argv), {
    stdio: 'inherit',
    env: { ...process.env, [INTERNALS_REEXEC_MARKER]: '1' },
  })
  const forward = (signal: NodeJS.Signals): void => { child.kill(signal) }
  for (const signal of FORWARDED_SIGNALS) process.on(signal, forward)
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((settle, reject) => {
    child.once('error', (error) => { reject(new Error(`dsh: cannot restart the CLI with ${INTERNALS_FLAG}: ${error.message}`, { cause: error })) })
    child.once('exit', (exitCode, exitSignal) => { settle([exitCode, exitSignal]) })
  })
  for (const signal of FORWARDED_SIGNALS) process.off(signal, forward)
  process.exit(signal === null ? (code ?? 1) : 128 + (constants.signals[signal] ?? 0))
}

/**
 * Restart the running entry when this process cannot reach Node internals.
 * @param entry - module path of the running entry.
 * @returns nothing when this process can continue.
 */
export async function restartForInternals(entry: string): Promise<void> {
  if (!needsInternalsReexec({
    platform: process.platform,
    execArgv: process.execArgv,
    marker: process.env[INTERNALS_REEXEC_MARKER],
  })) return
  await reexecWithInternals(entry, process.argv.slice(2))
}
