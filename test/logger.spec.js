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
var originalTrace = console.debug
var loggerLog
var loggerWarn
var loggerError
var loggerInfo
var logCalls = []
logCalls.last = () => logCalls.length ? logCalls[logCalls.length - 1] : null

var log = (...args) => console.log(...args.map(a => require('util').inspect(a, { colors: true, depth: null }))) // eslint-disable-line

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
  httpMethod: 'GET',
  headerParams: { Authorization: 'Bearer 12' },
  requestContext: {
    requestId: '4ad0d369-08e2-11e7-9df7-6d968da958aa'
  }
}
const defaultContext = {
  awsRequestId: 'asdfghjkl',
  functionName: 'test-function',
  functionVersion: 'test-version',
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
    console.debug = originalTrace
    console.info = originalInfo
    console.warn = originalWarn
    if (callback) callback(err, result)
  })
}

const makeLogger = (options, callback) => {
  options = options || {}
  prepareConsole()
  logCalls.length = 0
  var l = logModule((e, c, cb) => { testLogWrapper(); if (options.callHook) options.callHook(); cb(options.error, 'done') })
  l(Object.assign({}, options.event || defaultEvent), Object.assign({}, options.context || defaultContext), (err, result) => {
    console.log = originalLog
    console.error = originalError
    console.info = originalInfo
    console.debug = originalTrace
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
  // log(lastCall)
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appName=test-function version=test-version/))
  t.end()
})

test('logger creates access log when callback is called', t => {
  t.plan(1)
  makeLogger(null, (err, result) => {
    if (err) t.end(err)
    var lastCall = logCalls.last()
    var accessLog = lastCall[0]
    // originalLog(`debug: ${logCalls.length}\n`, logCalls.join('\n\n'))
    // originalLog('access log', accessLog)
    t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer 12 apigTraceId=4ad0d369-08e2-11e7-9df7-6d968da958aa/))
  })
})

test('logger creates allows custom successFormat log', t => {
  t.plan(1)
  var original = logModule.successFormat
  logModule.successFormat = logModule.successFormat.replace('accessToken={{accessToken}}', 'accessToken={{customAccessToken}}')
  logModule.setKey('customAccessToken', 'Bearer custom')
  makeLogger(null, (err, result) => {
    logModule.successFormat = original
    if (err) t.end(err)
    var lastCall = logCalls.last()
    var accessLog = lastCall[0]
    // originalLog(`debug: ${logCalls.length}\n`, logCalls.join('\n\n'))
    // originalLog('access log', accessLog)
    t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer custom apigTraceId=4ad0d369-08e2-11e7-9df7-6d968da958aa/))
  })
})

test('logger skips access log when logModule.successFormat is falsy', t => {
  t.plan(1)
  var originalSuccess = logModule.successFormat
  logModule.successFormat = ''
  makeLogger(null, (err, result) => {
    logModule.successFormat = originalSuccess
    if (err) t.end(err)
    var lastCall = logCalls.last()
    // var accessLog = lastCall[0]
    // originalLog(`debug: ${logCalls.length}\n`, logCalls.join('\n\n'))
    // originalLog('access log', lastCall)
    t.ok(lastCall === null, 'access log was not made')
    // t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer 12 restApiId=request-id apigTraceId=4ad0d369-08e2-11e7-9df7-6d968da958aa/))
  })
})

test('logger skips access log when logModule.errorFormat is falsy', t => {
  t.plan(2)
  var originalError = logModule.errorFormat
  logModule.errorFormat = ''
  makeLogger({ error: 'err' }, (err, result) => {
    logModule.errorFormat = originalError
    var lastCall = logCalls.last()
    // var accessLog = lastCall[0]
    // originalLog(`debug: ${logCalls.length}\n`, logCalls.join('\n\n'))
    // originalLog('access log', lastCall, err)
    t.ok(err, 'error returned')
    t.ok(lastCall === null, 'access log was not made')
    // t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer 12 restApiId=request-id apigTraceId=4ad0d369-08e2-11e7-9df7-6d968da958aa/))
  })
})

test('logger skips access log when logModule.supressCurrentFinalLog', t => {
  t.plan(4)
  makeLogger({ callHook: () => logModule.supressCurrentFinalLog() }, (err, result) => {
    var lastCall = logCalls.last()
    // originalLog('access log', lastCall, err)
    t.ok(lastCall === null, 'access log was not made')
    t.notOk(err, 'err is empty')

    makeLogger(null, (err, result) => {
      var lastCall = logCalls.last()
      // originalLog('access log', lastCall, err)
      t.notOk(err, 'err is empty')
      t.ok(lastCall[0].match(/result=/), 'access log was made')
    })
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
  t.ok(lastCall[0].match(/severity=INFO/))
  t.end()
})

test('logger prepends default severity of info', t => {
  makeLogger()
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appName=test-function version=test-version severity=INFO/))
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
  t.ok(logCalls.last()[0].match(/severity=WARN/))
  logModule.debug('test')
  t.ok(logCalls.last()[0].match(/severity=DEBUG/))
  logModule.info('test')
  t.ok(logCalls.last()[0].match(/severity=INFO/))
  logModule.error('test')
  t.ok(logCalls.last()[0].match(/severity=ERROR/))
  t.end()
})

test('logger should not log when below minimum severity', t => {
  makeLogger()
  var logLength = logCalls.length
  logModule.setMinimumLogLevel('INFO')
  logModule.debug('test')
  t.equal(logCalls.length, logLength, 'log did not get called')
  t.end()
})

test('logger should log when above minimum severity', t => {
  makeLogger()
  var logLength = logCalls.length
  logModule.setMinimumLogLevel('DEBUG')
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
  logModule.setKey('severity', 'WARN')
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appName=test-function version=test-version severity=WARN/))
  t.end()
})

test('logger should work if severity is removed from prefix', t => {
  makeLogger()
  logModule.logFormat = 'traceId={{traceId}} severity={{severity}} {{date}} appName={{appname}}'
  logModule.log('test')
  var lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=INFO/))
  logModule.logFormat = 'traceId={{traceId}} someCustomValue={{custom1}} {{date}} appName={{appname}}'
  logModule.log('test')
  lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=INFO/))
  t.end()
})

test('logger.format allows format changes', t => {
  var originalFormat = logModule.format
  logModule.format = 'appName = {{appname}}'
  makeLogger()
  logModule.setKey('severity', 'WARN')
  logModule.log('test')
  logModule.format = originalFormat
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/appName =/), 'should use appName')
  t.end()
})
