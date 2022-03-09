import { EventEmitter } from 'events'
import jsonify from 'fast-safe-stringify'
import { stringRedactor, regexRedactor, redact, Redactor } from './strings'
import * as system from './system'

import { logLevels, severities } from './types'
import type { LogFn, ILogger, LogLevel, Severity } from './types'

/*
Properties of an ideal logger
  accepts variadic arguments
  nicely formats messages
  severity suppression
  redaction
  sub contexts
  allows custom formatting of objects
*/

export const LOG_DELIMITER = '___$LAMBDA-LOG-TAG$___'
const reservedKeys = ['message', 'severity']

// I don't want to include the enormous AWS types to
// correctly type the handler function
// eslint-disable-next-line @typescript-eslint/ban-types
type Handler = Function

export type Formatter = (
  context: FormatContext,
  severity: typeof severities[number],
  ...args: unknown[]
) => string
export type Loggable = string | boolean | number

export interface LoggerWithSub extends ILogger {
  createSubLogger: (name: string) => LoggerWithSub
}
export interface LambdaLogger extends LoggerWithSub {
  handler: Handler
  setMinimumLogLevel: (level: LogLevel) => void
  events: EventEmitter
  setKey: (key: string, val: Loggable | (() => Loggable)) => void
}

export interface FormatContext {
  keys: Record<string, Loggable>
  contextPath: string[]
}

interface LogContext {
  minimumLogLevel?: LogLevel
  redact: Redactor
  redactors: Redactor[]
  formatter: Formatter
  events: EventEmitter
  contextPath: string[]
  testMode?: boolean
  keys: Map<string, Loggable | (() => Loggable)>
  logger: LambdaLogger
  globalErrorHandler?: (error: any, promise: any) => void
}

// module.exports = {
//   logLevels,
//   LOG_DELIMITER,
//   Logger,
//   wrapper
// }

export interface LoggerProps {
  /** Hide log entries of lower severity */
  minimumLogLevel?: LogLevel
  /** Function that formats the log message; receives the logContext, severity, and the N-arity log arguments */
  formatter?: Formatter
  /** add a Bearer token redactor. Default true */
  useBearerRedactor?: boolean
  /** setup global handlers for uncaughtException and unhandledRejection. Only one logger per-lambda can use this option. */
  useGlobalErrorHandler?: boolean
  forceGlobalErrorHandler?: boolean
  redactors?: (Redactor | string | RegExp)[]
  testMode?: boolean
}

export function Logger({
  minimumLogLevel,
  formatter,
  useBearerRedactor = true,
  useGlobalErrorHandler = true,
  forceGlobalErrorHandler = false,
  redactors = [],
  testMode = undefined,
}: LoggerProps = {}): LambdaLogger {
  // This wacky omit it just to make typescript happy regarding the props
  // that are initialized later in this function
  const initContext: Partial<LogContext> = {
    minimumLogLevel,
    formatter:
      formatter ?? isInTestMode(testMode) ? TestFormatter : JsonFormatter,
    events: new EventEmitter(),
    contextPath: [],
    testMode,
    keys: new Map(),
  }
  if (useBearerRedactor) {
    redactors.push(bearerRedactor(initContext as LogContext))
  }
  if (useGlobalErrorHandler) {
    registerErrorHandlers(initContext as LogContext, forceGlobalErrorHandler)
  }
  initContext.redact = createRedact(initContext as LogContext, redactors)

  //
  // All Omit<LogContext> props should be filled by this point
  //
  const context: LogContext = initContext as LogContext

  context.logger = {
    handler: wrapHandler(context),
    setMinimumLogLevel: wrapSetMinimumLogLevel(context),
    events: context.events,
    setKey: wrapSetKey(context),
    ...createLogger(context),
  }

  return context.logger
}

function createLogger(logContext: LogContext): LoggerWithSub {
  const severityLog = wrapLog(logContext)
  return {
    createSubLogger: wrapSubLogger(logContext),
    info: severityLog('info'),
    warn: severityLog('warn'),
    error: severityLog('error'),
    debug: severityLog('debug'),
  }
}

function wrapSubLogger(
  logContext: LogContext
): (name: string) => LoggerWithSub {
  return (name: string) =>
    createLogger({
      ...logContext,
      // Reference parent's minimumLogLevel so that it cascades down
      get minimumLogLevel() {
        return logContext.minimumLogLevel
      },
      contextPath: [...logContext.contextPath, name],
      // TODO: Figure out why you were doing this
      // logger: undefined
    })
}

