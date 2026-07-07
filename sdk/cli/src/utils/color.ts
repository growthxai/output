/**
 * Standard TTY/env precedence for whether a command should colorize its
 * output: the command's own --color/--no-color flag wins first, then
 * NO_COLOR opts out, then FORCE_COLOR opts in even off a TTY, then finally
 * fall back to whether stdout is an interactive terminal.
 */
export function shouldColorize( flag: boolean ): boolean {
  return flag && !process.env.NO_COLOR &&
    ( !!process.env.FORCE_COLOR || process.stdout.isTTY === true );
}
