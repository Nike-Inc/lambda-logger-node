'use strict'

const REDACTION = '--redacted--'

module.exports = {
  replaceAll,
  replaceAllRegex,
  stringRedactor,
  regexRedactor,
  redact
}

function stringRedactor (find) {
  return val => replaceAll(val, find, REDACTION)
}

function regexRedactor (find) {
  // force global replace
  const findAll = new RegExp(find.source, 'g')
  return val => replaceAllRegex(val, findAll, REDACTION)
}

function replaceAllRegex (str, regex, replace) {
  return str.replace(regex, replace)
}

function redact (str, find) {
  return replaceAll(str, find, REDACTION)
}

// Taken from https://stackoverflow.com/a/1144788/788260
function replaceAll (str, find, replace) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace)
}
function escapeRegExp (str) {
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1') // eslint-disable-line 
}