function wrapHandler(logContext: LogContext) {
  return (handler: Handler) =>
    async (lambdaEvent: unknown, lambdaContext: unknown) => {
      // Create initial values from context
      setMdcKeys(logContext, lambdaEvent, lambdaContext)

      // Attach logger to context
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      lambdaContext.logger = logContext.logger

      if (logContext.events)
        logContext.events.emit('beforeHandler', lambdaEvent, lambdaContext)

      const result = handler(lambdaEvent, lambdaContext)
      if (!isPromise(result)) {
        // log the error first
        throw new Error(
          'Logger wrapped a handler function that did not return a promise. Lambda logger only supports async handlers.'
        )
      }
      return result
    }
}

function wrapSetKey(
  logContext: LogContext
): (key: string, val: Loggable | (() => Loggable)) => void {
  return (key: string, value: Loggable | (() => Loggable)) => {
    if (reservedKeys.includes(key)) {
      throw new Error(`"${key}" is a reserved logger key.`)
    }
    logContext.keys.set(key, value)
  }
}

function setMdcKeys(
  logContext: LogContext,
  lambdaEvent: any,
  lambdaContext: any
) {
  let traceIndex = 0

  logContext.logger.setKey('traceId', lambdaContext.awsRequestId)
  logContext.logger.setKey('date', getFormattedDate)
  logContext.logger.setKey('appName', lambdaContext.functionName)
  logContext.logger.setKey('version', lambdaContext.functionVersion)
  logContext.logger.setKey(
    'apigTraceId',
    (lambdaEvent &&
      lambdaEvent.requestContext &&
      lambdaEvent.requestContext.requestId) ||
      (lambdaContext &&
        lambdaContext.requestContext &&
        lambdaContext.requestContext.requestId)
  )
  logContext.logger.setKey('traceIndex', () => traceIndex++)
}

function wrapLog(logContext: LogContext): (sev: Severity) => LogFn {
  return (severity: Severity) =>
    (...args: unknown[]) =>
      writeLog(logContext, severity, ...args)
}

function writeLog(
  logContext: LogContext,
  severity: Severity,
  ...args: unknown[]
) {
  if (!canLogSeverity(logContext, severity)) return
  const logMessage = getLogMessage(logContext, severity, ...args)

  switch (severity) {
    case 'warn':
      system.console.warn(logMessage)
      return
    case 'error':
      system.console.error(logMessage)
      return
    case 'debug':
      system.console.debug(logMessage)
      return
    case 'info':
    default:
      system.console.log(logMessage)
  }
}

function getLogMessage(
  logContext: LogContext,
  severity: Severity,
  ...args: unknown[]
) {
  const keys = Object.fromEntries(
    Array.from(logContext.keys.entries()).map(([key, value]) => [
      key,
      typeof value === 'function' ? value() : value,
    ])
  )

  return logContext.redact(
    logContext.formatter(
      { keys, contextPath: logContext.contextPath },
      severity,
      ...args
    )
  )
}

function canLogSeverity(logContext: LogContext, severity: Severity) {
  if (!severities.includes(severity))
    throw new Error('Unable to log, illegal severity: ' + severity)
  return !(
    logContext.minimumLogLevel &&
    severity &&
    logLevels.indexOf(severity.toUpperCase()) <
      logLevels.indexOf(logContext.minimumLogLevel)
  )
}

function wrapSetMinimumLogLevel(
  logContext: LogContext
): (level: LogLevel) => void {
  return (level: LogLevel) => {
    if (logLevels.indexOf(level) === -1) {
      throw new Error('Illegal log level value: ' + level)
    }
    logContext.minimumLogLevel = level
  }
}

function formatMessageItem(message: unknown) {
  if (typeof message === 'string') return message
  return jsonify(message, undefined, 2)
}

function JsonFormatter(
  context: FormatContext,
  severity: Severity,
  ...args: unknown[]
) {
  const log: Record<string, Loggable | undefined> = {
    ...context.keys,
  }
  log.message =
    args.length === 1
      ? formatMessageItem(args[0])
      : args.map(formatMessageItem).join(' ')
  log.severity = severity.toUpperCase()
  const subLogPath = getLogPath(context.contextPath)
  log.contextPath = subLogPath || undefined
  // put the un-annotated message first to make cloudwatch viewing easier
  // include the MDC annotaed message after with log delimiter to enable parsing
  return `${subLogPath ? ` ${subLogPath} ` : ' '}${
    log.message
  } |\n ${withDelimiter(jsonify(log))}`
}

function TestFormatter(
  context: FormatContext,
  severity: Severity,
  ...args: unknown[]
) {
  const subLogPath = getLogPath(context.contextPath)
  const message =
    args.length === 1
      ? formatMessageItem(args[0])
      : args.map(formatMessageItem).join(' ')
  return `${severity.toUpperCase()}${
    subLogPath ? ` ${subLogPath} ` : ' '
  }${message}`
}

function withDelimiter(message: string) {
  return LOG_DELIMITER + message + LOG_DELIMITER
}

function getLogPath(paths: string[]): string {
  return paths.join('.')
}

// Redaction
//

