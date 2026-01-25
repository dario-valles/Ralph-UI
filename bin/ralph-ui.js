#!/usr/bin/env node

/**
 * Ralph UI - NPX wrapper
 *
 * Downloads and runs the Ralph UI server binary for the current platform.
 * Features:
 * - Auto-update checking and updates
 * - First-time setup wizard
 * - Configuration persistence
 * - Progress bar downloads
 */

import { execFileSync, spawn } from 'child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'
import readline from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GITHUB_REPO = 'dario-valles/Ralph-UI'
const DEFAULT_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
}

const c = {
  success: (text) => `${colors.green}${text}${colors.reset}`,
  error: (text) => `${colors.red}${text}${colors.reset}`,
  warn: (text) => `${colors.yellow}${text}${colors.reset}`,
  info: (text) => `${colors.cyan}${text}${colors.reset}`,
  bold: (text) => `${colors.bold}${text}${colors.reset}`,
  dim: (text) => `${colors.dim}${text}${colors.reset}`,
}

// Platform mappings
const PLATFORM_MAP = {
  darwin: 'apple-darwin',
  linux: 'unknown-linux-gnu',
  win32: 'pc-windows-msvc',
}

const ARCH_MAP = {
  x64: 'x86_64',
  arm64: 'aarch64',
}

const PLATFORM_DISPLAY = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
}

const ARCH_DISPLAY = {
  x64: 'x64',
  arm64: 'Apple Silicon',
}

// ============================================================================
// Path helpers
// ============================================================================

function getHome() {
  return process.env.HOME || process.env.USERPROFILE
}

function getRalphDir() {
  return join(getHome(), '.ralph-ui')
}

function getCacheDir() {
  return join(getRalphDir(), 'bin')
}

function getConfigPath() {
  return join(getRalphDir(), 'config.json')
}

function getVersionPath() {
  return join(getRalphDir(), 'version.txt')
}

function getBinaryName() {
  return process.platform === 'win32' ? 'ralph-ui.exe' : 'ralph-ui'
}

function getBinaryPath() {
  return join(getCacheDir(), getBinaryName())
}

// ============================================================================
// Platform detection
// ============================================================================

function getPlatformTarget() {
  const platform = PLATFORM_MAP[process.platform]
  const arch = ARCH_MAP[process.arch]

  if (!platform || !arch) {
    console.error(c.error(`Unsupported platform: ${process.platform}-${process.arch}`))
    console.error(
      'Supported platforms: darwin-x64, darwin-arm64, linux-x64, linux-arm64, win32-x64'
    )
    process.exit(1)
  }

  return `${arch}-${platform}`
}

function getPlatformDisplayName() {
  const platform = PLATFORM_DISPLAY[process.platform] || process.platform
  const arch = ARCH_DISPLAY[process.arch] || process.arch
  return `${platform} (${arch})`
}

// ============================================================================
// Configuration management
// ============================================================================

function getDefaultConfig() {
  return {
    autoUpdate: true,
    updateCheckInterval: DEFAULT_CHECK_INTERVAL,
    lastUpdateCheck: 0,
    notifyOnly: false,
    accessMode: 'local',
    tunnel: {
      provider: null,
      configured: false,
    },
    server: {
      port: 3420,
      token: null,
    },
    setupCompleted: false,
  }
}

function loadConfig() {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return getDefaultConfig()
  }
  try {
    const content = readFileSync(configPath, 'utf-8')
    return { ...getDefaultConfig(), ...JSON.parse(content) }
  } catch {
    return getDefaultConfig()
  }
}

function saveConfig(config) {
  const configPath = getConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
}

function getCurrentVersion() {
  const versionPath = getVersionPath()
  if (!existsSync(versionPath)) {
    return null
  }
  try {
    return readFileSync(versionPath, 'utf-8').trim()
  } catch {
    return null
  }
}

function saveVersion(version) {
  const versionPath = getVersionPath()
  mkdirSync(dirname(versionPath), { recursive: true })
  writeFileSync(versionPath, version + '\n')
}

// ============================================================================
// Version comparison
// ============================================================================

