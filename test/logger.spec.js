/* eslint-disable no-console */
'use strict'

const test = require('blue-tape')
const sinon = require('sinon')
const { stub } = sinon
const { EventEmitter } = require('events')
// const { spawn } = require('child_process')

const { replaceAll } = require('../src/strings')
const {
  UNHANDLED_REJECTION_LISTENERS,
  LAMBDA_PREPENDS_SEVERITY
} = require('../src/config')
// The AWS lambda infrastructure does not use process.stdout or process.stderr
// but we can take advantage of the native node runtime using both for Console
const proxyquire = require('proxyquire').noPreserveCache()

function logTest(options, testFn) {
  if (!testFn) {
    testFn = options
    options = {}
  }
  let { version = process.version } = options
  return async t => {
    const fakeConsole = {
      log: stub(),
      debug: stub(),
      warn: stub(),
      error: stub()
    }
    const fakeProcess = new EventEmitter()

    fakeProcess.exit = stub()
    fakeProcess.stdout = {
      write: console.log.bind(console)
    }
    fakeProcess.version = version
    fakeProcess.env = {}

    const logModule = proxyquire('../src/logger', {
      './system': {
        console: fakeConsole,
        process: fakeProcess
      },
      './config': {
        UNHANDLED_REJECTION_LISTENERS:
          options.listeners !== undefined
            ? options.listeners
            : UNHANDLED_REJECTION_LISTENERS,
        LAMBDA_PREPENDS_SEVERITY:
          options.lambdaPrepends !== undefined
            ? options.lambdaPrepends
            : LAMBDA_PREPENDS_SEVERITY
      }
    })

    let logs = fakeConsole.log
    let warns = fakeConsole.warn
    let debugs = fakeConsole.debug
    let errors = fakeConsole.error
    let exits = fakeProcess.exit

    const { Logger, LOG_DELIMITER } = logModule
    try {
      return await testFn(t, {
        logs,
        warns,
        errors,
        debugs,
        exits,
        Logger,
        LOG_DELIMITER,
        fakeProcess,
        fakeConsole
      })
    } finally {
      sinon.restore()
    }
  }
}

const testToken =
  'eyJraWQiOiIxTkJ3QTJDeWpKRmdDYU5SOXlXZW1jY2ZaaDFjZ19ET1haWXVWcS1oX2RFIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULjV5bFc5ekxBM0xGdkJVVldFY0F3NmdBVkl6SlRaUWJzRTE2S2VEUnpfT3MiLCJpc3MiOiJodHRwczovL25pa2UtcWEub2t0YXByZXZpZXcuY29tL29hdXRoMi9hdXNhMG1jb3JucFpMaTBDNDBoNyIsImF1ZCI6Imh0dHBzOi8vbmlrZS1xYS5va3RhcHJldmlldy5jb20iLCJpYXQiOjE1NTA1MzA5MjYsImV4cCI6MTU1MDUzNDUyNiwiY2lkIjoibmlrZS5uaWtldGVjaC50b2tlbi1nZW5lcmF0b3IiLCJ1aWQiOiIwMHU4Y2F1dGgxczhqN2ZFYjBoNyIsInNjcCI6WyJvcGVuaWQiLCJwcm9maWxlIiwiZW1haWwiXSwic3ViIjoiVGltb3RoeS5LeWVAbmlrZS5jb20iLCJncm91cHMiOlsiQXBwbGljYXRpb24uVVMuRlRFLlVzZXJzIl19.nEfPoRPvrL1x6zsNzPWDN14AYV_AG62L0-I6etCGJlZZaOGFMnjBw4FLD-6y30MNdufwweVJ-RHApjDDaPVNQja6K7jaxBmZ1ryWy-JOO1IootRrF3aew5JlE6Q9CQ93I39uHsRCwWiy8tG_rYy7isv8ygz9xnCBRb3NQj7oBChJPvkwvO_DXD4MHde54aXLY6yryuHse-1MuEBXveZmCr6D2cUgHFNXFMwSwazXifHe8tJe2mItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'
const tokenSignature =
  'nEfPoRPvrL1x6zsNzPWDN14AYV_AG62L0-I6etCGJlZZaOGFMnjBw4FLD-6y30MNdufwweVJ-RHApjDDaPVNQja6K7jaxBmZ1ryWy-JOO1IootRrF3aew5JlE6Q9CQ93I39uHsRCwWiy8tG_rYy7isv8ygz9xnCBRb3NQj7oBChJPvkwvO_DXD4MHde54aXLY6yryuHse-1MuEBXveZmCr6D2cUgHFNXFMwSwazXifHe8tJe2mItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'
