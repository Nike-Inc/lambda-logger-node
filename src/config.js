'use strict'

const system = require('./system')

const NODE_MAJOR_VERSION = getNodeMajorVersion()
const LAMBDA_PREPENDS_SEVERITY = NODE_MAJOR_VERSION >= 10

module.exports = {
  UNHANDLED_REJECTION_LISTENERS: NODE_MAJOR_VERSION >= 10 ? 1 : 0,
  LAMBDA_PREPENDS_SEVERITY
}

function getNodeMajorVersion() {
  let version = system.process.version //v8.8
  // Skip the "v", convert to number
  return parseFloat(version.substring(1, version.indexOf('.')))
}
