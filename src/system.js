'use strict'

/*
  Mocking these values across Node 8 and Node 10
  Is difficult and error-prone
  Providing them from here lets us mock them easily
*/

module.exports = {
  process,
  console
}
