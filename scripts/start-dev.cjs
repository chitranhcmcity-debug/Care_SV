const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;
const checkOnly = process.argv.includes('--check');

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
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
    throw new Error('Thieu backend/.env. Tao tu backend/.env.example, cau hinh MONGO_URI va JWT_SECRET theo README.md.');
  }
  // Do not mistake another application for this project's server.
  for (const port of [5000, 4201]) {
    await new Promise((resolve, reject) => {
      const probe = require('node:net').createServer();
      probe.once('error', () => reject(new Error(`Cong ${port} khong kha dung. Kiem tra va dong phien ung dung cu truoc khi mo lai.`)));
      probe.listen(port, '0.0.0.0', () => probe.close(resolve));
    });
  }
  console.log('Dang khoi dong ITC CARE. Giu cua so nay mo; nhan Ctrl+C de dung.');
  start('Backend', 'backend', ['server.js']);
  start('Frontend', 'frontend', ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', '0.0.0.0', '--port', '4201']);
  const deadline = Date.now() + 120000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      const page = await fetch('http://127.0.0.1:4201/', { signal: AbortSignal.timeout(2000) });
      const health = await fetch('http://127.0.0.1:4201/api/health', { signal: AbortSignal.timeout(2000) });
      const html = await page.text();
      if (page.ok && html.includes('<app-root') && health.ok && (await health.json()).ready === true) {
        ready = true;
        break;
      }
    } catch {
      // Wait for compilation and database connection.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (stopping) return;
  if (!ready) throw new Error('Qua 120 giay van chua san sang. Kiem tra loi backend/frontend o tren.');
  console.log('\nHE THONG DA SAN SANG: http://127.0.0.1:4201/');
  if (checkOnly) return stop(0);
  console.log('Giu cua so nay mo trong khi su dung.');
  const browser = spawn('powershell.exe', ['-NoProfile', '-Command', "Start-Process 'http://127.0.0.1:4201/'"], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', () => console.log('Hay tu mo http://127.0.0.1:4201/ trong trinh duyet.'));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
main().catch((error) => {
  console.error(error.message);
  stop(1);
});
