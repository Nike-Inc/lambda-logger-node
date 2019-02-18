'use strict'

const test = require('blue-tape')
const sinon = require('sinon')
const { stub } = sinon
const { EventEmitter } = require('events')
// const { spawn } = require('child_process')

const { replaceAll } = require('../src/strings')
// The AWS lambda infrastructure does not use process.stdout or process.stderr
// but we can take advantage of the native node runtime using both for Console
const rewire = require('rewire')
const logModule = rewire('../src/logger')
const fakeConsole = { log: () => {}, error: () => {} }
const fakeProcess = new EventEmitter()
fakeProcess.exit = () => {}
fakeProcess.stdout = {
  write: console.log.bind(console)
}
fakeProcess.env = {}
logModule.__set__({
  console: fakeConsole,
  process: fakeProcess
})
const { Logger, LOG_DELIMITER } = logModule

test('Logger returns logger', t => {
  let logger = Logger({ useGlobalErrorHandler: false })
  t.ok('info' in logger, 'has info')
  t.ok('error' in logger, 'has error')
  t.ok('warn' in logger, 'has warn')
  t.ok('debug' in logger, 'has debug')
  t.ok('handler' in logger, 'has handler')
  t.ok('setKey' in logger, 'has setKey')
  t.ok('setMinimumLogLevel' in logger, 'has setMinimumLogLevel')
  t.end()
})

test('logger writes info to console', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.info('test')
  logger.debug('bug')
  let logCall = logs.firstCall.args[0]
  t.ok(logCall.startsWith('INFO test'), 'got test message')
  t.ok(logCall.includes(LOG_DELIMITER), ' has delimiter')
  t.ok(logs.secondCall.args[0].startsWith('DEBUG bug'), 'got test message')
}))

test('logger stringifies objects', logTest(async (t, { logs, errors }) => {
  t.plan(1)
  let logger = Logger({ useGlobalErrorHandler: false })
  let message = { name: 'tim', sub: { age: 30, sub2: { thing: 'stuff' } } }
  message.circ = message
  logger.info(message)
  let logCall = logs.firstCall.args[0]
  let logMessage = logCall.substring(logCall.indexOf('INFO ') + 5, logCall.indexOf('|'))
  logMessage = JSON.parse(logMessage)
  t.same(logMessage, { ...message, circ: '[Circular]' }, 'got object with circular removed')
}))

test('logger includes detailed message', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.setKey('detail', 'value')
  logger.info('message')
  let logCall = logs.firstCall.args[0]
  let logMessage = replaceAll(logCall.substring(logCall.indexOf('|') + 1), logModule.LOG_DELIMITER, '')
  logMessage = JSON.parse(logMessage)
  t.equal(logMessage.message, 'message', 'got message')
  t.equal(logMessage.detail, 'value', 'got detail')
  t.equal(logMessage.severity, 'INFO', 'got severity')
}))

test('logger sets standard mdc keys for handler', logTest(async (t, { logs, errors }) => {
  let logger = Logger({ useGlobalErrorHandler: false })

  await logger.handler(async (event, context) => {
    logger.setKey('detail', 'value')
    logger.info('handler message')
  })({}, { functionName: 'test-run', awsRequestId: 'trace', requestContext: { requestId: 'requestId' } })

  let logCall = logs.firstCall.args[0]
  // console.log(logCall)
  let logMessage = replaceAll(logCall.substring(logCall.indexOf('|') + 1), logModule.LOG_DELIMITER, '')
  logMessage = JSON.parse(logMessage)
  t.equal(logMessage.message, 'handler message', 'got message')
  t.equal(logMessage.severity, 'INFO', 'got severity')
  t.equal(logMessage.appName, 'test-run', 'got appname')
  t.equal(logMessage.apigTraceId, 'requestId', 'got requestId')
  t.equal(logMessage.traceId, 'trace', 'got trace')
  t.equal(logMessage.traceIndex, 0, 'got trace index')
  t.ok('date' in logMessage, 'got date')
}))

