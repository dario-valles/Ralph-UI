# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT open a public issue** for security vulnerabilities
2. **Email the maintainer directly** or use GitHub's private vulnerability reporting feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Assessment**: We'll assess the vulnerability and its impact
- **Updates**: We'll keep you informed of our progress
- **Resolution**: We aim to resolve critical issues promptly
- **Credit**: We'll credit you in the release notes (unless you prefer anonymity)

## Security Considerations

### Authentication

Ralph UI uses token-based authentication for the HTTP/WebSocket server:

- Tokens are generated randomly on each startup by default
- Custom tokens can be set via `--token` flag or `RALPH_SERVER_TOKEN` environment variable
- All API requests require `Authorization: Bearer <token>` header
- WebSocket connections pass token as query parameter

### Network Security

- By default, the server binds to `0.0.0.0` (all interfaces)
- For production, consider:
  - Binding to `127.0.0.1` for local-only access
  - Using a reverse proxy with TLS
  - Configuring CORS origins via `--cors-origin` flag

### File Storage

- Session data is stored in `.ralph-ui/` directories within each project
- These directories should be added to `.gitignore` if they contain sensitive information
- The storage uses atomic writes (temp file + rename) for data integrity

### Agent Execution

- AI agents are spawned as child processes with PTY support
- Agents inherit the user's environment and permissions
- Be cautious about the prompts and tasks given to agents

## Best Practices for Users

1. **Use strong tokens** in production environments
2. **Restrict network access** to trusted networks
3. **Review agent output** before committing to repositories
4. **Keep dependencies updated** regularly
5. **Use HTTPS** when exposing the server to networks

## Known Limitations

- The server does not provide TLS natively; use a reverse proxy for HTTPS
- Authentication is shared across all users connecting to the same server instance
- File permissions follow the user running the server process
