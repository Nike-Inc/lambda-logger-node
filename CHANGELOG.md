# Change Log /  Release Notes
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [4.0.0] - 2021-02-01
### Changed
- **BREAKING CHANGE** API for Formatters
- Converted entire project to typescript
### Removed
- Support for Node < 12.10

## [3.3.0] - 2021-02-01
### Added
- New Log Level `SILENT`

## [3.2.1] - 2019-12-23
### Fixed
- proxyquire listed as dependency instead of devDependency

## [3.2.0] - 2019-12-23
### Added
- export `wrapper` function

## [3.1.4] - 2019-10-29
### Fixed
- Log message severity double prepending on Node 10

## [3.1.3] - 2019-10-29
### Fixed
- Debug log message causing encoding error

## [3.1.2] - 2019-10-29
### Fixed
- Node 10.x runtime error

## [3.1.1] - 2019-06-11
### Fixed
- `testMode` detection

## [3.1.0] - 2019-01-28
### Added
- `testMode` constructor option to override ENV checks
- Light-weight formatter for test mode

## [3.0.1] - 2019-01-28
### Fixed
- Regex redactors not redacting all instances

## [3.0.0] - 2019-01-02
### Changed
- Total re-write of the loggers internals and API

## [2.3.0] - 2018-04-25
### Added
- Support async handlers (return promise instead of using callback)

## [2.2.1] - 2018-03-02
### Fixed
- Possible infinite recursion when running outside of a lambda (again)

## [2.2.0] - 2018-02-08
### Added
- `delimiter` option
### Fixed
- Possible infinite recursion when running outside of a lambda

## [2.1.1] - 2017-11-16
### Fixed
- Failure due to inability to serialize result

## [2.1.0] - 2017-06-11
### Added
- Initial release
