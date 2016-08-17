# lambda-node-logger

A middleware logger that implements the [SOA+ access logging](https://wiki-product.nike.com/display/TF/Logging+Standards#LoggingStandards-LogFormatPattern) pattern for use in AWS NodeJS Lambdas

This logger does two things.

1. Replaces `console.log` with a curried function that prepends any configured key/value pairs (or the default ones) onto the logged message. Both the format and values can be customized. The default format is
```
traceId={{traceId}} {{date}} appname={{appname}} version={{version}} | {{originalMessage}}
```

2. Replaces the lambda `callback` (as well as `context.[fail|done|succeed] for legacy lambdas`) with a function will log an [access log](https://wiki-product.nike.com/display/TF/Logging+Standards#LoggingStandards-AccessLogs) before passing the result onto AWS. It will look something like This
```
requestURL=/some/route requestMethod=GET elapsedTime=-11 accessToken=Bearer 12 restApiId=request-id
```


# Installation

coming soon

# Usage

Lambda handler

```javascript
var logger = require('lambda-node-logger')

exports.handler = logger(handler)

function handler (event, context, callback) {
  // your lambda handler
}

```

Or, with more middleware

```javascript
var logger = require('lambda-node-logger')
var moreMiddleware = require('more-middleware')

exports.handler = logger(moreMiddleware(handler))

function handler (event, context, callback) {
  // your lambda handler
}
```

Or, with functional composition

```javascript
var compose = require('compose-func')
var logger = require('lambda-node-logger')
var moreMiddleware = require('more-middleware')

exports.handler = compose(logger, moreMiddleware)(handler)

function handler (event, context, callback) {
  // your lambda handler
}
```

# Restoring `console.log`

If you do not like the replacement of `console.log` you can restore the original one and use the `log` function on the module export to get the prepended logs.

```javascript
var logger = require('lambda-node-logger')

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

* `logger.logFormat` is the format string that will be interpolated and prepended to all `console.log` calls.


 The format string is on `[[module.export]].logFormat`. The default value is

```javascript
'traceId={{traceId}} {{date}} appname={{appname}} version={{version}}'
```

You can set this to any value, at any time, to change the log-prepend output. The replacement values inside of `{{traceId}}` can be set with `[[module.export]].setKey(key, value)`. Values can be either literals (string, integer, object) or functions. If a function is used, it will be called with no arguments at log-time to get the value (this is actually how the `{{date}}` token is implemented).

```javascript
var logger = require('lambda-node-logger')
// Add more values
logger.logFormat += ' someCustomValue={{custom1}} anotherCustomValue={{custom2}}'

// OR change the format string entirely
logger.logFormat = 'traceId={{traceId}} someCustomValue={{custom1}} {{date}} appname={{appname}}'

// Set token values
logger.setKey('appname', 'custom-app-name')
logger.setKey('custom1', 'some-constant-value')
logger.setKey('custom2', () => Math.random())

// customize date format
logger.setKey('data', () => customDateFormattter(Date.now()))
```
