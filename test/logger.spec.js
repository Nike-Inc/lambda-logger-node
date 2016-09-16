'use strict'

var test = require('blue-tape')
var logModule = require('../src/index')

// TAP uses logs for test results
// Since logger hijacks the console.log, we need to restore it, or TAP breaks
// We can hijack logger's log though, and capture it's calls
var originalLog = console.log
var loggerLog
var logCalls = []
logCalls.last = () => logCalls.length ? logCalls[logCalls.length - 1] : null

var prepareConsole = () => { console.log = function () { logCalls.push(Array.prototype.slice.call(arguments)) } }
var testLogWrapper = () => {
  loggerLog = console.log
  console.log = originalLog
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
  // You will need to override these for any tests that use them
  succeed: () => {},
  fail: () => {},
  done: () => {}
}
const noop = () => {}
const makeLogger = (event, context, callback) => {
  prepareConsole()
  var l = logModule((e, c, cb) => { testLogWrapper(); cb(null, 'done') })
  l(Object.assign({}, defaultEvent, event), Object.assign({}, defaultContext, context), callback || noop)
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
    t.ok(accessLog.match(/requestURL=\/some\/route requestMethod=GET elapsedTime=-?\d+ accessToken=Bearer 12 restApiId=request-id/))
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
  logModule.log("foo")
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/severity=info/))
  t.end()
})

test('logger prepends default severity of info', t => {
  makeLogger()
  logModule.log('foo')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appname=test-function version=test-version severity=info/))
  t.end()
})

test('logger prepends utility method severity levels', t => {
  makeLogger()
  logModule.warn("foo")
  t.ok(logCalls.last()[0].match(/severity=warn/))
  logModule.debug("foo")
  t.ok(logCalls.last()[0].match(/severity=debug/))
  logModule.trace("foo")
  t.ok(logCalls.last()[0].match(/severity=trace/))
  logModule.fatal("foo")
  t.ok(logCalls.last()[0].match(/severity=fatal/))
  logModule.info("foo")
  t.ok(logCalls.last()[0].match(/severity=info/))
  logModule.error("foo")
  t.ok(logCalls.last()[0].match(/severity=error/))
  t.end()
})

test('logger should respect default severity set', t => {
  makeLogger()
  logModule.setKey('severity', 'warn')
  logModule.log('foo')
  var lastCall = logCalls.last()
  t.ok(lastCall[0].match(/traceId=asdfghjkl (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) appname=test-function version=test-version severity=warn/))
  t.end()
})

test('logger should work if severity is removed from prefix', t => {
  makeLogger()
  logModule.logFormat = 'traceId={{traceId}} severity={{severity}} {{date}} appname={{appname}}'
  logModule.log('foo')
  var lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=info/))
  logModule.logFormat = 'traceId={{traceId}} someCustomValue={{custom1}} {{date}} appname={{appname}}'
  logModule.log('foo')
  var lastCall = logCalls.last()
  t.ok(!lastCall[0].match(/severity=info/))
  t.end()
})
