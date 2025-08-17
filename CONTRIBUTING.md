# Contributing to Daily Dose Budget

Thanks for your interest in contributing! We welcome issues and PRs.

## Getting Started
- Fork the repo and create a feature branch
- Use Docker for API (`docker compose up --build -d`) and Vite for UI (`cd client && npm run dev`)
- Copy `.env.sample` to `.env` and set `JWT_SECRET`

## Development
- Node 20 LTS recommended. On Windows, prefer Docker for the API (native module)
- Run tests:
```
npm run test
```

## Pull Requests
- Small, focused PRs are easier to review
- Include a clear description and screenshots/GIFs when UI changes
- Ensure CI checks pass

## Commit Messages
- Use clear, descriptive messages
- Reference issues with `Fixes #123` when applicable

## Code of Conduct
By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
