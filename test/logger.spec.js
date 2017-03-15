'use strict'

var test = require('blue-tape')
var logModule = require('../src/index')

// TAP uses logs for test results
// Since logger hijacks the console.log, we need to restore it, or TAP breaks
// We can hijack logger's log though, and capture it's calls
var originalLog = console.log
var originalWarn = console.warn
var originalInfo = console.info
var originalError = console.error
var loggerLog
var loggerWarn
var loggerError
var loggerInfo
var logCalls = []
logCalls.last = () => logCalls.length ? logCalls[logCalls.length - 1] : null

var prepareConsole = () => {
  console.log = console.warn = console.error = console.info = function () { logCalls.push(Array.prototype.slice.call(arguments)) }
}
var testLogWrapper = () => {
  loggerLog = console.log
  loggerWarn = console.warn
  loggerError = console.error
  loggerInfo = console.info
}

const defaultEvent = {
  path: '/some/route',
  method: 'GET',
  headerParams: { Authorization: 'Bearer 12' },
  requestId: 'request-id'
}
const defaultContext = {
  awsRequestId: 'asdfghjkl',
  functionName: 'test-function',
  functionVersion: 'test-version',
  requestContext: {
    requestId: '4ad0d369-08e2-11e7-9df7-6d968da958aa'
  },
  // You will need to override these for any tests that use them
  succeed: () => {},
  fail: () => {},
  done: () => {}
}

const makeLoggerContextTest = (testSetup, event, context, callback) => {
  testSetup()
  var l = logModule((e, c, cb) => { testLogWrapper(); cb(null, 'done') })
  l(Object.assign({}, defaultEvent, event), Object.assign({}, defaultContext, context), (err, result) => {
    console.log = originalLog
    console.error = originalError
    console.info = originalInfo
    console.warn = originalWarn
    if (callback) callback(err, result)
  })
}

const makeLogger = (event, context, callback) => {
  prepareConsole()
  logCalls.length = 0
  var l = logModule((e, c, cb) => { testLogWrapper(); cb(null, 'done') })
  l(Object.assign({}, defaultEvent, event), Object.assign({}, defaultContext, context), (err, result) => {
    console.log = originalLog
    console.error = originalError
    console.info = originalInfo
    console.warn = originalWarn
    if (callback) callback(err, result)
  })
}

test('logger should return a function', t => {
  t.ok(typeof logModule === 'function', 'logger is function')
  t.end()
})

test('logger replace console.log', t => {
  makeLogger()
  t.notEqual(originalLog, loggerLog, 'console.log replaced')
  t.end()
})

test('logger replace other console contexts', t => {
  makeLogger()
  t.notEqual(originalError, loggerError, 'console.error replaced')
  t.notEqual(originalInfo, loggerInfo, 'console.info replaced')
  t.notEqual(originalWarn, loggerWarn, 'console.warn replaced')
  t.end()
})

test('logger prepends trace values on logs', t => {
  makeLogger()
  loggerLog('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appname=test-function version=test-version/))
  t.end()
})

test('logger creates access log when callback is called', t => {
  t.plan(1)
  makeLogger(null, null, (err, result) => {
    if (err) t.end(err)
    var lastCall = logCalls.last()
    var accessLog = lastCall.slice(2).join(' ')
    // originalLog(`debug: ${logCalls.length}\n`, logCalls.join('\n\n'))
    // originalLog('access log', accessLog)
    t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer 12 restApiId=request-id apigTraceId=4ad0d369-08e2-11e7-9df7-6d968da958aa/))
  })
})

test('context.succeed should return success result', t => {
  t.plan(1)
  prepareConsole()
  var l = logModule((e, c, cb) => { testLogWrapper(); c.succeed('done') })
  l(defaultEvent, Object.assign({}, defaultContext, { succeed: (result) => {
    t.equal(result, 'done', 'success result returned')
  }}))
})

test('context.succeed should return success result', t => {
  t.plan(1)
  prepareConsole()
  var l = logModule((e, c) => { testLogWrapper(); c.succeed('done') })
  l(defaultEvent, Object.assign({}, defaultContext, { succeed: (result) => {
    t.equal(result, 'done', 'success result returned')
  }}))
})

test('logger correctly logs expected prefix with .log', t => {
  makeLogger()
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/severity=info/))
  t.end()
})

test('logger prepends default severity of info', t => {
  makeLogger()
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appname=test-function version=test-version severity=info/))
  t.end()
})

test('logger uses console context functions', t => {
  var warnOutput = 'warnTest'
  var errorOutput = 'errorTest'
  var infoOutput = 'infoTest'
  makeLoggerContextTest(() => {
    console.log = function () { logCalls.push(Array.prototype.slice.call(arguments)) }
    console.warn = function () { t.ok(Array.prototype.slice.call(arguments)[2].match(warnOutput)) }
    console.error = function () { t.ok(Array.prototype.slice.call(arguments)[2].match(errorOutput)) }
    console.info = function () { t.ok(Array.prototype.slice.call(arguments)[2].match(infoOutput)) }
  })
  logModule.warn(warnOutput)
  logModule.error(errorOutput)
  logModule.info(infoOutput)
  t.end()
})

test('logger prepends utility method severity levels', t => {
  makeLogger()
  logModule.warn('test')
  t.ok(logCalls.last()[0].match(/severity=warn/))
  logModule.debug('test')
  t.ok(logCalls.last()[0].match(/severity=debug/))
  logModule.trace('test')
  t.ok(logCalls.last()[0].match(/severity=trace/))
  logModule.fatal('test')
  t.ok(logCalls.last()[0].match(/severity=fatal/))
  logModule.info('test')
  t.ok(logCalls.last()[0].match(/severity=info/))
  logModule.error('test')
  t.ok(logCalls.last()[0].match(/severity=error/))
  t.end()
})

test('logger should not log when below minimum severity', t => {
  makeLogger()
  var logLength = logCalls.length
  logModule.setMinimumLogLevel('debug')
  logModule.trace('test')
  t.equal(logCalls.length, logLength, 'log did not get called')
  t.end()
})

test('logger should log when above minimum severity', t => {
  makeLogger()
  var logLength = logCalls.length
  logModule.setMinimumLogLevel('debug')
  logModule.info('test')
  t.equal(logCalls.length, logLength + 1, 'log got called')
  t.end()
})

test('logger should throw if minimum log level is invalid', t => {
  makeLogger()
  t.throws(() => logModule.setMinimumLogLevel('garbage'), 'does not allow garbage')
  t.end()
})

test('logger should respect default severity set', t => {
  makeLogger()
  logModule.setKey('severity', 'warn')
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appname=test-function version=test-version severity=warn/))
  t.end()
})

test('logger should work if severity is removed from prefix', t => {
  makeLogger()
  logModule.logFormat = 'traceId={{traceId}} severity={{severity}} {{date}} appname={{appname}}'
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=info/))
  logModule.logFormat = 'traceId={{traceId}} someCustomValue={{custom1}} {{date}} appname={{appname}}'
  logModule.log('test')
  lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=info/))
  t.end()
})

test('logger.format allows format changes', t => {
  var originalFormat = logModule.format
  logModule.format = 'appName = {{appname}}'
  makeLogger()
  logModule.setKey('severity', 'warn')
  logModule.log('test')
  logModule.format = originalFormat
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/appName =/), 'should use appName')
  t.end()
})
