'use strict'

const REDACTION = '--redacted--'

module.exports = {
  replaceAll,
  replaceAllRegex,
  stringRedactor,
  regexRedactor
}

function stringRedactor (find) {
  return val => replaceAll(val, find, REDACTION)
}

function regexRedactor (find) {
  return val => replaceAllRegex(val, find, REDACTION)
}

function replaceAllRegex (str, regex, replace) {
  return str.replace(regex, replace)
}

// Taken from https://stackoverflow.com/a/1144788/788260
function replaceAll (str, find, replace) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace)
}
function escapeRegExp (str) {
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1') // eslint-disable-line 
}
