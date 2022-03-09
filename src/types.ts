// Only include types in here that cannot be safely placed in other files due to circular references

export const severities = ['debug', 'info', 'warn', 'error'] as const
export const logLevels = [...severities, 'silent'].map((s) => s.toUpperCase())

export type LogLevel = Uppercase<typeof severities[number]> | 'SILENT'
export type Severity = typeof severities[number]

export type LogFn = (...args: unknown[]) => ReturnType<typeof console.log>
export interface ILogger {
  debug: LogFn
  info: LogFn
  error: LogFn
  warn: LogFn
  minimumLogLevel?: typeof logLevels[number]
}