function parseVersion(version) {
  const match = version.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

function isNewerVersion(current, latest) {
  const cur = parseVersion(current)
  const lat = parseVersion(latest)
  if (!cur || !lat) return false

  if (lat.major > cur.major) return true
  if (lat.major < cur.major) return false
  if (lat.minor > cur.minor) return true
  if (lat.minor < cur.minor) return false
  return lat.patch > cur.patch
}

// ============================================================================
// GitHub API
// ============================================================================

async function getLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: { 'User-Agent': 'ralph-ui-npm' },
    }

    https
      .get(options, (response) => {
        if (response.statusCode === 404) {
          reject(new Error('No releases found'))
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API error: ${response.statusCode}`))
          return
        }
        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            const release = JSON.parse(data)
            resolve(release)
          } catch (e) {
            reject(new Error('Failed to parse release info'))
          }
        })
      })
      .on('error', reject)
  })
}

// ============================================================================
// Download with progress
// ============================================================================

function createProgressBar(total) {
  const width = 40
  let current = 0

  return {
    update(bytes) {
      current = bytes
      const percent = Math.min(100, Math.round((current / total) * 100))
      const filled = Math.round((percent / 100) * width)
      const empty = width - filled
      const bar = '█'.repeat(filled) + '░'.repeat(empty)
      process.stdout.write(`\r  ${bar} ${percent}%`)
    },
    finish() {
      process.stdout.write('\n')
    },
  }
}

async function downloadFileWithProgress(url, destPath, showProgress = true) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFileWithProgress(response.headers.location, destPath, showProgress)
          .then(resolve)
          .catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'], 10) || 0
      let downloadedSize = 0
      const progress = showProgress && totalSize > 0 ? createProgressBar(totalSize) : null

      const file = createWriteStream(destPath)

      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (progress) {
          progress.update(downloadedSize)
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        if (progress) {
          progress.finish()
        }
        file.close()
        resolve()
      })

      file.on('error', (err) => {
        if (progress) {
          progress.finish()
        }
        reject(err)
      })
    })

    request.on('error', reject)
  })
}

// ============================================================================
// Binary download and installation
// ============================================================================

async function downloadBinary(version = null, showWelcome = false) {
  const cacheDir = getCacheDir()
  const binaryPath = getBinaryPath()

  // Create cache directory
  mkdirSync(cacheDir, { recursive: true })

  try {
    const release = await getLatestRelease()
    const releaseVersion = release.tag_name.replace(/^v/, '')
    const displayVersion = version || releaseVersion

    const target = getPlatformTarget()
    const assetName = `ralph-ui-${target}.tar.gz`

    const asset = release.assets.find((a) => a.name === assetName)
    if (!asset) {
      console.error(c.error(`No binary found for platform: ${target}`))
      console.error('Available assets:', release.assets.map((a) => a.name).join(', '))
      process.exit(1)
    }

    if (showWelcome) {
      console.log(
        `\n  Downloading Ralph UI ${c.info('v' + displayVersion)} for ${getPlatformDisplayName()}...`
      )
    } else {
      console.log(`Downloading Ralph UI v${displayVersion}...`)
    }

    // Download and extract
    const tarPath = join(cacheDir, assetName)
    await downloadFileWithProgress(asset.browser_download_url, tarPath)

    // Remove old binary if exists
    if (existsSync(binaryPath)) {
      unlinkSync(binaryPath)
    }

    // Extract using tar (available on all platforms with Node.js)
    execFileSync('tar', ['-xzf', tarPath, '-C', cacheDir], { stdio: 'pipe' })

    // Clean up tar file
    unlinkSync(tarPath)

    // Make executable on Unix
    if (process.platform !== 'win32') {
      chmodSync(binaryPath, 0o755)
    }

    // Save version
    saveVersion(releaseVersion)

    if (showWelcome) {
      console.log(`\n  ${c.success('✓')} Binary installed to ${c.dim('~/.ralph-ui/bin/ralph-ui')}`)
    } else {
      console.log(c.success('✓ Downloaded successfully!'))
    }

    return { binaryPath, version: releaseVersion }
  } catch (error) {
    console.error(c.error('Failed to download binary:'), error.message)
    console.error('\nYou can build from source instead:')
    console.error('  git clone https://github.com/dario-valles/Ralph-UI.git')
    console.error('  cd Ralph-UI && bun install && bun run server:build')
    process.exit(1)
  }
}

// ============================================================================
// Update checking
// ============================================================================

async function checkForUpdates(config, flags) {
  if (flags.offline || flags.skipUpdate) {
    return { hasUpdate: false }
  }

  const currentVersion = getCurrentVersion()
  if (!currentVersion) {
    return { hasUpdate: false }
  }

  // Check if we should skip based on interval
  const now = Date.now()
  const interval = config.updateCheckInterval || DEFAULT_CHECK_INTERVAL
  if (!flags.forceUpdate && config.lastUpdateCheck && now - config.lastUpdateCheck < interval) {
    return { hasUpdate: false }
  }

  try {
    const release = await getLatestRelease()
    const latestVersion = release.tag_name.replace(/^v/, '')

    // Update last check time
    config.lastUpdateCheck = now
    saveConfig(config)

    if (isNewerVersion(currentVersion, latestVersion)) {
      return { hasUpdate: true, currentVersion, latestVersion }
    }

    return { hasUpdate: false }
  } catch (error) {
    // Silently fail on network errors
    return { hasUpdate: false, error: error.message }
  }
}

function showUpdateBanner(currentVersion, latestVersion) {
  console.log()
  console.log(`╔${'═'.repeat(61)}╗`)
  console.log(
    `║  ${c.warn('Update available:')} v${currentVersion} → ${c.success('v' + latestVersion)}${' '.repeat(
      35 - currentVersion.length - latestVersion.length
    )}║`
  )
  console.log(
    `║  Run with ${c.info('--update')} to upgrade, or ${c.dim('--skip-update')} to ignore     ║`
  )
  console.log(`╚${'═'.repeat(61)}╝`)
  console.log()
}

async function performUpdate(currentVersion, latestVersion) {
  console.log(
    `\nUpdating Ralph UI ${c.dim('v' + currentVersion)} → ${c.success('v' + latestVersion)}...`
  )
  await downloadBinary(latestVersion, false)
  console.log(c.success('✓ Updated successfully!\n'))
}

// ============================================================================
// Interactive prompts
// ============================================================================

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return {
    async question(query) {
      return new Promise((resolve) => {
        rl.question(query, resolve)
      })
    },
    async select(prompt, options) {
      console.log(`\n${prompt}\n`)
      options.forEach((opt, i) => {
        console.log(`  ${c.info((i + 1).toString())}. ${opt.label}`)
        if (opt.description) {
          console.log(`     ${c.dim(opt.description)}`)
        }
      })
      console.log()

      while (true) {
        const answer = await this.question(`${c.dim('>')} `)
        const num = parseInt(answer, 10)
        if (num >= 1 && num <= options.length) {
          return options[num - 1].value
        }
        console.log(c.warn('Please enter a valid number.'))
      }
    },
    async confirm(prompt, defaultYes = true) {
      const hint = defaultYes ? '[Y/n]' : '[y/N]'
      const answer = await this.question(`${prompt} ${c.dim(hint)} `)
      if (!answer.trim()) return defaultYes
      return answer.toLowerCase().startsWith('y')
    },
    async password(prompt) {
      // Simple password input (characters will be visible - Node.js limitation without extra deps)
      const answer = await this.question(`${prompt} `)
      return answer.trim()
    },
    async waitForKey(prompt) {
      const answer = await this.question(`${prompt} `)
      return answer.toLowerCase()
    },
    close() {
      rl.close()
    },
  }
}

// ============================================================================
// Setup wizard
// ============================================================================

async function runSetupWizard(config, isFirstRun = false, downloadedVersion = null) {
  const prompt = createPrompt()

  try {
    console.log()
    console.log('━'.repeat(63))
    console.log()
    console.log(`${c.info('📱')} ${c.bold('Remote Access Setup')} (optional)`)
    console.log()
    console.log('Ralph UI can be accessed from your phone, tablet, or any device.')
    console.log('For push notifications to work, you need HTTPS access.')

    const accessMode = await prompt.select('How would you like to access Ralph UI?', [
      { value: 'local', label: 'Local only', description: 'http://localhost:3420' },
      { value: 'network', label: 'Local network', description: 'http://<your-ip>:3420' },
      {
        value: 'tunnel',
        label: 'Remote via tunnel',
        description: 'HTTPS - enables push notifications',
      },
      { value: 'skip', label: 'Skip for now' },
    ])

    config.accessMode = accessMode === 'skip' ? 'local' : accessMode

    if (accessMode === 'tunnel') {
      console.log()
      console.log('━'.repeat(63))
      console.log()
      console.log(`${c.info('🔐')} ${c.bold('Tunnel Setup')}`)

      const provider = await prompt.select('Choose your tunnel provider:', [
        {
          value: 'cloudflare',
          label: 'Cloudflare Tunnel (recommended)',
          description: 'Free, reliable, custom domains',
        },
        { value: 'ngrok', label: 'ngrok', description: 'Quick setup, random URLs on free tier' },
        {
          value: 'tailscale',
          label: 'Tailscale Funnel',
          description: 'If you already use Tailscale',
        },
        { value: 'manual', label: "I'll configure manually" },
      ])

      config.tunnel.provider = provider

      if (provider !== 'manual') {
        console.log()
        console.log('━'.repeat(63))
        console.log()

        if (provider === 'cloudflare') {
          console.log(`${c.info('☁️')}  ${c.bold('Cloudflare Tunnel Setup')}`)
          console.log()
          console.log('1. Install cloudflared:')
          console.log(`   ${c.info('brew install cloudflared')}      # macOS`)
          console.log(
            `   ${c.dim('# or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/')}`
          )
          console.log()
          console.log('2. Login to Cloudflare:')
          console.log(`   ${c.info('cloudflared tunnel login')}`)
          console.log()
          console.log('3. Create a tunnel:')
          console.log(`   ${c.info('cloudflared tunnel create ralph-ui')}`)
          console.log()
          console.log('4. Start the tunnel (run this in a separate terminal):')
          console.log(`   ${c.info('cloudflared tunnel --url http://localhost:3420')}`)
          console.log()
          console.log('Your HTTPS URL will be shown in the cloudflared output.')
        } else if (provider === 'ngrok') {
          console.log(`${c.info('🔗')} ${c.bold('ngrok Setup')}`)
          console.log()
          console.log('1. Install ngrok:')
          console.log(`   ${c.info('brew install ngrok')}      # macOS`)
          console.log(`   ${c.dim('# or: https://ngrok.com/download')}`)
          console.log()
          console.log('2. Start ngrok (run in a separate terminal):')
          console.log(`   ${c.info('ngrok http 3420')}`)
          console.log()
          console.log('Your HTTPS URL will be shown in the ngrok output.')
        } else if (provider === 'tailscale') {
          console.log(`${c.info('🔒')} ${c.bold('Tailscale Funnel Setup')}`)
          console.log()
          console.log('1. Ensure Tailscale is installed and connected')
          console.log()
          console.log('2. Enable Funnel for your device:')
          console.log(`   ${c.info('tailscale funnel 3420')}`)
          console.log()
          console.log('Your HTTPS URL will be your-device.ts.net')
        }

        console.log()
        const key = await prompt.waitForKey(`Press Enter when ready, or 's' to skip...`)
        if (key !== 's') {
          config.tunnel.configured = true
        }
      }
    }

    // Token setup
    console.log()
    console.log('━'.repeat(63))
    console.log()
    console.log(`${c.info('🔑')} ${c.bold('Auth Token')}`)

    const tokenChoice = await prompt.select('Choose token preference:', [
      { value: 'random', label: 'Generate random token', description: 'New token each restart' },
      { value: 'fixed', label: 'Set a fixed token', description: 'Persistent across restarts' },
      { value: 'env', label: 'Use environment variable', description: 'RALPH_SERVER_TOKEN' },
    ])

    if (tokenChoice === 'fixed') {
      const token = await prompt.password('Enter your token:')
      if (token) {
        config.server.token = token
      }
    } else if (tokenChoice === 'env') {
      config.server.token = 'env'
    } else {
      config.server.token = null
    }

    // Auto-update setup
    console.log()
    console.log('━'.repeat(63))
    console.log()
    console.log(`${c.info('🔄')} ${c.bold('Auto-Update')}`)

    const updateChoice = await prompt.select('Check for updates automatically?', [
      { value: 'auto', label: 'Yes, update automatically (recommended)' },
      { value: 'notify', label: "Yes, notify me but don't auto-update" },
      { value: 'manual', label: "No, I'll update manually" },
    ])

    config.autoUpdate = updateChoice === 'auto'
    config.notifyOnly = updateChoice === 'notify'

    // Save configuration
    config.setupCompleted = true
    saveConfig(config)

    // Show completion
    console.log()
    console.log('━'.repeat(63))
    console.log()
    console.log(`${c.success('✅')} ${c.bold('Setup Complete!')}`)
    console.log()
    console.log(`  Configuration saved to ${c.dim('~/.ralph-ui/config.json')}`)
    console.log()
    console.log('  To start Ralph UI:')
    console.log(`    ${c.info('npx ralph-ui')}`)
    console.log()
    console.log('  To reconfigure:')
    console.log(`    ${c.info('npx ralph-ui --setup')}`)
    console.log()
  } finally {
    prompt.close()
  }

  return config
}

