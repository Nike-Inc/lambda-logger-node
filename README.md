# lambda-logger-node

A middleware logger that implements the [SOA+ access logging](https://wiki-product.nike.com/display/TF/Logging+Standards#LoggingStandards-LogFormatPattern) pattern for use in AWS NodeJS Lambdas

This logger does two things.

1. Replaces `console.log` with a curried function that prepends any configured key/value pairs (or the default ones) onto the logged message. Both the format and values can be customized. The default format is
```
traceId={{traceId}} {{date}} appname={{appname}} version={{version}} severity={{severity}} | {{originalMessage}}
```

2. Replaces the lambda `callback` (as well as `context.[fail|done|succeed] for legacy lambdas`) with a function will log an [access log](https://wiki-product.nike.com/display/TF/Logging+Standards#LoggingStandards-AccessLogs) before passing the result onto AWS. It will look something like This
```
requestURL=/some/route requestMethod=GET elapsedTime=-11 accessToken=Bearer 12 restApiId=request-id apigTraceId=098sgs7d-fi2n465-12msr
```

# Installation


You have two installation options. The private Nike npm registry, or directly from bitbucket as a git package. The private npm method is the recommended one, because it maintains the safety of npm version ranges.

## Private npm

If you want to install with npm you will need to configure npm to use the private Nike npm registry with the `@nike` npm scope. To do this, create a file called `.npmrc` with the following contents

```
@nike:registry=http://artifactory.nike.com/artifactory/api/npm/npm-nike/
```

The `.npmrc` file can either be **project-level**, meaning it is in the root of your project, alongside the `package.json` file, or it can be in your user directory `~/.npmrc`. The per-project file simplifies your build process, since the build machine doesn't need any additional configuration, but it must be mode `600` (`chmod 600 .npmrc`) and it must be duplicated in every project you want to use it in. The user directory file means your build machine needs the same `.npmrc` file.

It's up to you which one to use, both work. Once that is done, install from npm as normal.

```
npm install --save @nike/lambda-logger-node
```

Then, require the package with `var cerberus = require('@nike/lambda-logger-node')`

If you are also using nike packages that are unscoped (that don't use the `@nike` prefix), you will need to include the unscoped registry in your `.npmrc`

```
registry=http://artifactory.nike.com/artifactory/api/npm/npm-nike
```

These are not mutually exclusive, but some problems have occured in the past with both entries. In general, when using Nike npm packages you should prefer to install with the `@nike` scope (most Nike packages are published there). If you run into an issues, please file an bug or let someone know in the `#js-cd` channel on Nike Digital's Slack.

## Install as git package

Installing with a git package has the advantage of not required **any** additional configuration on your machine or the build machine, but it requires that you have read access to the repository and produces a dependency entry in `package.json` that includes the entire url. If you don't have read permission on this repository, this method won't work for you. It also stops semantic versioning from working, so you lose the install upgrade safety of npm version ranges.

To install, just run the following command

```
npm install --save git+http://stash.pes.nike.com/scm/trsf/lambda-logger-node.git
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
```

# Log Levels

The logger provides two methods to log with different severity.

* `console.(warn|info|error|log)`
* `logger.(trace|debug|info|warn|error|fatal)`

These will include a `severity=${loglevel}` entry in the log. 

## Setting Minimum Log Level

Use `logger.setMinimumLogLevel('trace|debug|info|warn|error|fatal')` to ignore log levels below the selected one. For example, calling `logger.setMinimumLogLevel('info')` will cause calls to `logger.trace()` to be ignored. This allows the same code to be deployed to development and production, while keeping the production logs quieter.