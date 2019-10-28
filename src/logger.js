/* eslint-disable no-console */
'use strict'

/*
Properties of an ideal logger
  accepts variadic arguments
  nicely formats messages
  severity suppression
  redaction
  sub contexts
  allows custom formatting of objects
*/

const { EventEmitter } = require('events')
const jsonify = require('fast-safe-stringify')
const { stringRedactor, regexRedactor, redact } = require('./strings')

const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const LOG_DELIMITER = '___$LAMBDA-LOG-TAG$___'

module.exports = {
  logLevels,
  LOG_DELIMITER,
  Logger
}

/**
 * Construct a new logger. Does not require "new".
 *
 * @param {Object} [{
 *   minimumLogLevel = null,
 *   formatter = JsonFormatter,
 *   useBearerRedactor = true,
 *   useGlobalErrorHandler = true,
 *   redactors = []
 * }={}] options
 * @param {Boolean} [null] options.minimumLogLevel hide log entries of lower severity
 * @param {Formatter} [JsonFormatter] options.formatter thunk that receives the log context, must return a function to handler formatting log messages. Defaults to JsonFormatter
 * @param {Boolean} [true] options.useBearerRedactor add a Bearer token redactor
 * @param {Boolean} [true] options.useGlobalErrorHandler setup global handlers for uncaughtException and unhandledRejection. Only one logger per-lambda can use this option.
 * @param {Boolean|undefined} [undefined] options.testMode Override environment checks and force "testMode" to be `true` or `false`. Leave undefined to allow ENV to define test mode.
 * @param {(string|RegExp|RedactorFunction)[]} [[]] options.redactors array of redactors. A Redactor is a string or regex to globally replace, or a user=supplied function that is invoked during the redaction phase.
 * @returns {Logger}
 */
function Logger({
  minimumLogLevel = null,
  formatter,
  useBearerRedactor = true,
  useGlobalErrorHandler = true,
  forceGlobalErrorHandler = false,
  redactors = [],
  testMode = undefined
} = {}) {
  const context = {
    minimumLogLevel,
    formatter,
    events: new EventEmitter(),
    contextPath: [],
    testMode,
    keys: new Map()
  }
  if (!formatter) {
    context.formatter = isInTestMode(context) ? TestFormatter : JsonFormatter
  }
  if (useBearerRedactor) {
    redactors.push(bearerRedactor(context))
  }
  if (useGlobalErrorHandler) {
    registerErrorHandlers(context, forceGlobalErrorHandler)
  }
  context.redact = wrapRedact(context, redactors)

  context.logger = {
    handler: wrapHandler(context),
    setMinimumLogLevel: wrapSetMinimumLogLevel(context),
    events: context.events,
    setKey: wrapSetKey(context),
    ...createLogger(context)
  }

  return context.logger
}

function createLogger(logContext) {
  let severityLog = wrapLog(logContext)
  return {
    createSubLogger: wrapSubLogger(logContext),
    info: severityLog('INFO'),
    warn: severityLog('WARN'),
    error: severityLog('ERROR'),
    debug: severityLog('DEBUG')
  }
}

function wrapSubLogger(logContext) {
  return subLoggerName =>
    createLogger({
      ...logContext,
      // Reference parent's minimumLogLevel so that it cascades down
      get minimumLogLevel() {
        return logContext.minimumLogLevel
      },
      contextPath: [...logContext.contextPath, subLoggerName],
      logger: undefined
    })
}

function wrapHandler(logContext) {
  return handler => async (lambdaEvent, lambdaContext) => {
    // Create initial values from context
    setMdcKeys(logContext, lambdaEvent, lambdaContext)

    // Attach logger to context
    lambdaContext.logger = logContext.logger

    if (logContext.events)
      logContext.events.emit('beforeHandler', lambdaEvent, lambdaContext)

    let result = handler(lambdaEvent, lambdaContext)
    if (!isPromise(result)) {
      // log the error first
      throw new Error(
        'Logger wrapped a handler function that did not return a promise. Lambda logger only supports async handlers.'
      )
    }
    return result
  }
}

const reservedKeys = ['message', 'severity']
function wrapSetKey(logContext) {
  return (key, value) => {
    if (reservedKeys.includes(key)) {
      throw new Error(`"${key}" is a reserved logger key.`)
    }
    logContext.keys.set(key, value)
  }
}

