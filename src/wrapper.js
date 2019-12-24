/* eslint-disable no-console */
'use strict'
const assert = require('assert')

const logLevels = ['debug', 'info', 'warn', 'error']
// eslint-disable-next-line no-empty-function
const noop = () => {}

const makeLogWrapper = (logger, prop) => {
  let func
  if (logger[prop] && typeof logger[prop] === 'function') {
    func = logger[prop]
  } else {
    func =
      logger.minimumLogLevel !== undefined
        ? (console[prop] || console.log).bind(console)
        : noop
  }
  return function(...args) {
    if (
      logger.minimumLogLevel !== undefined &&
      logLevels.indexOf(logger.minimumLogLevel) > logLevels.indexOf(prop)
    )
      return
    return func(...args)
  }
}

module.exports = function(loggerArg) {
  const logger = loggerArg || {}
  if (logger.minimumLogLevel !== undefined) {
    assert(
      logLevels.indexOf(logger.minimumLogLevel) !== -1,
      `"minimumLogLevel" must be one of: ${logLevels.join(', ')} or "undefined"`
    )
  }

  return {
    error: makeLogWrapper(logger, 'error'),
    warn: makeLogWrapper(logger, 'warn'),
    info: makeLogWrapper(logger, 'info'),
    debug: makeLogWrapper(logger, 'debug')
  }
}
