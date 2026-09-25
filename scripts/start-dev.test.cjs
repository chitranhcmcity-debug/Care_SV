const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

test(
  'rerunning the launcher stops the previous process tree and releases both ports',
  {
    skip: process.platform !== 'win32',
    timeout: 30000,
  },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'itc-care-restart-'));
    const processes = [];
    t.after(async () => {
      for (const child of processes) {
        if (child.exitCode === null && child.signalCode === null) {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          await once(killer, 'exit');
        }
      }
      await fs.rm(root, { recursive: true, force: true });
    });
    const reserve = async () => {
      const server = net.createServer();
      server.listen(0, '0.0.0.0');
      await once(server, 'listening');
      return server;
    };
    const reservations = await Promise.all([reserve(), reserve()]);
    const ports = reservations.map((server) => server.address().port);
    await Promise.all(
      reservations.map((server) => new Promise((resolve) => server.close(resolve))),
    );
    for (const directory of [
      'scripts',
      'backend/node_modules',
      'frontend/node_modules/@angular/cli/bin',
    ]) {
      await fs.mkdir(path.join(root, directory), { recursive: true });
    }
    await fs.writeFile(path.join(root, 'backend/.env'), '');
    await fs.copyFile(
      path.join(__dirname, 'stop-old-dev.ps1'),
      path.join(root, 'scripts/stop-old-dev.ps1'),
    );
    const launcher = (await fs.readFile(path.join(__dirname, 'start-dev.cjs'), 'utf8'))
      .replaceAll('5000', String(ports[0]))
      .replaceAll('4201', String(ports[1]));
    await fs.writeFile(path.join(root, 'scripts/start-dev.cjs'), launcher);
    const fixture = (port, label) => `
    const http = require('node:http');
    const { spawn } = require('node:child_process');
    const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true });
    console.log('WORKER:' + worker.pid);
    http.createServer((req, res) => {
      res.end(req.url === '/api/health'
        ? JSON.stringify({ ready: process.env.FIXTURE_READY === 'true' })
        : '<app-root></app-root>');
    }).listen(${port}, '0.0.0.0', () => console.log('${label} READY'));
  `;
    await fs.writeFile(path.join(root, 'backend/server.js'), fixture(ports[0], 'BACKEND'));
    await fs.writeFile(
      path.join(root, 'frontend/node_modules/@angular/cli/bin/ng.js'),
      fixture(ports[1], 'FRONTEND'),
    );
    const launch = (ready) => {
      const child = spawn(process.execPath, [path.join(root, 'scripts/start-dev.cjs'), '--check'], {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, FIXTURE_READY: String(ready) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      processes.push(child);
      child.output = '';
      child.stdout.on('data', (chunk) => {
        child.output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        child.output += chunk;
      });
      child.done = once(child, 'exit');
      return child;
    };
    const first = launch(false);
    const deadline = Date.now() + 10000;
    while (!first.output.includes('BACKEND READY') || !first.output.includes('FRONTEND READY')) {
      assert.equal(first.exitCode, null, first.output);
      assert.ok(Date.now() < deadline, first.output);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const second = launch(true);
    assert.equal((await second.done)[0], 0, second.output);
    assert.equal((await first.done)[0], 0, first.output);
    assert.match(second.output, /HE THONG DA SAN SANG/);
    for (const child of [first, second]) {
      for (const match of child.output.matchAll(/WORKER:(\d+)/g)) {
        assert.throws(() => process.kill(Number(match[1]), 0), { code: 'ESRCH' });
      }
    }
    // A foreign application occupying a port must survive the restart attempt.
    const foreign = net.createServer();
    foreign.listen(ports[0], '0.0.0.0');
    await once(foreign, 'listening');
    t.after(() => new Promise((resolve) => foreign.close(resolve)));
    const blocked = launch(true);
    assert.equal((await blocked.done)[0], 1, blocked.output);
    assert.match(blocked.output, /khong kha dung/);
    assert.equal(foreign.listening, true);
  },
);