function setMdcKeys(logContext, lambdaEvent, lambdaContext) {
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

function wrapLog(logContext) {
  return severity => (...args) => writeLog(logContext, severity, ...args)
}

function writeLog(logContext, severity, ...args) {
  if (!canLogSeverity(logContext, severity)) return
  let logMessage = getLogMessage(logContext, severity, ...args)

  switch (severity) {
    case 'WARN':
    case 'ERROR':
      console.error(logMessage)
      return
    case 'DEBUG':
    case 'INFO':
    default:
      console.log(logMessage)
  }
}

function getLogMessage(logContext, severity, ...args) {
  return logContext.redact(logContext.formatter(logContext, severity, ...args))
}

function canLogSeverity(logContext, severity) {
  if (logLevels.indexOf(severity) === -1)
    throw new Error('Unable to log, illegal severity: ' + severity)
  return !(
    logContext.minimumLogLevel &&
    severity &&
    logLevels.indexOf(severity) < logLevels.indexOf(logContext.minimumLogLevel)
  )
}

function wrapSetMinimumLogLevel(logContext) {
  return level => {
    if (logLevels.indexOf(level) === -1) {
      throw new Error('Illegal log level value: ' + level)
    }
    logContext.minimumLogLevel = level
  }
}

function formatMessageItem(message) {
  if (typeof message === 'string') return message
  return jsonify(message, null, 2)
}

function JsonFormatter(logContext, severity, ...args) {
  let log = {}
  logContext.keys.forEach((value, key) => {
    log[key] = typeof value === 'function' ? value() : value
  })
  log.message =
    args.length === 1
      ? formatMessageItem(args[0])
      : args.map(formatMessageItem).join(' ')
  log.severity = severity
  let subLogPath = getLogPath(logContext)
  log.contextPath = subLogPath || undefined
  // put the un-annotated message first to make cloudwatch viewing easier
  // include the MDC annotaed message after with log delimiter to enable parsing
  return `${severity}${subLogPath ? ` ${subLogPath} ` : ' '}${
    log.message
  } |\n ${withDelimiter(jsonify(log))}`
}

function withDelimiter(message) {
  return LOG_DELIMITER + message + LOG_DELIMITER
}

function getLogPath(logContext) {
  return logContext.contextPath.join('.')
}

function TestFormatter(logContext, severity, ...args) {
  let subLogPath = getLogPath(logContext)
  let message =
    args.length === 1
      ? formatMessageItem(args[0])
      : args.map(formatMessageItem).join(' ')
  return `${severity}${subLogPath ? ` ${subLogPath} ` : ' '}${message}`
}

// Redaction
//

function wrapRedact(logContext, redactors) {
  logContext.redactors = redactors.map(redactor => {
    if (typeof redactor === 'string') return stringRedactor(redactor)
    else if (redactor instanceof RegExp) return regexRedactor(redactor)
    else if (typeof redactor === 'function') return redactor

    throw new Error(`Redactor type not supported: ${redactor}`)
  })
  return value =>
    logContext.redactors.reduce((val, redactor) => redactor(val), value)
}

function bearerRedactor(logContext) {
  const tokens = []
  const bearerRegex = /Bearer ([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*)/ // eslint-disable-line no-useless-escape
  // Only keep the token for the current handler invocation
  if (logContext.events) {
    logContext.events.on('beforeHandler', () => {
      clearArray(tokens)
    })
  }
  return val => {
    // Don't handle empty or non-string balues
    if (!val || typeof val !== 'string') return val
    // Redact early, or...
    let token = tokens.find(f => val.includes(f))
    if (token) return redact(val, token)
    // match the token
    let match = val.match(bearerRegex)
    if (!match) return val
    let bareToken = match[1]
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

function registerErrorHandlers(logContext, force) {
  if (!force && isInTestMode(logContext)) {
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
    process.exit(1)
  }
  process.on('uncaughtException', logContext.globalErrorHandler)
  process.on('unhandledRejection', logContext.globalErrorHandler)
}

let hasAlreadyClearedLambdaHandlers = false
function clearLambdaExceptionHandlers() {
  process.stdout.write('checking handlers', process.version, '\n')
  if (hasAlreadyClearedLambdaHandlers) {
    process.stdout.write('throwing\n')
    throw new Error(
      'tried to setup global handlers twice. You cannot contrusct two Loggers with "useGlobalErrorHandler"'
    )
  }
  const assert = require('assert')
  // Taken from: https://gist.github.com/twolfson/855a823cfbd62d4c7405a38105c23fd3
  // DEV: AWS Lambda's `uncaughtException` handler logs `err.stack` and exits forcefully
  //   uncaughtException listeners = [function (err) { console.error(err.stack); process.exit(1); }]
  //   We remove it so we can catch async errors and report them to Rollbar
  assert.strictEqual(process.listeners('uncaughtException').length, 1)
  process.removeAllListeners('uncaughtException')
  assert.strictEqual(
    process.listeners('unhandledRejection').length,
    getNodeMajorVersion() > 8 ? 1 : 0
  )
  process.removeAllListeners('unhandledRejection')
  hasAlreadyClearedLambdaHandlers = true
}

// Utilities

function pad(n) {
  return n < 10 ? '0' + n : n
}

function getFormattedDate() {
  return formatRfc3339(new Date(Date.now()))
}

function formatRfc3339(d) {
  return (
    d.getUTCFullYear() +
    '-' +
    pad(d.getUTCMonth() + 1) +
    '-' +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    ':' +
    pad(d.getUTCMinutes()) +
    ':' +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function isPromise(promise) {
  return (
    promise && promise.then !== undefined && typeof promise.then === 'function'
  )
}

function isInTestMode(logContext) {
  // Override with context
  if (logContext.testMode !== undefined) return logContext.testMode
  // Check environment
  let isMocha = global.it !== undefined
  let isJest = global.jest !== undefined
  let isTape = hasModuleLoaded('tape')
  // console.log('has tape loaded', isTape)
  let env =
    process.env.TEST || process.env.test || process.env.ci || process.env.CI
  // console.log('load', env, isMocha, isJest, isTape)
  return env || isMocha || isJest || isTape
}

function hasModuleLoaded(moduleName) {
  try {
    return !!require.cache[require.resolve(moduleName)]
  } catch (e) {
    if (/Cannot find module/.test(e.toString())) return false
    throw e
  }
}

function clearArray(arr) {
  arr.length = 0
}

function getNodeMajorVersion() {
  let version = process.version //v8.8
  // Skip the "v", convert to number
  return parseFloat(version.substring(1, version.indexOf('.')))
}