// ============================================================================
// First run experience
// ============================================================================

async function firstRunExperience() {
  console.log()
  console.log(`╔${'═'.repeat(61)}╗`)
  console.log(`║${' '.repeat(16)}Welcome to Ralph UI! 🎉${' '.repeat(22)}║`)
  console.log(`╠${'═'.repeat(61)}╣`)

  const { version } = await downloadBinary(null, true)

  console.log(`╚${'═'.repeat(61)}╝`)

  // Create initial config
  let config = getDefaultConfig()
  config = await runSetupWizard(config, true, version)

  return config
}

// ============================================================================
// CLI argument parsing
// ============================================================================

function parseArgs(args) {
  const flags = {
    help: false,
    version: false,
    update: false,
    forceUpdate: false,
    skipUpdate: false,
    offline: false,
    setup: false,
    config: false,
    serverArgs: [],
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--help':
      case '-h':
        flags.help = true
        break
      case '--version':
      case '-v':
        flags.version = true
        break
      case '--update':
        flags.update = true
        flags.forceUpdate = true
        break
      case '--skip-update':
        flags.skipUpdate = true
        break
      case '--offline':
        flags.offline = true
        flags.skipUpdate = true
        break
      case '--setup':
        flags.setup = true
        break
      case '--config':
        flags.config = true
        break
      default:
        // Pass remaining args to the server
        flags.serverArgs.push(arg)
        break
    }
  }

  return flags
}

