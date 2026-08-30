import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LockManager, DaemonManager } from '../src/server';

describe('LockManager & DaemonManager Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-daemon-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('acquires, reads, and updates daemon lock for a workspace', async () => {
    const lockInfo = {
      pid: process.pid,
      port: 5173,
      startedAt: Date.now(),
      projectRoot: tempDir,
    };

    const acquired = await LockManager.acquireLock(tempDir, lockInfo);
    expect(acquired).toBe(true);

    const read = await LockManager.readLock(tempDir);
    expect(read).toBeDefined();
    expect(read?.pid).toBe(process.pid);
    expect(read?.port).toBe(5173);

    // Heartbeat update
    await LockManager.updateHeartbeat(tempDir);
    const updated = await LockManager.readLock(tempDir);
    expect(updated?.lastHeartbeat).toBeDefined();

    // Release lock
    await LockManager.releaseLock(tempDir);
    const afterRelease = await LockManager.readLock(tempDir);
    expect(afterRelease).toBeNull();
  });

  it('rejects secondary lock acquisition when active daemon holds lock', async () => {
    const lock1 = {
      pid: process.pid, // current living process
      port: 5173,
      startedAt: Date.now(),
      projectRoot: tempDir,
    };

    const first = await LockManager.acquireLock(tempDir, lock1);
    expect(first).toBe(true);

    const second = await LockManager.acquireLock(tempDir, {
      pid: 999999, // another pid
      port: 5174,
      startedAt: Date.now(),
      projectRoot: tempDir,
    });
    expect(second).toBe(false);
  });

  it('cleans up stale locks left by non-existent processes', async () => {
    const lockDir = path.join(tempDir, '.mix');
    fs.mkdirSync(lockDir, { recursive: true });

    // Write a fake lock with a definitely dead/non-existent PID
    const deadLock = {
      pid: 99999999,
      port: 5173,
      startedAt: Date.now() - 100000,
      lastHeartbeat: Date.now() - 100000,
      projectRoot: tempDir,
    };
    fs.writeFileSync(path.join(lockDir, 'daemon.lock'), JSON.stringify(deadLock));

    const read = await LockManager.readLock(tempDir);
    expect(read).toBeNull(); // Stale lock automatically cleaned up
  });

  it('reports accurate daemon status via DaemonManager', async () => {
    const statusBefore = await DaemonManager.getStatus(tempDir);
    expect(statusBefore.running).toBe(false);

    await DaemonManager.ensureDaemon(tempDir, { port: 5200 });

    const statusAfter = await DaemonManager.getStatus(tempDir);
    expect(statusAfter.running).toBe(true);
    expect(statusAfter.pid).toBe(process.pid);
    expect(statusAfter.port).toBe(5200);

    await LockManager.releaseLock(tempDir);
  });
});
