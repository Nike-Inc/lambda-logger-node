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

const util = require('util')
const { stringRedactor, regexRedactor } = require('./strings')

const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const LOG_DELIMITER = '___$LAMBDA-LOG-TAG$___'

module.exports = {
  logLevels,
  LOG_DELIMITER,
  Logger
}

/** Description of the function
    @name RedactorFunction
    @function
    @param {String} log message to redact
*/

/**
 * Construct a new logger. Does not require "new".
 *
 * @param {Object} [{
 *   useFinalLog = true,
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
 * @param {(string|RegExp|RedactorFunction)[]} [[]] options.redactors array of redactors. A Redactor is a string or regex to globally replace, or a user=supplied function that is invoked during the redaction phase.
 * @returns {Logger}
 */
function Logger ({
  minimumLogLevel = null,
  formatter = JsonFormatter,
  useBearerRedactor = true,
  useGlobalErrorHandler = true,
  redactors = []
} = {}) {
  const context = {
    minimumLogLevel,
    contextPath: [],
    keys: new Map()
  }
  if (useBearerRedactor) {
    redactors.push(bearerRedactor())
  }
  if (useGlobalErrorHandler) {
    registerErrorHandlers(context)
  }
  context.redact = wrapRedact(context, redactors)
  context.getFormattedLogMessage = formatter(context)

  context.logger = {
    handler: wrapHandler(context),
    setMinimumLogLevel: wrapSetMinimumLogLevel(context),
    setKey: wrapSetKey(context),
    ...createLogger(context)
  }

  return context.logger
}

function wrapHandler (logContext) {
  return handler => async (lambdaEvent, lambdaContext) => {
    // Create initial values from context
    setMdcKeys(logContext, lambdaEvent, lambdaContext)

    // Attach logger to context
    lambdaContext.logger = logContext.logger

    if (logContext.events) logContext.events.emit('beforeHandler', lambdaEvent, lambdaContext)

    let result = handler(lambdaEvent, lambdaContext)
    if (!isPromise(result)) {
      // log the error first
      throw new Error('Logger wrapped a handler function that did not return a promise. Lambda logger only supports async handlers.')
    }
    return result
  }
}

const reservedKeys = ['message', 'severity']
function wrapSetKey (logContext) {
  return (key, value) => {
    if (reservedKeys.includes(key)) {
      throw new Error(`"${key}" is a reserved logger key.`)
    }
    logContext.keys.set(key, value)
  }
}

function setMdcKeys (logContext, lambdaEvent, lambdaContext) {
  let traceIndex = 0

  logContext.logger.setKey('traceId', lambdaContext.awsRequestId)
  logContext.logger.setKey('date', getFormattedDate)
  logContext.logger.setKey('appname', lambdaContext.functionName)
  logContext.logger.setKey('version', lambdaContext.functionVersion)
  logContext.logger.setKey('apigTraceId', (lambdaEvent && lambdaEvent.requestContext && lambdaEvent.requestContext.requestId) || (lambdaContext && lambdaContext.requestContext && lambdaContext.requestContext.requestId))
  logContext.logger.setKey('traceIndex', () => traceIndex++)
}

function wrapLog (logContext) {
  return severity => (...args) => writeLog(logContext, severity, ...args)
}

function writeLog (logContext, severity, ...args) {
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
      return
  }
}

function getLogMessage (logContext, severity, ...args) {
  return logContext.redact(logContext.getFormattedLogMessage(severity, ...args))
}

function createLogger (logContext) {
  let severityLog = wrapLog(logContext)
  return {
    createSubLogger: wrapSubLogger(logContext),
    info: severityLog('INFO'),
    warn: severityLog('WARN'),
    error: severityLog('ERROR'),
    debug: severityLog('DEBUG')
  }
}

function wrapSubLogger (logContext) {
  return (subLoggerName) => createLogger({
    ...logContext,
    // Reference parent's minimumLogLevel so that it cascades down
    get minimumLogLevel () {
      return logContext.minimumLogLevel
    },
    contextPath: [...logContext.contextPath, subLoggerName],
    logger: undefined
  })
}