const subSignature =
  'ItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'

test(
  'Logger returns logger',
  logTest(async (t, { Logger }) => {
    let logger = Logger({ useGlobalErrorHandler: false })
    t.ok('info' in logger, 'has info')
    t.ok('error' in logger, 'has error')
    t.ok('warn' in logger, 'has warn')
    t.ok('debug' in logger, 'has debug')
    t.ok('handler' in logger, 'has handler')
    t.ok('setKey' in logger, 'has setKey')
    t.ok('setMinimumLogLevel' in logger, 'has setMinimumLogLevel')
  })
)

test(
  'logger writes info to console',
  logTest(async (t, { logs, debugs, Logger, LOG_DELIMITER }) => {
    t.plan(3)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.info('test')
    logger.debug('bug')
    let logCall = logs.firstCall.args[0]
    t.ok(logCall.includes('test |'), 'got test message')
    t.ok(logCall.includes(LOG_DELIMITER), ' has delimiter')
    t.ok(debugs.firstCall.args[0].includes('bug'), 'got test message')
  })
)

test(
  'logger stringifies objects',
  logTest({ lambdaPrepends: false }, async (t, { logs, Logger }) => {
    t.plan(1)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    let message = { name: 'tim', sub: { age: 30, sub2: { thing: 'stuff' } } }
    message.circ = message
    logger.info(message)
    let logCall = logs.firstCall.args[0]
    let logMessage = logCall.substring(
      logCall.indexOf('INFO ') + 5,
      logCall.indexOf('|')
    )
    logMessage = JSON.parse(logMessage)
    t.same(
      logMessage,
      { ...message, circ: '[Circular]' },
      'got object with circular removed'
    )
  })
)

test(
  'logger includes detailed message',
  logTest(async (t, { logs, Logger, LOG_DELIMITER }) => {
    t.plan(3)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setKey('detail', 'value')
    logger.info('message')
    let logCall = logs.firstCall.args[0]
    let logMessage = replaceAll(
      logCall.substring(logCall.indexOf('|') + 1),
      LOG_DELIMITER,
      ''
    )
    logMessage = JSON.parse(logMessage)
    t.equal(logMessage.message, 'message', 'got message')
    t.equal(logMessage.detail, 'value', 'got detail')
    t.equal(logMessage.severity, 'INFO', 'got severity')
  })
)

test(
  'logger sets standard mdc keys for handler',
  logTest(async (t, { logs, Logger, LOG_DELIMITER }) => {
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    await logger.handler(async () => {
      logger.setKey('detail', 'value')
      logger.info('handler message')
    })(
      {},
      {
        functionName: 'test-run',
        awsRequestId: 'trace',
        requestContext: { requestId: 'requestId' }
      }
    )

    let logCall = logs.firstCall.args[0]
    // console.log(logCall)
    let logMessage = replaceAll(
      logCall.substring(logCall.indexOf('|') + 1),
      LOG_DELIMITER,
      ''
    )
    logMessage = JSON.parse(logMessage)
    t.equal(logMessage.message, 'handler message', 'got message')
    t.equal(logMessage.severity, 'INFO', 'got severity')
    t.equal(logMessage.appName, 'test-run', 'got appname')
    t.equal(logMessage.apigTraceId, 'requestId', 'got requestId')
    t.equal(logMessage.traceId, 'trace', 'got trace')
    t.equal(logMessage.traceIndex, 0, 'got trace index')
    t.ok('date' in logMessage, 'got date')
  })
)

test(
  'logger suppress messages below minimum severity',
  logTest(
    { lambdaPrepends: false },
    async (t, { logs, debugs, Logger, LOG_DELIMITER }) => {
      let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
      logger.setMinimumLogLevel('INFO')
      logger.debug('skip')
      logger.info('include')
      let logCall = logs.firstCall.args[0]
      t.ok(logCall.includes('include |'), 'got test message')
      t.ok(logCall.includes(LOG_DELIMITER), ' has delimiter')
      t.equal(logs.callCount, 1, 'got called once')
      t.equal(debugs.callCount, 0, 'debug skipped')
    }
  )
)

