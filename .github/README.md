# GitHub Workflows

## CI/CD Pipeline

The CI/CD workflow (`workflows/ci.yml`) is ready but not committed to the repository due to GitHub App permissions restrictions.

### Why Not Committed?

The GitHub App used for this repository does not have `workflows` permission, which prevents pushing workflow files directly. This is a security feature to prevent unauthorized workflow modifications.

### How to Add the Workflow

1. **Option 1**: Grant the GitHub App `workflows` permission in repository settings
2. **Option 2**: Manually add the workflow file through the GitHub web interface
3. **Option 3**: Push from a local environment with appropriate permissions

### Workflow Contents

The CI workflow includes:
- Linting and format checking
- Unit tests with Vitest
- TypeScript type checking
- Multi-platform Tauri builds (Linux, macOS, Windows)

See `workflows/ci.yml` for the complete configuration.

## Note

This limitation is specific to the development environment and does not affect the functionality of Ralph UI itself.