function canLogSeverity (logContext, severity) {
  if (logLevels.indexOf(severity) === -1) throw new Error('Unable to log, illegal severity: ' + severity)
  return !(logContext.minimumLogLevel && severity && logLevels.indexOf(severity) < logLevels.indexOf(logContext.minimumLogLevel))
}

function wrapSetMinimumLogLevel (logContext) {
  return level => {
    if (logLevels.indexOf(level) === -1) {
      throw new Error('Illegal log level value: ' + level)
    }
    logContext.minimumLogLevel = level
  }
}

function JsonFormatter (logContext) {
  return (severity, ...args) => {
    let log = {}
    logContext.keys.forEach((key, value) => {
      log[key] = typeof value === 'function' ? value() : value
    })
    log.message = args.length === 1 ? args[0] : args
    log.severity = severity
    // put the un-annotated message first to make cloudwatch viewing easier
    // include the MDC annotaed message after with log delimiter to enable parsing
    let subLogPath = logContext.contextPath.join('.')
    return `${severity}${subLogPath || ' '}${util.format(log.message)} | ${withDelimiter(JSON.stringify(log, null, 2))}`
  }
}

function withDelimiter (message) {
  return LOG_DELIMITER + message + LOG_DELIMITER
}

// Redaction
//

function wrapRedact (logContext, redactors) {
  logContext.redactors = redactors.map(redactor => {
    if (typeof redactor === 'string') return stringRedactor(redactor)
    else if (redactor instanceof RegExp) return regexRedactor(redactor)
    else if (typeof redactor === 'function') return redactor
    else {
      throw new Error(`Redactor type not supported: ${redactor}`)
    }
  })
  return (value) => logContext.redactors.reduce((val, redactor) => redactor(val), value)
}

function bearerRedactor () {
  return /Bearer ey\w+/
}

function registerErrorHandlers (logContext) {
  clearLambdaExceptionHandlers()
  logContext.globalErrorHandler = (err, promise) => {
    if (promise) {
      logContext.logger.error('unhandled rejection (this should never happen!)', err.stack)
    } else {
      logContext.logger.error('uncaught exception (this should never happen!)', err.stack)
    }
    process.exit(1)
  }
  process.on('uncaughtException', logContext.globalErrorHandler)
  process.on('unhandledRejection', logContext.globalErrorHandler)
}

let hasAlreadyClearedLambdaHandlers = false
function clearLambdaExceptionHandlers () {
  if (hasAlreadyClearedLambdaHandlers) {
    console.error
    throw new Error('tried to setup global handlers twice. You cannot contrusct two Loggers with "useGlobalErrorHandler"')
  }
  const assert = require('assert')
  // Taken from: https://gist.github.com/twolfson/855a823cfbd62d4c7405a38105c23fd3
  // DEV: AWS Lambda's `uncaughtException` handler logs `err.stack` and exits forcefully
  //   uncaughtException listeners = [function (err) { console.error(err.stack); process.exit(1); }]
  //   We remove it so we can catch async errors and report them to Rollbar
  assert.strictEqual(process.listeners('uncaughtException').length, 1)
  assert.strictEqual(process.listeners('unhandledRejection').length, 0)
  process.removeAllListeners('uncaughtException')
  hasAlreadyClearedLambdaHandlers = true
}

// Utilities

function pad (n) { return n < 10 ? '0' + n : n }

function getFormattedDate () {
  return formatRfc3339(new Date(Date.now()))
}

function formatRfc3339 (d) {
  return d.getUTCFullYear() + '-' +
    pad(d.getUTCMonth() + 1) + '-' +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + ':' +
    pad(d.getUTCMinutes()) + ':' +
    pad(d.getUTCSeconds()) + 'Z'
}

function isPromise (promise) {
  return promise.then !== undefined && typeof promise.then === 'function'
}