function showHelp() {
  console.log(`
${c.bold('Ralph UI')} - HTTP/WebSocket server for AI coding agents

${c.bold('USAGE')}
  npx ralph-ui [OPTIONS] [-- SERVER_ARGS]

${c.bold('OPTIONS')}
  ${c.info('--help, -h')}        Show this help message
  ${c.info('--version, -v')}     Show current version
  ${c.info('--update')}          Force update to latest version
  ${c.info('--skip-update')}     Skip update check for this run
  ${c.info('--offline')}         Run without any network checks
  ${c.info('--setup')}           Re-run the setup wizard
  ${c.info('--config')}          Show current configuration

${c.bold('SERVER OPTIONS')}
  ${c.info('--port <port>')}     Server port (default: 3420)
  ${c.info('--bind <addr>')}     Bind address (default: 0.0.0.0)
  ${c.info('--token <token>')}   Auth token (or use RALPH_SERVER_TOKEN env var)

${c.bold('EXAMPLES')}
  npx ralph-ui                       # Start with defaults
  npx ralph-ui --port 8080           # Custom port
  npx ralph-ui --setup               # Re-run setup wizard
  npx ralph-ui --update              # Force update

${c.bold('CONFIGURATION')}
  Config file: ~/.ralph-ui/config.json
  Binary: ~/.ralph-ui/bin/ralph-ui

${c.bold('MORE INFO')}
  https://github.com/dario-valles/Ralph-UI
`)
}

