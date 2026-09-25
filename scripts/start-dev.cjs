const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
// Each checkout has its own controller; never terminate arbitrary port owners.
const projectId = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 20);
const controlPipe = `\\\\.\\pipe\\itc-care-${projectId}`;
let controller;
const children = [];
let stopping = false;
const checkOnly = process.argv.includes('--check');

async function stop(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (!child.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
          if (process.platform === 'win32') {
            // Angular and the temporary database can spawn their own processes.
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              windowsHide: true,
              stdio: 'ignore',
            });
            killer.once('error', () => {
              child.kill();
              resolve();
            });
            killer.once('exit', resolve);
          } else {
            child.once('exit', resolve);
            child.kill();
          }
        }),
    ),
  );
  if (controller) controller.close();
  process.exit(code);
}

async function restartPreviousSession() {
  const deadline = Date.now() + 15000;
  let requested = false;
  while (Date.now() < deadline) {
    const candidate = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.setTimeout(2000, () => socket.destroy());
      let command = '';
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        command += chunk;
        if (command === 'stop\n') {
          socket.end('stopping\n');
          console.log('\nDang dung phien cu de khoi dong lai...');
          void stop(0);
        } else if (command.length > 32) socket.destroy();
      });
    });
    const acquired = await new Promise((resolve, reject) => {
      candidate.once('error', (error) => {
        if (error.code === 'EADDRINUSE') resolve(false);
        else reject(error);
      });
      candidate.listen(controlPipe, () => resolve(true));
    });
    if (acquired) {
      controller = candidate;
      return;
    }
    if (!requested) {
      console.log('Da co phien ITC CARE dang chay. Dang yeu cau dung server cu...');
      requested = await new Promise((resolve) => {
        const socket = net.createConnection(controlPipe);
        socket.setTimeout(2000, () => socket.destroy());
        socket.once('connect', () => socket.end('stop\n'));
        socket.once('data', () => resolve(true));
        socket.once('error', () => resolve(false));
        socket.once('close', () => resolve(false));
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Khong dung duoc phien cu sau 15 giay. Hay dong cua so server cu va thu lai.');
}

function start(name, directory, args) {
  const child = spawn(process.execPath, args, {
    cwd: path.join(root, directory),
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`${name}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${name} da dung (ma ${code}). Xem loi o tren.`);
      stop(1);
    }
  });
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 15) throw new Error('Can Node.js >=24.15.0 <25.');
  for (const directory of ['backend', 'frontend']) {
    if (!existsSync(path.join(root, directory, 'node_modules'))) {
      throw new Error(`Thieu thu vien: chay npm ci trong thu muc ${directory}.`);
    }
  }
  if (!existsSync(path.join(root, 'backend/.env'))) {
    throw new Error(
      'Thieu backend/.env. Tao tu backend/.env.example, cau hinh MONGO_URI va JWT_SECRET theo README.md.',
    );
  }
  await restartPreviousSession();
  // Also adopt legacy servers launched with npm/nodemon before the controller existed.
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const cleanup = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(__dirname, 'stop-old-dev.ps1'),
          '-ProjectRoot',
          root,
          '-Ports',
          '5000,4201',
        ],
        { windowsHide: true, stdio: 'inherit' },
      );
      cleanup.once('error', reject);
      cleanup.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Khong don duoc server cu.')),
      );
    });
  }
  // Do not mistake another application for this project's server.
  for (const port of [5000, 4201]) {
    await new Promise((resolve, reject) => {
      const probe = require('node:net').createServer();
      probe.once('error', () =>
        reject(
          new Error(
            `Cong ${port} khong kha dung. Kiem tra va dong phien ung dung cu truoc khi mo lai.`,
          ),
        ),
      );
      probe.listen(port, '0.0.0.0', () => probe.close(resolve));
    });
  }
  console.log('Dang khoi dong ITC CARE. Giu cua so nay mo; nhan Ctrl+C de dung.');
  start('Backend', 'backend', ['server.js']);
  start('Frontend', 'frontend', [
    'node_modules/@angular/cli/bin/ng.js',
    'serve',
    '--host',
    '0.0.0.0',
    '--port',
    '4201',
  ]);
  const deadline = Date.now() + 120000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      const page = await fetch('http://127.0.0.1:4201/', { signal: AbortSignal.timeout(2000) });
      const health = await fetch('http://127.0.0.1:4201/api/health', {
        signal: AbortSignal.timeout(2000),
      });
      const html = await page.text();
      if (
        page.ok &&
        html.includes('<app-root') &&
        health.ok &&
        (await health.json()).ready === true
      ) {
        ready = true;
        break;
      }
    } catch {
      // Wait for compilation and database connection.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (stopping) return;
  if (!ready)
    throw new Error('Qua 120 giay van chua san sang. Kiem tra loi backend/frontend o tren.');
  console.log('\nHE THONG DA SAN SANG: http://127.0.0.1:4201/');
  if (checkOnly) return stop(0);
  console.log('Giu cua so nay mo trong khi su dung.');
  const browser = spawn(
    'powershell.exe',
    ['-NoProfile', '-Command', "Start-Process 'http://127.0.0.1:4201/'"],
    { windowsHide: true, stdio: 'ignore' },
  );
  browser.on('error', () => console.log('Hay tu mo http://127.0.0.1:4201/ trong trinh duyet.'));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
main().catch((error) => {
  console.error(error.message);
  stop(1);
});