test(
  'logger suppress messages below minimum severity for errors',
  logTest(async (t, { logs, warns, Logger, LOG_DELIMITER }) => {
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('WARN')
    logger.info('skip')
    logger.warn('include')
    t.ok(warns.firstCall.args[0].includes('include'), 'got test message')
    t.ok(warns.firstCall.args[0].includes(LOG_DELIMITER), ' has delimiter')
    t.equal(warns.callCount, 1, 'got warn')
    t.equal(logs.callCount, 0, 'no logs')
  })
)

test(
  'sub-logger writes info to console',
  logTest(async (t, { logs, Logger, LOG_DELIMITER }) => {
    t.plan(4)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setKey('detail', 'value')
    let sub = logger.createSubLogger('db')
    sub.info('sub message')
    let logCall = logs.firstCall.args[0]
    t.ok(logCall.includes('db sub message |'), 'got context prefix')
    let logMessage = replaceAll(
      logCall.substring(logCall.indexOf('|') + 1),
      LOG_DELIMITER,
      ''
    )
    logMessage = JSON.parse(logMessage)
    t.equal(logMessage.message, 'sub message', 'got message')
    t.equal(logMessage.detail, 'value', 'got detail')
    t.equal(logMessage.severity, 'INFO', 'got severity')
  })
)

test(
  'sub-logger respects parent minimum log level',
  logTest(async (t, { logs, warns, Logger, errors, LOG_DELIMITER }) => {
    t.plan(5)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('WARN')
    logger.setKey('detail', 'value')
    let sub = logger.createSubLogger('db')
    sub.info('skip')
    sub.warn('sub message')
    t.equal(logs.callCount, 0, 'log skipper')
    let logCall = warns.firstCall.args[0]
    t.ok(logCall.includes('db sub message |'), 'got context prefix')
    let logMessage = replaceAll(
      logCall.substring(logCall.indexOf('|') + 1),
      LOG_DELIMITER,
      ''
    )
    logMessage = JSON.parse(logMessage)
    t.equal(logMessage.message, 'sub message', 'got message')
    t.equal(logMessage.detail, 'value', 'got detail')
    t.equal(logMessage.severity, 'WARN', 'got severity')
  })
)

test(
  'logger registers global error handlers for node8',
  logTest(
    { lambdaPrepends: true, listeners: 0 },
    async (t, { errors, Logger, fakeProcess }) => {
      t.plan(5)
      let fakeLambdaErrorHandler = () => null
      fakeProcess.removeAllListeners('uncaughtException')
      fakeProcess.removeAllListeners('unhandledRejection')
      fakeProcess.on('uncaughtException', fakeLambdaErrorHandler)
      process.removeAllListeners('unhandledRejection')
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

      t.throws(
        () => Logger({ forceGlobalErrorHandler: true }),
        /twice/,
        'did not allow second global handler logger'
      )
    }
  )
)

test(
  'logger registers global error handlers node10',
  logTest(
    { lambdaPrepends: false, listeners: 1 },
    async (t, { logs, Logger, errors, fakeProcess }) => {
      t.plan(5)
      let fakeLambdaErrorHandler = () => null
      fakeProcess.removeAllListeners('uncaughtException')
      fakeProcess.removeAllListeners('unhandledRejection')
      fakeProcess.on('uncaughtException', fakeLambdaErrorHandler)
      fakeProcess.on('unhandledRejection', fakeLambdaErrorHandler)
      Logger({ forceGlobalErrorHandler: true })

      fakeProcess.emit('uncaughtException', { stack: 'fake stack' })
      fakeProcess.emit('unhandledRejection', { stack: 'fake stack' }, true)

      process.removeAllListeners('uncaughtException')
      process.removeAllListeners('unhandledRejection')

      let logCall = errors.firstCall.args[0]
      t.ok(logCall.startsWith('ERROR uncaught exception'), 'got error')
      t.ok(logCall.includes('fake stack'), 'got stack')

      let rejectCall = errors.secondCall.args[0]
      t.ok(rejectCall.startsWith('ERROR unhandled rejection'), 'got error')
      t.ok(rejectCall.includes('fake stack'), 'got stack')

      t.throws(
        () => Logger({ forceGlobalErrorHandler: true }),
        /twice/,
        'did not allow second global handler logger'
      )
    }
  )
)

test(
  'logger handles error handles in test mode',
  logTest(async (t, { logs, Logger }) => {
    t.plan(1)
    Logger({ useGlobalErrorHandler: true, testMode: true })
    try {
      Logger({ useGlobalErrorHandler: true, testMode: true })
      t.pass('did not throw on second global handler logger')
    } catch (e) {
      console.log('failed', logs.args)
      t.fail('threw')
      throw e
    }
  })
)

