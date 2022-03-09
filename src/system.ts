'use strict'

/*
  Mocking these values across Node 8 and Node 10
  Is difficult and error-prone
  Providing them from here lets us mock them easily
*/

const p = process
const c = console
export { p as process }
export { c as console }

// In previous versions this depended on the version of node
// But those versions are no longer supported
export const UNHANDLED_REJECTION_LISTENERS = 1
