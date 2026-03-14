const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn, spawnSync } = require('child_process');

const DEFAULT_RUNTIME_BY_PLATFORM = {
  win32: 'chrome',
  darwin: 'chrome',
  linux: 'chrome'
};

const CHROMIUM_RUNTIMES = new Set(['chrome', 'edge', 'brave', 'chromium']);

const WEBUI_PRESENCE_TTL_MS = 45 * 1000;

const WINDOWS_RUNTIME_CONFIG = {
  edge: { exe: 'msedge.exe', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  chrome: { exe: 'chrome.exe', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  brave: { exe: 'brave.exe', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  firefox: { exe: 'firefox.exe', args: ['--new-window', '--kiosk', '$URL'] },
  chromium: { exe: 'chromium.exe', args: ['--new-window', '--start-fullscreen', '--app=$URL'] }
};

const MAC_RUNTIME_CONFIG = {
  edge: { app: 'Microsoft Edge', args: ['--new-window', '--start-fullscreen', '--app=$URL'], probe: 'Microsoft Edge' },
  chrome: { app: 'Google Chrome', args: ['--new-window', '--start-fullscreen', '--app=$URL'], probe: 'Google Chrome' },
  brave: { app: 'Brave Browser', args: ['--new-window', '--start-fullscreen', '--app=$URL'], probe: 'Brave Browser' },
  chromium: { app: 'Chromium', args: ['--new-window', '--start-fullscreen', '--app=$URL'], probe: 'Chromium' },
  firefox: { app: 'Firefox', args: ['--new-window', '--kiosk', '$URL'], probe: 'Firefox' }
};

const LINUX_RUNTIME_CONFIG = {
  edge: { exe: 'microsoft-edge', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  chrome: { exe: 'google-chrome', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  brave: { exe: 'brave-browser', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  chromium: { exe: 'chromium', args: ['--new-window', '--start-fullscreen', '--app=$URL'] },
  firefox: { exe: 'firefox', args: ['--new-window', '--kiosk', '$URL'] }
};

function getBrowserOpenLockPath() {
  return path.join(os.tmpdir(), 'rem-system-browser-open.lock.json');
}

function buildOpenCommand(url, platform = process.platform) {
  if (platform === 'win32') return `start "" "${url}"`;
  if (platform === 'darwin') return `open "${url}"`;
  return `xdg-open "${url}"`;
}

function normalizeRuntimeName(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'msedge') return 'edge';
  if (value === 'google-chrome') return 'chrome';
  if (value === 'brave-browser') return 'brave';
  if (value === 'bravehtml') return 'brave';
  if (value === 'chromehtml') return 'chrome';
  if (value === 'microsoft edge' || value === 'msedgehtm') return 'edge';
  if (value === 'firefoxurl' || value === 'firefoxhtml') return 'firefox';
  if (value === 'chromium-browser' || value === 'chromiumhtm') return 'chromium';
  return value;
}

function detectDefaultRuntime(platform = process.platform, options = {}) {
  if (platform === 'win32') {
    try {
      const results = [];
      for (const protocol of ['http', 'https']) {
        const probe = spawnSync('reg', [
          'query',
          `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`,
          '/v',
          'ProgId'
        ], { encoding: 'utf8' });
        if (probe.status === 0) {
          const out = String(probe.stdout || '');
          const match = out.match(/ProgId\s+REG_SZ\s+([^\r\n]+)/i);
          if (match && match[1]) {
            const runtime = normalizeRuntimeName(match[1]);
            if (runtime) results.push(runtime);
          }
        }
      }
      // Prefer chrome explicitly — users who set Chrome as system default often
      // have it in the http association even when https still points to Edge.
      if (results.includes('chrome')) return 'chrome';
      if (results.length > 0) return results[0];
    } catch {
      return '';
    }
    return '';
  }

  if (platform === 'linux') {
    try {
      const probe = spawnSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8' });
      if (probe.status === 0) {
        return normalizeRuntimeName(String(probe.stdout || '').trim().replace(/\.desktop$/i, ''));
      }
    } catch {
      return '';
    }
    return '';
  }

  if (platform === 'darwin') {
    try {
      const probe = spawnSync('sh', ['-lc', 'mdls -name kMDItemCFBundleIdentifier -raw /Applications/Google\\ Chrome.app 2>/dev/null'], { encoding: 'utf8' });
      if (probe.status === 0) {
        const bundle = String(probe.stdout || '').trim();
        if (bundle.includes('google.chrome')) return 'chrome';
      }
    } catch {
      return '';
    }
  }

  return '';
}

function chooseDesiredRuntime(platform, options = {}) {
  const explicit = normalizeRuntimeName(options.preferredRuntime || process.env.REM_UI_RUNTIME);
  if (explicit) return explicit;

  const detected = normalizeRuntimeName(options.detectedDefaultRuntime || detectDefaultRuntime(platform, options));
  if (detected && CHROMIUM_RUNTIMES.has(detected)) return detected;
  if (detected === 'firefox') return DEFAULT_RUNTIME_BY_PLATFORM[platform] || detected;

  return DEFAULT_RUNTIME_BY_PLATFORM[platform] || detected;
}

function checkCommandExists(command, platform = process.platform) {
  if (!command) return false;
  if (platform === 'win32') {
    const probe = spawnSync('where', [command], { stdio: 'ignore' });
    return probe.status === 0;
  }
  const probe = spawnSync('which', [command], { stdio: 'ignore' });
  return probe.status === 0;
}

function resolveWindowsExecutablePath(runtimeExe) {
  if (!runtimeExe) return null;

  // 1) Check PATH first.
  try {
    const probe = spawnSync('where', [runtimeExe], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout) {
      const first = String(probe.stdout).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (first && fs.existsSync(first)) return first;
    }
  } catch {
    // continue to known install paths
  }

  // 2) Probe common Windows install directories.
  const roots = [
    process.env['PROGRAMFILES'],
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA
  ].filter(Boolean);

  const relativeCandidates = {
    'msedge.exe': [path.join('Microsoft', 'Edge', 'Application', 'msedge.exe')],
    'chrome.exe': [path.join('Google', 'Chrome', 'Application', 'chrome.exe')],
    'brave.exe': [path.join('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')],
    'firefox.exe': [path.join('Mozilla Firefox', 'firefox.exe')],
    'chromium.exe': [path.join('Chromium', 'Application', 'chromium.exe'), path.join('Chromium', 'Application', 'chrome.exe')]
  };

  const relPaths = relativeCandidates[String(runtimeExe).toLowerCase()] || [];
  for (const root of roots) {
    for (const rel of relPaths) {
      const full = path.join(root, rel);
      if (fs.existsSync(full)) return full;
    }
  }

  return null;
}

function getRuntimeConfig(runtime, platform) {
  if (platform === 'win32') return WINDOWS_RUNTIME_CONFIG[runtime] || null;
  if (platform === 'darwin') return MAC_RUNTIME_CONFIG[runtime] || null;
  if (platform === 'linux') return LINUX_RUNTIME_CONFIG[runtime] || null;
  return null;
}

function resolvePreferredRuntime(platform, options = {}) {
  const commandExistsFn = options.commandExistsFn || checkCommandExists;
  const desired = chooseDesiredRuntime(platform, options);

  if (!desired) {
    return { ok: false, reason: 'unsupported-platform', message: `No dedicated runtime policy for platform: ${platform}` };
  }

  const cfg = getRuntimeConfig(desired, platform);
  if (!cfg) {
    return { ok: false, reason: 'runtime-unsupported', message: `Runtime "${desired}" is not supported on ${platform}` };
  }

  if (platform === 'win32') {
    const executablePath = resolveWindowsExecutablePath(cfg.exe);
    if (!executablePath) {
      return {
        ok: false,
        reason: 'runtime-missing',
        message: `Preferred WebUI runtime "${desired}" is not installed for ${platform}. Set REM_UI_RUNTIME to an installed runtime (edge|chrome|brave|chromium|firefox).`,
        runtime: desired,
        platform
      };
    }
    return { ok: true, runtime: desired, config: cfg, executablePath };
  }

  const probeTarget = platform === 'darwin' ? cfg.probe : cfg.exe;
  if (!commandExistsFn(probeTarget, platform)) {
    return {
      ok: false,
      reason: 'runtime-missing',
      message: `Preferred WebUI runtime "${desired}" is not installed for ${platform}. Set REM_UI_RUNTIME to an installed runtime (edge|chrome|brave|chromium|firefox).`,
      runtime: desired,
      platform
    };
  }

  return { ok: true, runtime: desired, config: cfg };
}

function buildMacFocusOrOpenCommand(url, options = {}) {
  const safeUrl = String(url).replace(/"/g, '\\"');
  const fullscreenEnabled = options.fullscreen !== false;
  const runtime = normalizeRuntimeName(options.runtime || 'chrome');
  const cfg = MAC_RUNTIME_CONFIG[runtime] || MAC_RUNTIME_CONFIG.chrome;
  const appName = String(cfg.app).replace(/"/g, '\\"');
  const appArgs = cfg.args.map((arg) => arg.replace('$URL', '$URL_RUNTIME')).map((arg) => `\"${arg.replace(/"/g, '\\"')}\"`).join(' ');

  const scriptLines = [
    'set theURL to "' + safeUrl + '"',
    'set appName to "' + appName + '"',
    'set URL_RUNTIME to theURL',
    'tell application appName to activate',
    'do shell script "open -na " & quoted form of appName & " --args ' + appArgs + '"',
    fullscreenEnabled ? 'delay 1.0' : 'delay 0.05',
    fullscreenEnabled ? 'tell application "System Events" to keystroke "f" using {command down, control down}' : 'set _noop to true'
  ];

  const escaped = scriptLines.join('\n').replace(/"/g, '\\"');
  return `osascript -e "${escaped}"`;
}

function buildLinuxFocusOrOpenCommand(url, options = {}) {
  const titleHint = String(options.windowTitle || 'REM System').replace(/"/g, '\\"');
  const safeUrl = String(url).replace(/"/g, '\\"');
  const fullscreenEnabled = options.fullscreen !== false;
  const runtime = normalizeRuntimeName(options.runtime || 'chrome');
  const cfg = LINUX_RUNTIME_CONFIG[runtime] || LINUX_RUNTIME_CONFIG.chrome;
  const args = cfg.args.map((arg) => arg.replace('$URL', '$URL')).join(' ');

  const lines = [
    'set -e',
    `URL=\"${safeUrl}\"`,
    `TITLE=\"${titleHint}\"`,
    'if command -v wmctrl >/dev/null 2>&1; then wmctrl -xa "$TITLE" >/dev/null 2>&1 || true; fi',
    `${cfg.exe} ${args} >/dev/null 2>&1 &`
  ];

  if (fullscreenEnabled) {
    lines.push('if command -v xdotool >/dev/null 2>&1; then sleep 1.2; xdotool search --name "$TITLE" windowactivate key F11 >/dev/null 2>&1 || true; fi');
  }

  const script = lines.join('; ').replace(/"/g, '\\"');
  return `bash -lc "${script}"`;
}

function readLockState(fsModule, lockPath) {
  try {
    if (!fsModule.existsSync(lockPath)) return null;
    const raw = fsModule.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLockState(fsModule, lockPath, state) {
  try {
    fsModule.writeFileSync(lockPath, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Non-fatal.
  }
}

function isLockStateFresh(state, now = Date.now(), ttlMs = WEBUI_PRESENCE_TTL_MS) {
  if (!state || state.isOpen !== true) return false;
  const lastSeenAt = Number(state.lastSeenAt) || 0;
  return lastSeenAt > 0 && now - lastSeenAt <= ttlMs;
}

function buildWindowsFocusOrOpenCommand(url, options = {}) {
  const titleHint = String(options.windowTitle || 'REM System').replace(/"/g, '`"');
  const safeUrl = String(url).replace(/"/g, '`"');
  const fullscreenEnabled = options.fullscreen !== false;
  const runtime = normalizeRuntimeName(options.runtime || 'edge');
  const cfg = WINDOWS_RUNTIME_CONFIG[runtime] || WINDOWS_RUNTIME_CONFIG.edge;
  const runtimeExe = String(options.executablePath || cfg.exe).replace(/"/g, '`"');
  const runtimeArgs = cfg.args.map((arg) => {
    if (!arg.includes('$URL')) {
      return `'${arg.replace(/'/g, "''")}'`;
    }

    const parts = arg.split('$URL').map((part) => `'${part.replace(/'/g, "''")}'`);
    return parts.join(' + $url + ');
  }).join(', ');

  const psScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$wshell = New-Object -ComObject WScript.Shell",
    `$title = \"${titleHint}\"`,
    `$url = \"${safeUrl}\"`,
    `$runtimeExe = \"${runtimeExe}\"`,
    `$runtimeArgs = @(${runtimeArgs})`,
    'if ($wshell.AppActivate($title)) {',
    fullscreenEnabled ? '  Start-Sleep -Milliseconds 120; $wshell.SendKeys("{F11}")' : '  # no fullscreen toggle requested',
    '  Write-Output "already-open-focused"',
    '  exit 0',
    '}',
    'Start-Process -FilePath $runtimeExe -ArgumentList $runtimeArgs',
    'Start-Sleep -Milliseconds 1400',
    'if ($wshell.AppActivate($title)) {',
    fullscreenEnabled ? '  Start-Sleep -Milliseconds 120; $wshell.SendKeys("{F11}")' : '  # no fullscreen toggle requested',
    '  Write-Output "opened-and-focused"',
    '  exit 0',
    '}',
    'Write-Output "opened"',
    'exit 0'
  ].join('; ');

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

function buildWindowsRuntimeArgs(url, runtime) {
  const cfg = WINDOWS_RUNTIME_CONFIG[normalizeRuntimeName(runtime || 'edge')] || WINDOWS_RUNTIME_CONFIG.edge;
  return cfg.args.map((arg) => arg.replace('$URL', url));
}

function focusWindowsWindow(url, options = {}) {
  const execFn = options.execFn || exec;
  const command = buildWindowsFocusOrOpenCommand(url, {
    windowTitle: options.windowTitle,
    fullscreen: options.fullscreen,
    runtime: options.runtime,
    executablePath: options.executablePath
  });
  execFn(command, (err) => {
    if (err && options.logger && typeof options.logger.log === 'function') {
      options.logger.log('  ⚠ Could not focus WebUI window:', err.message);
    }
  });
  return command;
}

function closeDedicatedWebUiWindow(options = {}) {
  const platform = options.platform || process.platform;
  const logger = options.logger || console;
  const titlePrefix = String(options.windowTitle || 'REM-System').replace(/["'`]/g, '').trim();

  try {
    if (platform === 'win32') {
      const script = [
        "$ErrorActionPreference='SilentlyContinue'",
        `$title = \"${titlePrefix}*\"`,
        "$names = @('chrome','msedge','brave','firefox','chromium')",
        'foreach ($n in $names) {',
        '  Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like $title } | ForEach-Object { $_.CloseMainWindow() | Out-Null }',
        '}',
        'Start-Sleep -Milliseconds 220',
        'foreach ($n in $names) {',
        '  Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like $title } | Stop-Process -Force -ErrorAction SilentlyContinue',
        '}',
        'Write-Output "closed"'
      ].join('; ');

      const probe = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', timeout: 2200 });
      const ok = probe.status === 0;
      return { ok, platform, detail: String(probe.stdout || probe.stderr || '').trim() };
    }

    if (platform === 'darwin') {
      const safeTitle = titlePrefix.replace(/"/g, '\\"');
      const script = [
        `set targetTitle to \"${safeTitle}\"`,
        'set appNames to {"Google Chrome", "Microsoft Edge", "Brave Browser", "Firefox", "Chromium"}',
        'tell application "System Events"',
        '  repeat with appName in appNames',
        '    if exists process (contents of appName) then',
        '      tell process (contents of appName)',
        '        repeat with w in windows',
        '          if (name of w starts with targetTitle) then',
        '            try',
        '              perform action "AXClose" of w',
        '            end try',
        '          end if',
        '        end repeat',
        '      end tell',
        '    end if',
        '  end repeat',
        'end tell'
      ].join('\n');
      const probe = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 2200 });
      const ok = probe.status === 0;
      return { ok, platform, detail: String(probe.stdout || probe.stderr || '').trim() };
    }

    if (platform === 'linux') {
      const safeTitle = titlePrefix.replace(/"/g, '\\"');
      const script = [
        'if command -v wmctrl >/dev/null 2>&1; then',
        `  wmctrl -l | awk '/${safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/{print $1}' | while read wid; do wmctrl -ic \"$wid\"; done`,
        'fi'
      ].join('; ');
      const probe = spawnSync('bash', ['-lc', script], { encoding: 'utf8', timeout: 2200 });
      const ok = probe.status === 0;
      return { ok, platform, detail: String(probe.stdout || probe.stderr || '').trim() };
    }
  } catch (err) {
    if (logger && typeof logger.log === 'function') {
      logger.log('  ⚠ Could not close dedicated WebUI window:', err.message);
    }
    return { ok: false, platform, error: err.message };
  }

  return { ok: false, platform, reason: 'unsupported-platform' };
}

function updateBrowserOpenState(state = {}, options = {}) {
  const fsModule = options.fsModule || fs;
  const lockPath = options.lockPath || getBrowserOpenLockPath();
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const previous = readLockState(fsModule, lockPath) || {};
  const next = {
    ...previous,
    ...state,
    lastSeenAt: now
  };
  writeLockState(fsModule, lockPath, next);
  return next;
}

function tryAutoOpenBrowser(url, options = {}) {
  const fsModule = options.fsModule || fs;
  const execFn = options.execFn || exec;
  const spawnFn = options.spawnFn || spawn;
  const scheduleFn = options.scheduleFn || setTimeout;
  const logger = options.logger || console;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const lockPath = options.lockPath || getBrowserOpenLockPath();
  const platform = options.platform || process.platform;

  // Allow operators to fully disable auto-open in headless/server scenarios.
  const envValue = String(process.env.REM_AUTO_OPEN_BROWSER || '').toLowerCase();
  if (options.autoOpen === false || envValue === '0' || envValue === 'false' || envValue === 'off') {
    return { opened: false, reason: 'disabled' };
  }

  const state = readLockState(fsModule, lockPath) || {};
  const alreadyOpen = isLockStateFresh(state, now, options.presenceTtlMs)
    && (!state.url || state.url === url);

  const runtimeResolution = resolvePreferredRuntime(platform, options);
  if (!runtimeResolution.ok && ['win32', 'darwin', 'linux'].includes(platform)) {
    if (logger && typeof logger.log === 'function') {
      logger.log('  ✖ WebUI dedicated runtime check failed:', runtimeResolution.message);
    }
    return { opened: false, reason: runtimeResolution.reason, error: runtimeResolution.message };
  }

  const cmd = platform === 'win32'
    ? buildWindowsFocusOrOpenCommand(url, { windowTitle: options.windowTitle, fullscreen: options.fullscreen, runtime: runtimeResolution.runtime, executablePath: runtimeResolution.executablePath })
    : platform === 'darwin'
      ? buildMacFocusOrOpenCommand(url, { fullscreen: options.fullscreen, runtime: runtimeResolution.runtime })
      : platform === 'linux'
        ? buildLinuxFocusOrOpenCommand(url, { windowTitle: options.windowTitle, fullscreen: options.fullscreen, runtime: runtimeResolution.runtime })
        : buildOpenCommand(url, platform);

  if (platform === 'win32') {
    if (alreadyOpen) {
      focusWindowsWindow(url, {
        execFn,
        logger,
        windowTitle: options.windowTitle,
        fullscreen: options.fullscreen,
        runtime: runtimeResolution.runtime,
        executablePath: runtimeResolution.executablePath
      });
    } else {
      const runtimeArgs = buildWindowsRuntimeArgs(url, runtimeResolution.runtime);
      try {
        const child = spawnFn(runtimeResolution.executablePath, runtimeArgs, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
        scheduleFn(() => {
          focusWindowsWindow(url, {
            execFn,
            logger,
            windowTitle: options.windowTitle,
            fullscreen: options.fullscreen,
            runtime: runtimeResolution.runtime,
            executablePath: runtimeResolution.executablePath
          });
        }, 1200);
      } catch (err) {
        if (logger && typeof logger.log === 'function') {
          logger.log('  ⚠ Could not auto-open browser:', err.message);
        }
        return { opened: false, reason: 'launch-failed', error: err.message };
      }
    }

    writeLockState(fsModule, lockPath, {
      ...state,
      url,
      isOpen: true,
      lastOpenedAt: now,
      lastSeenAt: now,
      pid: process.pid,
      platform
    });

    if (alreadyOpen) {
      return { opened: false, reason: 'already-open-switching', command: cmd };
    }
    return { opened: true, reason: 'opened', command: `${runtimeResolution.executablePath} ${buildWindowsRuntimeArgs(url, runtimeResolution.runtime).join(' ')}` };
  }

  writeLockState(fsModule, lockPath, {
    ...state,
    url,
    isOpen: true,
    lastOpenedAt: now,
    lastSeenAt: now,
    pid: process.pid,
    platform
  });

  execFn(cmd, (err) => {
    if (err && logger && typeof logger.log === 'function') {
      logger.log('  ⚠ Could not auto-open browser:', err.message);
    }
  });

  if (alreadyOpen) {
    return { opened: false, reason: 'already-open-switching', command: cmd };
  }
  return { opened: true, reason: 'opened', command: cmd };
}

module.exports = {
  CHROMIUM_RUNTIMES,
  DEFAULT_RUNTIME_BY_PLATFORM,
  WEBUI_PRESENCE_TTL_MS,
  buildWindowsRuntimeArgs,
  chooseDesiredRuntime,
  detectDefaultRuntime,
  closeDedicatedWebUiWindow,
  focusWindowsWindow,
  getBrowserOpenLockPath,
  buildOpenCommand,
  buildMacFocusOrOpenCommand,
  buildLinuxFocusOrOpenCommand,
  buildWindowsFocusOrOpenCommand,
  isLockStateFresh,
  resolvePreferredRuntime,
  updateBrowserOpenState,
  tryAutoOpenBrowser
};