function createRedact(
  logContext: LogContext,
  redactors: (Redactor | string | RegExp)[]
): Redactor {
  logContext.redactors = redactors.map((redactor) => {
    if (typeof redactor === 'string') return stringRedactor(redactor)
    else if (redactor instanceof RegExp) return regexRedactor(redactor)
    else if (typeof redactor === 'function') return redactor

    throw new Error(`Redactor type not supported: ${redactor}`)
  })
  return (value: string) =>
    logContext.redactors.reduce((val, redactor) => redactor(val), value)
}

function bearerRedactor(logContext: LogContext): Redactor {
  const tokens: string[] = []
  const bearerRegex = /Bearer ([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*)/ // eslint-disable-line no-useless-escape
  // Only keep the token for the current handler invocation
  if (logContext.events) {
    logContext.events.on('beforeHandler', () => {
      clearArray(tokens)
    })
  }
  return (val: string) => {
    // Don't handle empty or non-string values
    if (!val || typeof val !== 'string') return val
    // Redact early, or...
    const token = tokens.find((f) => val.includes(f))
    if (token) return redact(val, token)
    // match the token
    const match = val.match(bearerRegex)
    if (!match) return val
    const bareToken = match[1]
    // When not using the handler wrapper, "tokens" grows unbounded
    // Don't keep more than 5 tokens
    // Since each token is the full and bare entry, length = 10
    if (tokens.length > 10) {
      // Remove the last match-pair
      tokens.splice(0, 2)
    }
    // Store the match pair
    tokens.push(val, bareToken)
    return redact(val, match[0])
  }
}

// Error Handling
//

function registerErrorHandlers(logContext: LogContext, force: boolean) {
  if (!force && isInTestMode(logContext.testMode)) {
    return
  }
  clearLambdaExceptionHandlers()
  logContext.globalErrorHandler = (err, promise) => {
    if (promise) {
      logContext.logger.error(
        'unhandled rejection (this should never happen!)',
        err.stack
      )
    } else {
      logContext.logger.error(
        'uncaught exception (this should never happen!)',
        err.stack
      )
    }
    // eslint-disable-next-line no-process-exit
    system.process.exit(1)
  }
  system.process.on('uncaughtException', logContext.globalErrorHandler)
  system.process.on('unhandledRejection', logContext.globalErrorHandler)
}

let hasAlreadyClearedLambdaHandlers = false
function clearLambdaExceptionHandlers() {
  if (hasAlreadyClearedLambdaHandlers) {
    throw new Error(
      'tried to setup global handlers twice. You cannot construct two Loggers with "useGlobalErrorHandler"'
    )
  }
  // Taken from: https://gist.github.com/twolfson/855a823cfbd62d4c7405a38105c23fd3
  // DEV: AWS Lambda's `uncaughtException` handler logs `err.stack` and exits forcefully
  //   uncaughtException listeners = [function (err) { console.error(err.stack); system.process.exit(1); }]
  //   We remove it so we can catch async errors and report them to Rollbar
  if (system.process.listeners('uncaughtException').length !== 1) {
    throw new Error(
      'Logger Assertion Failed: uncaughtException does not have 1 listener(s)'
    )
  }
  system.process.removeAllListeners('uncaughtException')
  if (
    system.process.listeners('unhandledRejection').length !==
    system.UNHANDLED_REJECTION_LISTENERS
  ) {
    throw new Error(
      `Logger Assertion Failed: unhandledRejection does not have ${system.UNHANDLED_REJECTION_LISTENERS} listener(s)`
    )
  }
  system.process.removeAllListeners('unhandledRejection')
  hasAlreadyClearedLambdaHandlers = true
}

// Utilities

function isInTestMode(testMode?: boolean) {
  // Override with context
  if (testMode !== undefined) return testMode
  // Check environment
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const isMocha = global.it !== undefined
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const isJest = global.jest !== undefined
  const isTape = hasModuleLoaded('tape')
  // console.log('has tape loaded', isTape)
  const env =
    system.process.env.TEST ||
    system.process.env.test ||
    system.process.env.ci ||
    system.process.env.CI
  // console.log('load', env, isMocha, isJest, isTape)
  return env || isMocha || isJest || isTape
}

function hasModuleLoaded(moduleName: string) {
  try {
    return !!require.cache[require.resolve(moduleName)]
  } catch (e: any) {
    if (/Cannot find module/.test(e.toString())) return false
    throw e
  }
}

function pad(n: number): string | number {
  return n < 10 ? '0' + n : n
}

function getFormattedDate(): string {
  return formatRfc3339(new Date(Date.now()))
}

function formatRfc3339(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds()
  )}Z`
}

function isPromise(promise: unknown): boolean {
  return (
    !!promise &&
    (promise as Promise<any>).then !== undefined &&
    typeof (promise as Promise<any>).then === 'function'
  )
}

function clearArray(arr: unknown[]): void {
  arr.length = 0
}
