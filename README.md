# lambda-logger-node

A middleware logger that implements the MDC logging pattern for use in AWS NodeJS Lambdas

This logger does two things.

1. Replaces `console.log` with a curried function that prepends any configured key/value pairs (or the default ones) onto the logged message. Both the format and values can be customized. The default format is
```
traceId={{traceId}} traceIndex={{traceIndex}} {{date}} appname={{appname}} version={{version}} severity={{severity}} | {{originalMessage}}
```

2. Replaces the lambda `callback` (as well as `context.[fail|done|succeed] for legacy lambdas`) with a function will log an access log before passing the result onto AWS. It will look something like This
```
requestURL=/some/route requestMethod=GET elapsedTime=-11 accessToken=Bearer 12 restApiId=request-id apigTraceId=098sgs7d-fi2n465-12msr
```

# Installation

```
npm install lambda-logger-node
```

# Usage

Lambda handler

```javascript
var logger = require('lambda-logger-node')

exports.handler = logger(handler)

function handler (event, context, callback) {
  // your lambda handler
}

```

Or, with more middleware

```javascript
var logger = require('lambda-logger-node')
var moreMiddleware = require('more-middleware')

exports.handler = logger(moreMiddleware(handler))

function handler (event, context, callback) {
  // your lambda handler
}
```

Or, with functional composition

```javascript
var compose = require('compose-func')
var logger = require('lambda-logger-node')
var moreMiddleware = require('more-middleware')

exports.handler = compose(logger, moreMiddleware)(handler)

function handler (event, context, callback) {
  // your lambda handler
}
```

# Restoring `console.log`

If you do not like the replacement of `console.log` you can restore the original one and use the `log` function on the module export to get the prepended logs.

```javascript
var logger = require('lambda-logger-node')

exports.handler = logger(handler)

function handler (event, context, callback) {
  logger.restoreConsoleLog()
  logger.log('This log will have the access log data prepended on it')
  console.log('This will be a normal log')
  // your lambda handler
}
```

# Customizing logs

The `console.log` replacement prepends on any configured key/value pairs using a custom string interpolation function. It can be controlled in two ways

* `logger.format` is the format string that will be interpolated and prepended to all `console.log` calls.


 The format string is on `[[module.export]].format`. The default value is

```javascript
'traceId={{traceId}} {{date}} appname={{appname}} version={{version}}'
```

You can set this to any value, at any time, to change the log-prepend output. The replacement values inside of `{{traceId}}` can be set with `[[module.export]].setKey(key, value)`. Values can be either literals (string, integer, object) or functions. If a function is used, it will be called with no arguments at log-time to get the value (this is actually how the `{{date}}` token is implemented).

```javascript
var logger = require('lambda-logger-node')
// Add more values
logger.format += ' someCustomValue={{custom1}} anotherCustomValue={{custom2}}'

// OR change the format string entirely
logger.format = 'traceId={{traceId}} someCustomValue={{custom1}} {{date}} appname={{appname}}'

// Set token values
logger.setKey('appname', 'custom-app-name')
logger.setKey('custom1', 'some-constant-value')
logger.setKey('custom2', () => Math.random())

// customize date format
logger.setKey('date', () => customDateFormattter(Date.now()))

// Change the log delimiter
logger.delimiter = ':'
```


# The Final Log

After you return from your handler the logger will make one final log entry with either the error or the result from your handler. This log has a special format controlled by the `logModule.successFormat` and `logModule.errorFormat`. By default they are both the same:

Final log format

```
var finalFormat = logFormat + 'requestURL={{requestURL}} requestMethod={{requestMethod}} elapsedTime={{elapsedTime}} accessToken={{accessToken}} apiKey={{apiKey}} restApiId={{restApiId}} apigTraceId={{apigTraceId}} restResourceId={{restResourceId}} result={{result}}'
```

You can customize either format by setting `logModule.successFormat` or `logModule.errorFormat` properties. If the `logModule.successFormat` or `logModule.errorFormat` are falsy when the handler results in a success or failure, respectively, no final log will be made.

> Warning: If you clear the `logModule.successFormat` or `logModule.errorFormat` at the end of your handler to supress the final log all future success or failure logs will be supressed. This is because the logger does not reset these properties on each lambda invocation. If you only want to supress a single final log you can call `logModule.supressCurrentFinalLog`, or make sure to reset the `logModule.successFormat` or `logModule.errorFormat` at the beginning of your handler.

## Supressing the final log

You can stop the logger from logging all success or error logs by setting `logModule.successFormat` or `logModule.errorFormat` to a falsy value. However, these are global properties and persist beyond a single lambda invocation. If you want to supress *only the current invocation's final log* you can call `logModule.supressCurrentFinalLog()`. The flag this call sets is reset every time the handler runs, so you cannot call it before your handler. It is intended to be called at the end of the handler to cancel *just the current invocation*.

# Log Levels

The logger provides two methods to log with different severity.

* `console.(warn|info|error|log|debug)`
* `logger.(debug|info|warn|error)`

These will include a `severity=${loglevel}` entry in the log.

## Setting Minimum Log Level

Use `logger.setMinimumLogLevel('debug|info|warn|error')` to ignore log levels below the selected one. For example, calling `logger.setMinimumLogLevel('info')` will cause calls to `logger.debug()` to be ignored. This allows the same code to be deployed to development and production, while keeping the production logs quieter.
