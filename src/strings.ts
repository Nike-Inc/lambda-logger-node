const REDACTION = '--redacted--'

export type Redactor = (val: string) => string

export function stringRedactor(find: string): Redactor {
  return (val) => replaceAll(val, find, REDACTION)
}

export function regexRedactor(find: RegExp): Redactor {
  // force global replace
  const findAll = new RegExp(find.source, 'g')
  return (val) => replaceAllRegex(val, findAll, REDACTION)
}

export function replaceAllRegex(
  str: string,
  regex: RegExp,
  replace: string
): string {
  return str.replace(regex, replace)
}

export function redact(str: string, find: string): string {
  return replaceAll(str, find, REDACTION)
}

// Taken from https://stackoverflow.com/a/1144788/788260
export function replaceAll(str: string, find: string, replace: string): string {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace)
}
function escapeRegExp(str: string): string {
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1') // eslint-disable-line
}