test(
  'logger triggers beforeHandler events',
  logTest(async (t, { Logger }) => {
    t.plan(3)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    let calledHook = false
    logger.events.on('beforeHandler', (event, context) => {
      calledHook = true
      t.ok(event.isEvent, 'got event')
      t.ok(context.isContext, 'got context')
    })

    await logger.handler(async () => {
      t.equal(calledHook, true, 'called hook first')
    })({ isEvent: true }, { isContext: true })
  })
)

test(
  'logger errors if handler is not async',
  logTest(async (t, { Logger }) => {
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    try {
      await logger.handler(() => {
        return {}
      })(
        {},
        {
          functionName: 'test-run',
          awsRequestId: 'trace',
          requestContext: { requestId: 'requestId' }
        }
      )
      t.fail('should have thrown')
    } catch (e) {
      t.ok(/return a promise/.test(e.toString()), 'got error')
    }
  })
)

test(
  'logger throws if setting reserved key',
  logTest(async (t, { Logger }) => {
    let logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    t.throws(() => logger.setKey('message', 'test'), /reserved/, 'got error')
  })
)

test(
  'logger redacts bearer tokens',
  logTest(async (t, { logs, Logger }) => {
    // t.plan(4)
    let logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true
    })
    logger.info(`Bearer ${testToken}`)
    // console.log(logs.callCount)
    let logCall = logs.firstCall.args[0]
    t.ok(logCall.includes('--redacted--'), 'got test message')
    t.notOk(logCall.includes(testToken), 'did not find token')
    t.notOk(logCall.includes(tokenSignature), 'did not find sub token')
    t.notOk(logCall.includes(subSignature), 'did not find sub section')
  })
)

test(
  'logger uses TestFormatter in testMode',
  logTest({ lambdaPrepends: false }, async (t, { logs, Logger }) => {
    t.plan(1)
    let logger = Logger({ useGlobalErrorHandler: false, testMode: true })
    logger.info('something')
    let logCall = logs.firstCall.args[0]
    t.equal(logCall, 'INFO something', 'no json')
  })
)

test(
  'logger redacts bearer tokens without "bearer"',
  logTest({ lambdaPrepends: false }, async (t, { logs, Logger }) => {
    t.plan(4)
    let logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true
    })
    logger.info(`Bearer ${testToken}`)
    logger.info(`message "${testToken}"`)
    let logCall = logs.secondCall.args[0]
    t.ok(logCall.includes('INFO message'), 'got test message')
    t.notOk(logCall.includes(testToken), 'did not find token')
    t.notOk(logCall.includes(tokenSignature), 'did not find sub token')
    t.notOk(logCall.includes(subSignature), 'did not find sub section')
  })
)

test(
  'logger redacts bearer tokens in JSON',
  logTest(async (t, { logs, Logger }) => {
    t.plan(4)
    let logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true
    })
    logger.info(
      JSON.stringify({ headers: { Authorization: `Bearer ${testToken}` } })
    )
    let logCall = logs.firstCall.args[0]
    // console.log(logCall)
    t.ok(logCall.includes('--redacted--'), 'got test message')
    t.notOk(logCall.includes(testToken), 'did not find token')
    t.notOk(logCall.includes(tokenSignature), 'did not find sub token')
    t.notOk(logCall.includes(subSignature), 'did not find sub section')
  })
)

test(
  'logger redacts bearer tokens in object',
  logTest(async (t, { logs, Logger }) => {
    t.plan(4)
    let logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true
    })
    logger.info({ headers: { Authorization: `Bearer ${testToken}` } })
    let logCall = logs.firstCall.args[0]
    // console.log(logCall)
    t.ok(logCall.includes('--redacted--'), 'got test message')
    t.notOk(logCall.includes(testToken), 'did not find token')
    t.notOk(logCall.includes(tokenSignature), 'did not find sub token')
    t.notOk(logCall.includes(subSignature), 'did not find sub section')
  })
)

test(
  'logger uses redactors',
  logTest({ lambdaPrepends: false }, async (t, { logs, Logger }) => {
    t.plan(1)
    let logger = Logger({
      useGlobalErrorHandler: false,
      redactors: [
        'string',
        /regex/,
        str => str.replace('custom', '--removed--')
      ]
    })
    logger.info('string regex custom test')
    let logCall = logs.firstCall.args[0]
    t.ok(
      logCall.startsWith('INFO --redacted-- --redacted-- --removed-- test'),
      'got test message'
    )
  })
)