test('logger suppress messages below minimum severity', logTest(async (t, { logs, errors }) => {
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.setMinimumLogLevel('INFO')
  logger.debug('skip')
  logger.info('include')
  let logCall = logs.firstCall.args[0]
  t.ok(logCall.startsWith('INFO include'), 'got test message')
  t.ok(logCall.includes(LOG_DELIMITER), ' has delimiter')
  t.equal(logs.callCount, 1, 'got called once')
}))

test('logger suppress messages below minimum severity for errors', logTest(async (t, { logs, errors }) => {
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.setMinimumLogLevel('WARN')
  logger.info('skip')
  logger.warn('include')
  t.ok(errors.firstCall.args[0].startsWith('WARN include'), 'got test message')
  t.ok(errors.firstCall.args[0].includes(LOG_DELIMITER), ' has delimiter')
  t.equal(errors.callCount, 1, 'got warn')
  t.equal(logs.callCount, 0, 'no logs')
}))

test('sub-logger writes info to console', logTest(async (t, { logs, errors }) => {
  t.plan(4)
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.setKey('detail', 'value')
  let sub = logger.createSubLogger('db')
  sub.info('sub message')
  let logCall = logs.firstCall.args[0]
  t.ok(logCall.startsWith('INFO db sub message'), 'got context prefix')
  let logMessage = replaceAll(logCall.substring(logCall.indexOf('|') + 1), logModule.LOG_DELIMITER, '')
  logMessage = JSON.parse(logMessage)
  t.equal(logMessage.message, 'sub message', 'got message')
  t.equal(logMessage.detail, 'value', 'got detail')
  t.equal(logMessage.severity, 'INFO', 'got severity')
}))

test('sub-logger respects parent minimum log level', logTest(async (t, { logs, errors }) => {
  t.plan(5)
  let logger = Logger({ useGlobalErrorHandler: false })
  logger.setMinimumLogLevel('WARN')
  logger.setKey('detail', 'value')
  let sub = logger.createSubLogger('db')
  sub.info('skip')
  sub.warn('sub message')
  t.equal(logs.callCount, 0, 'log skipper')
  let logCall = errors.firstCall.args[0]
  t.ok(logCall.startsWith('WARN db sub message'), 'got context prefix')
  let logMessage = replaceAll(logCall.substring(logCall.indexOf('|') + 1), logModule.LOG_DELIMITER, '')
  logMessage = JSON.parse(logMessage)
  t.equal(logMessage.message, 'sub message', 'got message')
  t.equal(logMessage.detail, 'value', 'got detail')
  t.equal(logMessage.severity, 'WARN', 'got severity')
}))

test('logger registers global error handlers', logTest(async (t, { logs, errors, exits }) => {
  t.plan(5)
  let fakeLambdaErrorHandler = () => {}
  fakeProcess.on('uncaughtException', fakeLambdaErrorHandler)
  Logger({ forceGlobalErrorHandler: true })

  fakeProcess.emit('uncaughtException', { stack: 'fake stack' })
  fakeProcess.emit('unhandledRejection', { stack: 'fake stack' }, true)

  process.removeAllListeners('uncaughtException')
  process.removeAllListeners('unhandledRejection')

  let logCall = errors.firstCall.args[0]
  t.ok(logCall.startsWith('ERROR uncaught exception'), 'got error')
  t.ok(logCall.includes('fake stack'), 'got error')

  let rejectCall = errors.secondCall.args[0]
  t.ok(rejectCall.startsWith('ERROR unhandled rejection'), 'got error')
  t.ok(rejectCall.includes('fake stack'), 'got error')

  t.throws(() => Logger({ forceGlobalErrorHandler: true }), /twice/, 'did not allow second global handler logger')
}))

