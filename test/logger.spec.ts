/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-console */
import { EventEmitter } from 'events'

import { replaceAll } from '../src/strings'
import { Logger, LOG_DELIMITER } from '../src/logger'

import * as system from '../src/system'

jest.mock('../src/system', () => {
  const fakeProcess: any = new EventEmitter()

  fakeProcess.exit = jest.fn()
  fakeProcess.stdout = {
    write: console.log.bind(console),
  }
  fakeProcess.version = 'local-test'
  fakeProcess.env = {}

  return {
    UNHANDLED_REJECTION_LISTENERS: 1,
    console: {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    process: fakeProcess,
  }
})

const testToken =
  'eyJraWQiOiIxTkJ3QTJDeWpKRmdDYU5SOXlXZW1jY2ZaaDFjZ19ET1haWXVWcS1oX2RFIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULjV5bFc5ekxBM0xGdkJVVldFY0F3NmdBVkl6SlRaUWJzRTE2S2VEUnpfT3MiLCJpc3MiOiJodHRwczovL25pa2UtcWEub2t0YXByZXZpZXcuY29tL29hdXRoMi9hdXNhMG1jb3JucFpMaTBDNDBoNyIsImF1ZCI6Imh0dHBzOi8vbmlrZS1xYS5va3RhcHJldmlldy5jb20iLCJpYXQiOjE1NTA1MzA5MjYsImV4cCI6MTU1MDUzNDUyNiwiY2lkIjoibmlrZS5uaWtldGVjaC50b2tlbi1nZW5lcmF0b3IiLCJ1aWQiOiIwMHU4Y2F1dGgxczhqN2ZFYjBoNyIsInNjcCI6WyJvcGVuaWQiLCJwcm9maWxlIiwiZW1haWwiXSwic3ViIjoiVGltb3RoeS5LeWVAbmlrZS5jb20iLCJncm91cHMiOlsiQXBwbGljYXRpb24uVVMuRlRFLlVzZXJzIl19.nEfPoRPvrL1x6zsNzPWDN14AYV_AG62L0-I6etCGJlZZaOGFMnjBw4FLD-6y30MNdufwweVJ-RHApjDDaPVNQja6K7jaxBmZ1ryWy-JOO1IootRrF3aew5JlE6Q9CQ93I39uHsRCwWiy8tG_rYy7isv8ygz9xnCBRb3NQj7oBChJPvkwvO_DXD4MHde54aXLY6yryuHse-1MuEBXveZmCr6D2cUgHFNXFMwSwazXifHe8tJe2mItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'
const tokenSignature =
  'nEfPoRPvrL1x6zsNzPWDN14AYV_AG62L0-I6etCGJlZZaOGFMnjBw4FLD-6y30MNdufwweVJ-RHApjDDaPVNQja6K7jaxBmZ1ryWy-JOO1IootRrF3aew5JlE6Q9CQ93I39uHsRCwWiy8tG_rYy7isv8ygz9xnCBRb3NQj7oBChJPvkwvO_DXD4MHde54aXLY6yryuHse-1MuEBXveZmCr6D2cUgHFNXFMwSwazXifHe8tJe2mItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'
const subSignature =
  'ItRq5l4zSZJQYDexm8Ww5XTwItiQZXV50dMF7F3D2A2tKwqF10CWy3ilw40BOEa3n0ptsDZmD4I3R0711vz_A21z3vYjqjt8pIxw'

afterEach(() => {
  jest.resetAllMocks()
})

function getParsedLog(
  type: 'log' | 'debug' | 'warn' | 'error' = 'log',
  index = 0
): any {
  const logCall = getLog(type, index)
  return JSON.parse(
    replaceAll(logCall.substring(logCall.indexOf('|') + 1), LOG_DELIMITER, '')
  )
}

function getLog(
  type: 'log' | 'debug' | 'warn' | 'error' = 'log',
  index = 0
): string {
  return (system.console[type] as jest.Mock).mock.calls[index][0]
}

describe('Logger', () => {
  test('returns logger', () => {
    const logger = Logger({ useGlobalErrorHandler: false })

    expect(Object.keys(logger)).toEqual(
      expect.arrayContaining([
        'info',
        'error',
        'warn',
        'debug',
        'handler',
        'setKey',
        'setMinimumLogLevel',
      ])
    )
  })
  test('writes info to console', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.info('test')
    logger.debug('bug')

    expect(system.console.log).toHaveBeenCalledWith(
      expect.stringContaining('test |')
    )
    expect(system.console.log).toHaveBeenCalledWith(
      expect.stringContaining(LOG_DELIMITER)
    )
    expect(system.console.debug).toHaveBeenCalledWith(
      expect.stringContaining('bug')
    )
  })

  test('stringifies objects with circular props', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    const message: any = {
      name: 'tim',
      sub: { age: 30, sub2: { thing: 'stuff' } },
    }

    message.circ = message
    logger.info(message)

    expect(system.console.log).toHaveBeenCalledWith(
      expect.stringContaining('"circ": "[Circular]"')
    )
  })

  test('includes detailed message', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setKey('detail', 'value')
    logger.info('message')

    const logMessage = getParsedLog()
    expect(logMessage.message).toEqual('message')
    expect(logMessage.detail).toEqual('value')
    expect(logMessage.severity).toEqual('INFO')
  })

  test('sets standard mdc keys for handler', async () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    await logger.handler(async () => {
      logger.setKey('detail', 'value')
      logger.info('handler message')
    })(
      {},
      {
        functionName: 'test-run',
        awsRequestId: 'trace',
        requestContext: { requestId: 'requestId' },
      }
    )

    const logMessage = getParsedLog()

    expect(logMessage.message).toEqual('handler message')
    expect(logMessage.severity).toEqual('INFO')
    expect(logMessage.appName).toEqual('test-run')
    expect(logMessage.apigTraceId).toEqual('requestId')
    expect(logMessage.traceId).toEqual('trace')
    expect(logMessage.traceIndex).toEqual(0)
    expect(logMessage.date).toBeDefined()
  })

  test('suppress messages below minimum severity', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('INFO')
    logger.debug('skip')
    logger.info('include')

    const logCall = getLog()

    expect(logCall).toContain('include |')
    expect(logCall).toContain(LOG_DELIMITER)
    expect(system.console.log).toHaveBeenCalledTimes(1)
    expect(system.console.debug).toHaveBeenCalledTimes(0)
  })

  test('suppress messages below minimum severity for errors', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('WARN')
    logger.info('skip')
    logger.warn('include')

    const warnCall = getLog('warn')

    expect(warnCall).toContain('include |')
    expect(warnCall).toContain(LOG_DELIMITER)
    expect(system.console.warn).toHaveBeenCalledTimes(1)
    expect(system.console.log).toHaveBeenCalledTimes(0)
  })

  test('suppress all messages for silent', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('SILENT')
    logger.info('skip')
    logger.error('skip')
    expect(system.console.error).toHaveBeenCalledTimes(0)
    expect(system.console.log).toHaveBeenCalledTimes(0)
  })

  test('sub-logger writes info to console', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setKey('detail', 'value')

    const sub = logger.createSubLogger('db')
    sub.info('sub message')

    const logCall = getLog()
    expect(logCall).toContain('db sub message |')

    const logMessage = getParsedLog()
    expect(logMessage.message).toEqual('sub message')
    expect(logMessage.detail).toEqual('value')
    expect(logMessage.severity).toEqual('INFO')
  })

  test('sub-logger respects parent minimum log level', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })
    logger.setMinimumLogLevel('WARN')
    logger.setKey('detail', 'value')

    const sub = logger.createSubLogger('db')
    sub.info('skip')
    sub.warn('sub message')

    expect(system.console.log).toBeCalledTimes(0)
    expect(system.console.warn).toBeCalledTimes(1)

    const logCall = getLog('warn')
    expect(logCall).toContain('db sub message |')

    const logMessage = getParsedLog('warn')
    expect(logMessage.message).toEqual('sub message')
    expect(logMessage.detail).toEqual('value')
    expect(logMessage.severity).toEqual('WARN')
  })

  test('registers global error handlers node12', () => {
    const fakeLambdaErrorHandler = jest.fn()
    system.process.removeAllListeners('uncaughtException')
    system.process.removeAllListeners('unhandledRejection')
    system.process.on('uncaughtException', fakeLambdaErrorHandler)
    system.process.on('unhandledRejection', fakeLambdaErrorHandler)
    Logger({ forceGlobalErrorHandler: true })

    // @ts-ignore
    system.process.emit('uncaughtException', { stack: 'fake stack' })
    // @ts-ignore
    system.process.emit('unhandledRejection', { stack: 'fake stack' }, true)

    process.removeAllListeners('uncaughtException')
    process.removeAllListeners('unhandledRejection')

    const logCall = getLog('error')
    expect(logCall).toMatch(/^uncaught exception/)
    expect(logCall).toContain('fake stack')

    const rejectCall = getLog('error', 1)
    expect(rejectCall).toMatch(/^unhandled rejection/)
    expect(rejectCall).toContain('fake stack')

    expect(() => Logger({ forceGlobalErrorHandler: true })).toThrow(/twice/)
  })

  test('handles error handles in test mode', () => {
    Logger({ useGlobalErrorHandler: true, testMode: true })
    Logger({ useGlobalErrorHandler: true, testMode: true })
  })

  test('triggers beforeHandler events', async () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    let calledHook = false
    logger.events.on('beforeHandler', (event, context) => {
      calledHook = true
      expect(event.isEvent).toBeDefined()
      expect(context.isContext).toBeDefined()
    })

    await logger.handler(async () => {
      expect(calledHook).toBe(true)
    })({ isEvent: true }, { isContext: true })

    expect.assertions(3)
  })

  test('errors if handler is not async', async () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    await expect(
      logger.handler(() => {
        return {}
      })(
        {},
        {
          functionName: 'test-run',
          awsRequestId: 'trace',
          requestContext: { requestId: 'requestId' },
        }
      )
    ).rejects.toThrow(/return a promise/)
  })

  test('throws if setting reserved key', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: false })

    expect(() => logger.setKey('message', 'test')).toThrow(/reserved/)
  })

  test('uses TestFormatter in testMode', () => {
    const logger = Logger({ useGlobalErrorHandler: false, testMode: true })
    logger.info('something')
    const logCall = getLog()
    expect(logCall).toEqual('something')
  })

  test('redacts bearer tokens', () => {
    const logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true,
    })
    logger.info(`Bearer ${testToken}`)
    const logCall = getLog()
    expect(logCall).toContain('--redacted--')
    expect(logCall).not.toContain(testToken)
    expect(logCall).not.toContain(tokenSignature)
    expect(logCall).not.toContain(subSignature)
  })

  test('redacts bearer tokens without "bearer"', () => {
    const logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true,
    })

    // redactor needs to be initialized
    logger.info(`Bearer ${testToken}`)
    // this is the log we check
    logger.info(`message "${testToken}"`)
    const logCall = getLog('log', 1)
    expect(logCall).toContain('--redacted--')
    expect(logCall).not.toContain(testToken)
    expect(logCall).not.toContain(tokenSignature)
    expect(logCall).not.toContain(subSignature)
  })

  test('redacts bearer tokens in JSON', () => {
    const logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true,
    })
    logger.info(
      JSON.stringify({ headers: { Authorization: `Bearer ${testToken}` } })
    )
    const logCall = getLog()
    expect(logCall).toContain('--redacted--')
    expect(logCall).not.toContain(testToken)
    expect(logCall).not.toContain(tokenSignature)
    expect(logCall).not.toContain(subSignature)
  })

  test('redacts bearer tokens in object', () => {
    const logger = Logger({
      useGlobalErrorHandler: false,
      useBearerRedactor: true,
    })
    logger.info({ headers: { Authorization: `Bearer ${testToken}` } })
    const logCall = getLog()
    expect(logCall).toContain('--redacted--')
    expect(logCall).not.toContain(testToken)
    expect(logCall).not.toContain(tokenSignature)
    expect(logCall).not.toContain(subSignature)
  })

  test('uses redactors', () => {
    const logger = Logger({
      useGlobalErrorHandler: false,
      redactors: [
        'string',
        /regex/,
        (str) => str.replace('custom', '--removed--'),
      ],
    })
    logger.info('string regex custom test')
    const logCall = getLog()
    expect(logCall).toMatch(/^--redacted-- --redacted-- --removed-- test/)
  })
})
