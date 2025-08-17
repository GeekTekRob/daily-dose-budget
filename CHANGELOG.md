# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [Unreleased]
### Added
- .env configuration support with `.env.sample` (server/client), CORS origin, JWT settings.
- Community health files: LICENSE (MIT), Code of Conduct, Contributing, Security policy.
- GitHub Issue/PR templates, CODEOWNERS, Support doc.
- CI workflow for install and tests on push/PR (Node 20).
- Discussions templates (Q&A, Ideas) and initial Wiki scaffolding (Home, Getting Started, FAQ).

### Changed
- Revamped README to be community-friendly with features, quick start, and roadmap.
- Vite config now loads `VITE_API_URL` via `loadEnv`.

### Fixed
- Docker Compose environment mapping for JWT and CORS.

## [0.1.0] - 2025-08-16
### Added
- JWT authentication with bcrypt, user-scoped data across accounts, transactions, and recurrings.
- Route-based login page with remember-me and session/local storage tokens.
- Docker multi-stage build serving built client from server.
- Initial API and React client with Accounts, Transactions, Bills/Paychecks.

[Unreleased]: https://github.com/GeekTekRob/daily-dose-budget/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GeekTekRob/daily-dose-budget/releases/tag/v0.1.0
