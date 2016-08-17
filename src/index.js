'use strict'

var assign = require('object-assign')
var objectKeys = function(o,k,r){r=[];for(k in o)r.hasOwnProperty.call(o,k)&&r.push(k);return r} // eslint-disable-line

var startTime = Date.now()
var originalLog = console.log.bind(console)
console.log = log

var tokenizer = /{{(.+?)}}/g
var logFormat = 'traceId={{traceId}} {{date}} appname={{appname}} version={{version}}'
var logKeys = {}

module.exports = logModule

function logModule (handler) {
  return function (event, context, callback) {
    // Create initial values from context
    setMdcKeys(context)

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

    handler(event, logContext, next)
  }
}

logModule.format = logFormat
logModule.log = log
logModule.setKey = setKey
logModule.restoreConsoleLog = restoreConsoleLog

function setKey (keyName, value) {
  logKeys[keyName] = value
}

function setMdcKeys (context) {
  setKey('traceId', context.awsRequestId)
  setKey('date', function () { return formatRfc3339(new Date(Date.now())) })
  setKey('appname', context.functionName)
  setKey('version', context.functionVersion)
}

function buildAccessLogPrefix () {
  return logModule.format.replace(tokenizer, getToken)
}

function getToken (match, key) {
  var token = logKeys[key] || '((TOKEN MISSING: ' + key + '))'
  return typeof token === 'function' ? token() : token
}

function restoreConsoleLog () {
  console.log = originalLog
}

function log () {
  return originalLog.apply(null, [buildAccessLogPrefix(), '|'].concat(Array.prototype.slice.call(arguments)))
}

function finalLog (event, context, err, result) {
  var finalValues = {
    'requestURL': event.path,
    'requestMethod': event.method,
    'elapsedTime': startTime - Date.now(),
    'accessToken': event.headerParams && event.headerParams.Authorization,
    'apiKey': null,
    'restApiId': event.requestId,
    'restResourceId': null,
    'result': JSON.stringify(err || result)
  }
  var logValues = []
  objectKeys(finalValues).forEach(function (key) {
    if (finalValues[key]) logValues.push(key + '=' + finalValues[key])
  })
  log.apply(null, logValues)
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
