/* eslint-disable no-console */
'use strict'

const test = require('blue-tape')
const { wrapper: createLogger } = require('../src/logger')

test('when logger is not defined wrapper creates all methods', t => {
  const logger = createLogger()
  t.equal(typeof logger.error, 'function', 'Error is a function')
  t.equal(typeof logger.warn, 'function', 'Warn is a function')
  t.equal(typeof logger.info, 'function', 'Info is a function')
  t.equal(typeof logger.debug, 'function', 'Debug is a function')
  t.end()
})

test('when logger is empty object wrapper creates all methods', t => {
  const logger = createLogger({})
  t.equal(typeof logger.error, 'function', 'Error is a function')
  t.equal(typeof logger.warn, 'function', 'Warn is a function')
  t.equal(typeof logger.info, 'function', 'Info is a function')
  t.equal(typeof logger.debug, 'function', 'Debug is a function')
  t.end()
})

test('when logger defines non-function methods wrapper uses noop', t => {
  const localLogger = {
    log: 'string',
    error: 32,
    warn: ['array'],
    info: 'another string',
    debug: () => {
      return 'log'
    }
  }

  const logger = createLogger(localLogger)
  t.equal(typeof logger.error, 'function', 'Error is a function')
  t.equal(typeof logger.warn, 'function', 'Warn is a function')
  t.equal(typeof logger.info, 'function', 'Info is a function')
  t.equal(typeof logger.debug, 'function', 'Debug is a function')
  t.end()
})

test('logger methods are used when they are defined', t => {
  const localLogger = {
    error: () => 'error',
    warn: () => 'warn',
    info: () => 'info',
    debug: () => 'debug'
  }

  const logger = createLogger(localLogger)
  t.equal(logger.error(), 'error', 'Error should match the logger passed in')
  t.equal(logger.warn(), 'warn', 'Warn should match the logger passed in')
  t.equal(logger.info(), 'info', 'Info should match the logger passed in')
  t.equal(logger.debug(), 'debug', 'Debug should match the logger passed in')
  t.end()
})

test('allows console to be used as logger', t => {
  let called = false
  let original = console.info
  console.info = () => {
    called = true
  }
  const logger = createLogger(console)
  logger.info()
  t.equal(called, true, 'console.info was used')
  console.info = original
  t.end()
})

test('minimumLogLevel throws on invalid value', t => {
  t.throws(
    () => createLogger({ minimumLogLevel: 'fake' }),
    /minimumLogLevel" must be one of/,
    'throws on "fake" level'
  )
  t.doesNotThrow(
    () => createLogger({ minimumLogLevel: 'info' }),
    'allows "info" level'
  )
  t.end()
})

test('minimumLogLevel is respected', t => {
  const localLogger = {
    minimumLogLevel: 'info',
    error: () => 'error',
    warn: () => 'warn',
    info: () => 'info',
    debug: () => 'debug'
  }

  const logger = createLogger(localLogger)
  t.equal(logger.error(), 'error', 'Error calls passed in function')
  t.equal(logger.warn(), 'warn', 'Warn calls passed in function')
  t.equal(logger.info(), 'info', 'Info calls passed in function')
  t.equal(logger.debug(), undefined, 'Debug is not called')

  localLogger.minimumLogLevel = 'error'
  t.equal(
    logger.info(),
    undefined,
    'Info is not called after updating minimumLogLevel'
  )
  t.end()
})