test('logger handles error handles in test mode', logTest(async (t, { logs, errors, exits }) => {
  t.plan(1)
  Logger({ useGlobalErrorHandler: true })
  try {
    Logger({ useGlobalErrorHandler: true })
    t.pass('did not throw on second global handler logger')
  } catch (e) {
    console.log('failed', logs.args)
    t.fail('threw')
    throw e
  }
}))

test('logger triggers beforeHandler events', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false })

  let calledHook = false
  logger.events.on('beforeHandler', (event, context) => {
    calledHook = true
    t.ok(event.isEvent, 'got event')
    t.ok(context.isContext, 'got context')
  })

  await logger.handler(async (event, context) => {
    t.equal(calledHook, true, 'called hook first')
  })({ isEvent: true }, { isContext: true })
}))

test('logger errors if handler is not async', logTest(async (t, { logs, errors }) => {
  let logger = Logger({ useGlobalErrorHandler: false })

  try {
    await logger.handler((event, context) => {
      return {}
    })({}, { functionName: 'test-run', awsRequestId: 'trace', requestContext: { requestId: 'requestId' } })
    t.fail('should have thrown')
  } catch (e) {
    t.ok(/return a promise/.test(e.toString()), 'got error')
  }
}))

test('logger throws if setting reserved key', logTest(async (t, { logs, errors }) => {
  let logger = Logger({ useGlobalErrorHandler: false })

  t.throws(() => logger.setKey('message', 'test'), /reserved/, 'got error')
}))

test('logger redacts bearer tokens', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false, useBearerRedactor: true })
  logger.info('Bearer eyflkua.dfhglkdubg')
  let logCall = logs.firstCall.args[0]
  // console.log(logCall)
  t.ok(logCall.includes('INFO --redacted--'), 'got test message')
  t.notOk(logCall.includes('eyflkua.dfhglkdubg'), 'did not find token')
  t.notOk(logCall.includes('dfhglkdubg'), 'did not find sub token')
}))

test('logger redacts bearer tokens without "bearer"', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false, useBearerRedactor: true })
  logger.info('Bearer eyflkua.dfhglkdubg')
  logger.info('eyflkua.dfhglkdubg')
  let logCall = logs.secondCall.args[0]
  // console.log(logCall)
  t.ok(logCall.includes('INFO --redacted--'), 'got test message')
  t.notOk(logCall.includes('eyflkua.dfhglkdubg'), 'did not find token')
  t.notOk(logCall.includes('dfhglkdubg'), 'did not find sub token')
}))

test('logger redacts bearer tokens in JSON', logTest(async (t, { logs, errors }) => {
  t.plan(3)
  let logger = Logger({ useGlobalErrorHandler: false, useBearerRedactor: true })
  logger.info(JSON.stringify({ headers: { Authorization: 'Bearer eyflkua.dfhglkdubg' } }))
  let logCall = logs.firstCall.args[0]
  // console.log(logCall)
  t.ok(logCall.includes('--redacted--'), 'got test message')
  t.notOk(logCall.includes('eyflkua.dfhglkdubg'), 'did not find token')
  t.notOk(logCall.includes('dfhglkdubg'), 'did not find sub token')
}))

test('logger uses redactors', logTest(async (t, { logs, errors }) => {
  t.plan(1)
  let logger = Logger({
    useGlobalErrorHandler: false,
    redactors: [
      'string',
      /regex/,
      (str) => str.replace('custom', '--removed--')
    ]
  })
  logger.info('string regex custom test')
  let logCall = logs.firstCall.args[0]
  t.ok(logCall.startsWith('INFO --redacted-- --redacted-- --removed-- test'), 'got test message')
}))

function logTest (testFn) {
  return async (t) => {
    let logs = stub(fakeConsole, 'log').callsFake((...args) => {
      // Enable for debugging
      // console.log('module log', ...args)
    })
    let errors = stub(fakeConsole, 'error')
    let exits = stub(fakeProcess, 'exit')
    try {
      return await testFn(t, { logs, errors, exits })
    } finally {
      sinon.restore()
    }
  }
}