function showVersion() {
  const version = getCurrentVersion()
  if (version) {
    console.log(`Ralph UI v${version}`)
  } else {
    console.log('Ralph UI (version unknown - not yet downloaded)')
  }
}

function showConfig() {
  const config = loadConfig()
  const version = getCurrentVersion()

  console.log()
  console.log(c.bold('Ralph UI Configuration'))
  console.log('━'.repeat(40))
  console.log()
  console.log(`  ${c.dim('Version:')}        ${version || 'not installed'}`)
  console.log(`  ${c.dim('Config file:')}    ~/.ralph-ui/config.json`)
  console.log(`  ${c.dim('Binary:')}         ~/.ralph-ui/bin/ralph-ui`)
  console.log()
  console.log(
    `  ${c.dim('Auto-update:')}    ${config.autoUpdate ? c.success('enabled') : c.warn('disabled')}`
  )
  console.log(`  ${c.dim('Notify only:')}    ${config.notifyOnly ? 'yes' : 'no'}`)
  console.log(`  ${c.dim('Access mode:')}    ${config.accessMode}`)
  console.log(`  ${c.dim('Tunnel:')}         ${config.tunnel.provider || 'not configured'}`)
  console.log(`  ${c.dim('Server port:')}    ${config.server.port}`)
  console.log(
    `  ${c.dim('Token:')}          ${config.server.token === 'env' ? '(from env)' : config.server.token ? '(set)' : '(random)'}`
  )
  console.log(`  ${c.dim('Setup done:')}     ${config.setupCompleted ? 'yes' : 'no'}`)
  console.log()
}

