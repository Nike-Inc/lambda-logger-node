/* eslint-disable no-console */
import { wrapper as createLogger } from '../src/wrapper'

describe('Wrapper', () => {
  test('when logger is not defined wrapper creates all methods', () => {
    const logger = createLogger(undefined)
    expect(typeof logger.error).toEqual('function')
    expect(typeof logger.warn).toEqual('function')
    expect(typeof logger.info).toEqual('function')
    expect(typeof logger.debug).toEqual('function')
  })

  test('when logger is empty object wrapper creates all methods', () => {
    const logger = createLogger({})
    expect(typeof logger.error).toEqual('function')
    expect(typeof logger.warn).toEqual('function')
    expect(typeof logger.info).toEqual('function')
    expect(typeof logger.debug).toEqual('function')
  })

  test('when logger defines non-function methods wrapper uses noop', () => {
    const localLogger = {
      log: 'string',
      error: 32,
      warn: ['array'],
      info: 'another string',
      debug: () => {
        return 'log'
      },
    }

    const logger = createLogger(localLogger)
    expect(typeof logger.error).toEqual('function')
    expect(typeof logger.warn).toEqual('function')
    expect(typeof logger.info).toEqual('function')
    expect(typeof logger.debug).toEqual('function')
  })

  test('logger methods are used when they are defined', () => {
    const localLogger = {
      error: () => 'error',
      warn: () => 'warn',
      info: () => 'info',
      debug: () => 'debug',
    }

    const logger = createLogger(localLogger)
    expect(logger.error()).toEqual('error')
    expect(logger.warn()).toEqual('warn')
    expect(logger.info()).toEqual('info')
    expect(logger.debug()).toEqual('debug')
  })

  test('allows console to be used as logger', () => {
    let called = false
    const original = console.info
    console.info = () => {
      called = true
    }
    const logger = createLogger(console)
    logger.info()
    expect(called).toEqual(true)
    console.info = original
  })

  test('minimumLogLevel throws on invalid value', () => {
    expect(() => createLogger({ minimumLogLevel: 'fake' })).toThrow(
      /minimumLogLevel" must be one of/
    )
    expect(() => createLogger({ minimumLogLevel: 'INFO' })).not.toThrow()
  })

  test('minimumLogLevel is respected', () => {
    const localLogger = {
      minimumLogLevel: 'INFO',
      error: () => 'error',
      warn: () => 'warn',
      info: () => 'info',
      debug: () => 'debug',
    }

    const logger = createLogger(localLogger)
    expect(logger.error()).toEqual('error')
    expect(logger.warn()).toEqual('warn')
    expect(logger.info()).toEqual('info')
    expect(logger.debug()).toEqual(undefined)

    localLogger.minimumLogLevel = 'ERROR'
    expect(logger.info()).toEqual(undefined)
  })
})
