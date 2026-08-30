/**
 * LockManager — Project-scoped lock file management for MIX Engine daemon.
 *
 * Ensures a single active authoring daemon per workspace and detects stale/crashed processes.
 */

import * as path from 'path';

export interface DaemonLockInfo {
  pid: number;
  port: number;
  wsPort?: number;
  startedAt: number;
  lastHeartbeat: number;
  projectRoot: string;
}

export class LockManager {
  private static readonly LOCK_DIR = '.mix';
  private static readonly LOCK_FILE = 'daemon.lock';

  /**
   * Returns the absolute path to the daemon lock file for a project root.
   */
  static getLockPath(projectRoot: string): string {
    return path.join(projectRoot, this.LOCK_DIR, this.LOCK_FILE);
  }

  /**
   * Checks if a process PID is currently alive on the host system.
   */
  static isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 tests process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads and validates the current lock file if present and alive.
   */
  static async readLock(projectRoot: string): Promise<DaemonLockInfo | null> {
    try {
      const fs = await this.getNodeFs();
      if (!fs) return null;

      const lockPath = this.getLockPath(projectRoot);
      const raw = await fs.promises.readFile(lockPath, 'utf-8');
      const info = JSON.parse(raw) as DaemonLockInfo;

      if (info && typeof info.pid === 'number') {
        if (this.isProcessAlive(info.pid)) {
          return info;
        } else {
          // Stale lock from crashed process — clean it up
          await this.releaseLock(projectRoot);
          return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Acquires the project lock file. Returns true if acquired, false if another alive daemon holds it.
   */
  static async acquireLock(projectRoot: string, info: Omit<DaemonLockInfo, 'lastHeartbeat'>): Promise<boolean> {
    try {
      const fs = await this.getNodeFs();
      if (!fs) return false;

      const existing = await this.readLock(projectRoot);
      if (existing && existing.pid !== info.pid) {
        return false;
      }

      const lockDir = path.join(projectRoot, this.LOCK_DIR);
      await fs.promises.mkdir(lockDir, { recursive: true });

      const lockPath = this.getLockPath(projectRoot);
      const payload: DaemonLockInfo = {
        ...info,
        lastHeartbeat: Date.now(),
      };

      // If we already own the existing lock, update it; otherwise attempt exclusive creation
      if (existing && existing.pid === info.pid) {
        await fs.promises.writeFile(lockPath, JSON.stringify(payload, null, 2), 'utf-8');
        return true;
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fs.promises.writeFile(lockPath, JSON.stringify(payload, null, 2), { encoding: 'utf-8', flag: 'wx' });
          return true;
        } catch (err: any) {
          if (err?.code !== 'EEXIST') return false;
          const recheck = await this.readLock(projectRoot);
          if (recheck) return recheck.pid === info.pid;
          // readLock removed a stale file. Retry exclusive creation; never fall
          // back to a normal write that lets two contenders both report success.
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Updates the heartbeat timestamp in the lock file with optional PID verification.
   */
  static async updateHeartbeat(projectRoot: string, pid = process.pid): Promise<void> {
    try {
      const fs = await this.getNodeFs();
      if (!fs) return;

      const lockPath = this.getLockPath(projectRoot);
      const raw = await fs.promises.readFile(lockPath, 'utf-8');
      const info = JSON.parse(raw) as DaemonLockInfo;
      if (pid && info.pid !== pid) return;
      info.lastHeartbeat = Date.now();
      await fs.promises.writeFile(lockPath, JSON.stringify(info, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Releases the lock file with optional PID verification.
   */
  static async releaseLock(projectRoot: string, pid = process.pid): Promise<void> {
    try {
      const fs = await this.getNodeFs();
      if (!fs) return;
      const lockPath = this.getLockPath(projectRoot);
      try {
        const raw = await fs.promises.readFile(lockPath, 'utf-8');
        const info = JSON.parse(raw) as DaemonLockInfo;
        if (pid && info.pid && info.pid !== pid && this.isProcessAlive(info.pid)) {
          return; // Do not release another active process's lock
        }
      } catch {}
      await fs.promises.unlink(lockPath);
    } catch {}
  }

  private static async getNodeFs(): Promise<any> {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fsModule = 'fs';
        return await import(/* @vite-ignore */ fsModule);
      }
    } catch {}
    return null;
  }
}