// ============================================================================
// Main entry point
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const flags = parseArgs(args)

  // Handle help
  if (flags.help) {
    showHelp()
    return
  }

  // Handle version
  if (flags.version) {
    showVersion()
    return
  }

  // Handle config display
  if (flags.config) {
    showConfig()
    return
  }

  // Load or create config
  let config = loadConfig()
  const binaryPath = getBinaryPath()
  const isFirstRun = !existsSync(binaryPath)

  // First run - download and setup
  if (isFirstRun) {
    config = await firstRunExperience()
    // After setup, start the server
  } else if (flags.setup) {
    // Re-run setup wizard
    config = await runSetupWizard(config, false)
    return // Don't start server after setup
  }

  // Force update
  if (flags.forceUpdate) {
    const currentVersion = getCurrentVersion()
    try {
      const release = await getLatestRelease()
      const latestVersion = release.tag_name.replace(/^v/, '')

      if (currentVersion && !isNewerVersion(currentVersion, latestVersion)) {
        console.log(c.success(`✓ Already at latest version (v${currentVersion})`))
      } else {
        await performUpdate(currentVersion || '0.0.0', latestVersion)
      }
    } catch (error) {
      console.error(c.error('Failed to check for updates:'), error.message)
      if (!existsSync(binaryPath)) {
        process.exit(1)
      }
    }
  }

  // Check for updates (non-first run, non-forced)
  if (!isFirstRun && !flags.forceUpdate) {
    const updateInfo = await checkForUpdates(config, flags)

    if (updateInfo.hasUpdate) {
      if (config.autoUpdate && !config.notifyOnly) {
        // Auto-update
        await performUpdate(updateInfo.currentVersion, updateInfo.latestVersion)
      } else {
        // Show update banner
        showUpdateBanner(updateInfo.currentVersion, updateInfo.latestVersion)
      }
    }
  }

  // Ensure binary exists
  if (!existsSync(binaryPath)) {
    console.error(c.error('Binary not found. Run without --skip-update to download.'))
    process.exit(1)
  }

  // Build server arguments
  const serverArgs = [...flags.serverArgs]

  // Add token from config if set
  if (config.server.token && config.server.token !== 'env') {
    // Check if token not already provided
    if (!serverArgs.includes('--token') && !process.env.RALPH_SERVER_TOKEN) {
      serverArgs.push('--token', config.server.token)
    }
  }

  // Start the server
  const child = spawn(binaryPath, serverArgs, {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', (error) => {
    console.error(c.error('Failed to start Ralph UI:'), error.message)
    process.exit(1)
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })
}

main().catch((error) => {
  console.error(c.error('Error:'), error.message)
  process.exit(1)
})
