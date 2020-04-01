# lambda-logger-node

A middleware logger that implements the MDC logging pattern for use in AWS NodeJS Lambdas. It provides 4 log levels (DEBUG, INFO, WARN, ERROR), custom message attributes, and allows the creation of sub-loggers.

It is designed to make log messages easily readable by humans from Cloudwatch, as well as easily parsed by machines for ingestion into downstream systems like the ELK stack. When a log call is made the log level and message are placed first, followed by a JSON-stringified object that contains the message and custom attributes.

Since v3 lambda-logger-node only supports wrapping async function handlers.

## Quick Start

```javascript
// lambda.js
const { Logger } = require('lambda-logger-node')
let logger = Logger()
logger.setKey('custom', 'value')

exports.handler = logger.handler(handler)
async function handler (event, context) {
  logger.info('test message') // ->
  /*
  INFO test message | ___$LAMBDA-LOG-TAG$___{
    "traceId":"8sd3g32-42fg-43th45h-vsafd",
    "date":"2018-12-17T23:37:24Z",
    "appName":"your-app-name",
    "apigTraceId":"897635-3534-33435-435",
    "traceIndex":0,
    "custom":"value",
    "message":"test message",
    "severity":"INFO",
    "contextPath":""}___$LAMBDA-LOG-TAG$___ <-- one line when loged, whitespace for docs
  */
}
```

# Installation

```
npm install lambda-logger-node
```

# Usage

Simple Lambda handler

```javascript
const { Logger } = require('lambda-logger-node')
const logger = Logger()

exports.handler = logger.handler(handler)

async function handler (event, context) {
  // your lambda handler
}

```

Or, with more middleware

```javascript
const { Logger } = require('lambda-logger-node')
const logger = Logger()
var moreMiddleware = require('more-middleware')

exports.handler = logger.handler(moreMiddleware(handler))

async function handler (event, context) {
  // your lambda handler
}
```

## Recommended setup

To simplify usage of the logger throughout your application configure a logger in its own module.

```javascript
// logger.js
const config = require('./config')
const { Logger } = require('lambda-logger-node')
const logger = Logger({
  minimumLogLevel = config.isProduction ? 'INFO' : null
})

module.exports = logger

// lambda.js
const logger = require('./logger')
exports.handler = logger.handler(handler)
async function handler (event, context) {
  // your lambda handler
}

// api.js
const logger = require('./logger')
module.exports { someFunc }

function someFunc() {
  // app code
  logger.info('custom log')
}
```

In addition to this method allowing global use of your lambda, the logger is attached to the handler's `context` argument as `context.logger`. When the lambda handler is executed all of the request-specific values (like the *traceId*) are updated, even when the module is declared and `required` outside the handler like the one above.

# Logger API

The Logger module exports a constructor on `Logger` that takes the following options

```javascript
function Logger ({
  minimumLogLevel = null,
  useGlobalErrorHandler = true,
  redactors = [],
  useBearerRedactor = true,
  formatter = JsonFormatter
} = {})
```

* `string: minimumLogLevel`: one of DEBUG | INFO | WARN | ERROR. Supress messages that are below this level in severity.
* `bool:useGlobalErrorHandler`: default: `true`. Attach process-level handlers for uncaught exceptions and unhandled rejections to log messages with the logger. Attempting to construct two loggers with this setting will result in an error,
* `[string|RegExp|func]:redactors`: an array of redactors to process all log messages with. A `string` will be removed verbatim, a `RegExp` will be removed if it matches. If a function is given it is passed the log message as a string, and *MUST* return a string (whether it replaced anything or not).
* `bool: useBearerRedactor`: default: `true`, add a bearer token redactor to the list of redactors.
* `bool: testMode`: Override environment checks and force "testMode" to be `true` or `false`. Leave `undefined` to allow ENV to define test mode.
* `func: formatter`: format messages before they are written out. The default formatter is used if this option is left off. This is an advanced customization point, and a deep understanding of the logger will be necessary to implement a custom formatter (there are no docs other than source code right now).

The Logger constructor returns a logger instance with the following API

```
{
    handler,
    setMinimumLogLevel,
    events,
    setKey,
    createSubLogger,
    info,
    warn,
    error,
    debug
  }
```

* `handler`: Takes a handler function as input and returns a wrapped handler function that configures per-request keys such as `traceId`.
* `setMinimumLogLevel`: Takes a log level (DEBUG | INFO | WARN | ERROR) and sets the same `minimumLogLevel` that the constructor took. Useful if this is not known until the handler has executed.
* `events`: an `EventEmitter`. Currently only supports `beforeHandler`.
* `setKey`: add a custom sttribute to all log messages. First argument is a string name for the attributes. The second argument is a value, or a value-returning function (function will be executed at log-time).
* `debug|info|warn|error`: Create a log for the matching severity.
* `createSubLogger(string: subLoggerName)`: Creates a sub-logger that only has the log methods (`debug|info|warn|error`) and `createSubLogger`. Useful for providing loggers to sub-components like your Dynamo Client. Its messages are prefixed with the sub-loggers name; if there are multiple levels of sub-loggers each sub-logger is included in the prefix. e.g. for a sub-logger "SubTwo" that is a sub-logger of another sub-logger "SubOne" the message would be `INFO SubOne.SubTwo message`.


# Events

The logger also contains an event emitter that will emit a `beforeHandler` event just before the lambda handler function is called. This receives both the lambda event and context as arguments. For example, you could use this to generate a custom `traceId` key/value pair in your logs:

```js
const nanoid = require('nanoid')

logger.events.on('beforeHandler', (lambdaEvent, context) => {
  logger.setKey('traceId', nanoid())
})
```

This will use a custom value generated by the `nanoid` library, rather than the default `awsRequestId`.

# Logger Wrapper

This module exports a `wrapper` function that returns an API-comptatible logger object regardless of what is passed in (including `undefined`). This useful for creating objects that can be provided a logger with missing methods (maybe you don't want to see `debug`); especially useful for testing classes without providing them a logger _at all_.

```js
const { wrapper } = require('lambda-logger-node')
module.exports = constructor

function constructor (options) {
  const logger = wrapper(options.logger)
  
  logger.error('This will only log if the options.logger already has an error method')
  logger.warn('This will only log if the options.logger already has a warn method')
  logger.info('This will only log if the options.logger already has an info method')
  logger.debug('This will only log if the options.logger already has a debug method')
}
```
