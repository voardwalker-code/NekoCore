// kill-server.js
// Kills any process using the specified port (default 3847)
// Usage: node kill-server.js [port]

const { exec } = require('child_process');
const port = process.argv[2] || 3847;

function killProcessOnPort(port) {
  // Windows: use netstat to find PID, then taskkill
  const findCmd = `netstat -ano | findstr :${port}`;
  exec(findCmd, (err, stdout) => {
    if (err || !stdout) {
      console.log(`No process found on port ${port}.`);
      return;
    }
    // Parse PID from netstat output
    const lines = stdout.trim().split('\n');
    let killed = false;
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        const killCmd = `taskkill /PID ${pid} /F`;
        exec(killCmd, (killErr, killStdout, killStderr) => {
          if (killErr) {
            console.error(`Failed to kill PID ${pid}:`, killStderr || killErr.message);
          } else {
            console.log(`Killed process on port ${port} (PID ${pid})`);
            killed = true;
          }
        });
      }
    });
    if (!killed) {
      console.log(`No process killed. Check permissions or port.`);
    }
  });
}

killProcessOnPort(port);
