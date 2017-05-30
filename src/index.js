'use strict'

var assign = require('object-assign')
var objectKeys = function(o,k,r){r=[];for(k in o)r.hasOwnProperty.call(o,k)&&r.push(k);return r} // eslint-disable-line

var startTime = Date.now()
var originalLog
var originalInfo
var originalWarn
var originalError
var contextLogMapper

var isSupressingFinalLog = false
var minimumLogLevel = null
var logLevelPriority = ['DEBUG', 'INFO', 'WARN', 'ERROR']
var tokenizer = /{{(.+?)}}/g
var logFormat = 'traceId={{traceId}} {{date}} appname={{appname}} version={{version}} severity={{severity}} '
var successFormat = logFormat + 'requestURL={{requestURL}} requestMethod={{requestMethod}} elapsedTime={{elapsedTime}} accessToken={{accessToken}} apigTraceId={{apigTraceId}} result={{result}} '
var logKeys = {}

module.exports = logModule

function logModule (handler) {
  return function (event, context, callback) {
    originalLog = console.log.bind(console)
    console.log = log
    originalInfo = console.info.bind(console)
    console.info = logRouter('INFO')
    originalError = console.error.bind(console)
    console.error = logRouter('ERROR')
    originalWarn = console.warn.bind(console)
    console.warn = logRouter('WARN')
    console.debug = logRouter('DEBUG')

    contextLogMapper = {
      'INFO': originalInfo,
      'WARN': originalWarn,
      'ERROR': originalError,
      'DEBUG': originalLog
    }

    // Create initial values from context
    setMdcKeys(event, context)

    var next = function (err, result) {
      finalLog(event, context, err, result)
      callback(err, result)
    }

    var logContext = assign({}, context, {
      succeed: function (result) {
        finalLog(event, context, null, result)
        context.succeed(result)
      },
      fail: function (error) {
        finalLog(event, context, error, null)
        context.fail(error)
      },
      done: function (error, result) {
        finalLog(event, context, error, result)
        context.done(error, result)
      }
    })

    isSupressingFinalLog = false
    handler(event, logContext, next)
  }
}

logModule.format = logFormat
logModule.successFormat = successFormat
logModule.errorFormat = successFormat
logModule.log = log
logModule.setKey = setKey
logModule.restoreConsoleLog = restoreConsoleLog
logModule.debug = logRouter('DEBUG')
logModule.info = logRouter('INFO')
logModule.warn = logRouter('WARN')
logModule.error = logRouter('ERROR')
logModule.setMinimumLogLevel = setMinimumLogLevel
logModule.supressCurrentFinalLog = supressFinalLog

function setKey (keyName, value) {
  logKeys[keyName] = value
}

function setMdcKeys (event, context) {
  setKey('traceId', context.awsRequestId)
  setKey('date', function () { return formatRfc3339(new Date(Date.now())) })
  setKey('appname', context.functionName)
  setKey('version', context.functionVersion)
  setKey('apigTraceId', (event && event.requestContext && event.requestContext.requestId) || (context && context.requestContext && context.requestContext.requestId))
}

function buildAccessLogPrefix (severity) {
  var prefix = logModule.format.replace(/{{severity}}/, severity || logKeys['severity'] || 'INFO')
  return prefix.replace(tokenizer, getToken)
}

function getToken (match, key) {
  var token = logKeys[key] || '((TOKEN MISSING: ' + key + '))'
  return typeof token === 'function' ? token() : token
}

function restoreConsoleLog () {
  console.log = originalLog
  console.warn = originalWarn
  console.error = originalError
  console.info = originalInfo
  console.debug = undefined
}

function log () {
  return originalLog.apply(null, [buildAccessLogPrefix(), '|'].concat(Array.prototype.slice.call(arguments)))
}

function setMinimumLogLevel (level) {
  if (logLevelPriority.indexOf(level) === -1) {
    throw new Error('Illegal log level value: ' + level)
  }
  minimumLogLevel = level
}

function supressFinalLog () {
  isSupressingFinalLog = true
}

function logWithSeverity (message, severity) {
  // originalLog.call(null, 'severity', severity)
  // Do not log message below the minimumLogLevel
  if (!canSeverityLog(severity)) {
    return
  }
  var contextLogger = contextLogMapper[severity] || originalLog
  return contextLogger.apply(null, [buildAccessLogPrefix(severity), '|'].concat(message))
}

function canSeverityLog (severity) {
  if (logLevelPriority.indexOf(severity) === -1) throw new Error('Unable to log, illegal severity: ' + severity)
  return !(minimumLogLevel && severity && logLevelPriority.indexOf(severity) < logLevelPriority.indexOf(minimumLogLevel))
}

function logRouter (severity) {
  return function () { logWithSeverity(Array.prototype.slice.call(arguments), severity) }
}

function finalLog (event, context, err, result) {
  restoreConsoleLog()
  if (isSupressingFinalLog) return
  var logFormatOriginal = logModule.format
  if (err && logModule.errorFormat) {
    logModule.format = logModule.errorFormat
  } else if (!err && logModule.successFormat) {
    logModule.format = logModule.successFormat
  } else {
    return
  }
  // Setup Final Keys
  setKey('requestURL', event.path)
  setKey('requestMethod', event.httpMethod)
  setKey('accessToken', event.headerParams && event.headerParams.Authorization)
  setKey('apigTraceId', logKeys['apigTraceId'])
  setKey('elapsedTime', Date.now() - startTime)
  setKey('result', JSON.stringify(err || result))
  // Log and restore console
  log('final log')
  logModule.format = logFormatOriginal
}

// Utilities
//

function pad (n) { return n < 10 ? '0' + n : n }

function formatRfc3339 (d) {
  return d.getUTCFullYear() + '-' +
    pad(d.getUTCMonth() + 1) + '-' +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + ':' +
    pad(d.getUTCMinutes()) + ':' +
    pad(d.getUTCSeconds()) + 'Z'
}
