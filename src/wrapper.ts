import { logLevels } from './types'
import type { ILogger, LogFn, Severity } from './types'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}

export function wrapper(baseLogger: any): ILogger {
  const logger = baseLogger || {}
  if (
    logger.minimumLogLevel !== undefined &&
    !logLevels.includes(logger.minimumLogLevel)
  ) {
    throw new Error(
      `"minimumLogLevel" must be one of: ${logLevels.join(', ')} or "undefined"`
    )
  }

  return {
    debug: wrapLogFn(logger, 'debug'),
    info: wrapLogFn(logger, 'info'),
    warn: wrapLogFn(logger, 'warn'),
    error: wrapLogFn(logger, 'error'),
  }
}

function wrapLogFn(logger: Partial<ILogger>, prop: Severity): LogFn {
  let func: LogFn
  const logFn = logger[prop]
  if (logFn && typeof logFn === 'function') {
    func = logFn
  } else {
    func =
      logger.minimumLogLevel !== undefined
        ? // eslint-disable-next-line no-console
          (console[prop] || console.log).bind(console)
        : noop
  }
  return (...args: unknown[]) => {
    // Level is an alias for INFO to support console.log drop-in
    if (
      logger.minimumLogLevel !== undefined &&
      logLevels.indexOf(logger.minimumLogLevel) >
        logLevels.indexOf(prop.toUpperCase())
    ) {
      return
    }
    return func(...args)
  }
}
