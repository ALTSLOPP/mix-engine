/**
 * DaemonManager — Client-side and lifecycle controller for MIX Authoring Daemon.
 *
 * Automatically checks, starts, stops, and communicates with background authoring instances.
 */

import { LockManager, type DaemonLockInfo } from './LockManager';

export interface DaemonStatusReport {
  running: boolean;
  pid?: number;
  port?: number;
  startedAt?: number;
  uptimeSeconds?: number;
  lockPath: string;
  statusText: string;
}

export class DaemonManager {
  /**
   * Checks the status of the daemon for a given project directory.
   */
  static async getStatus(projectRoot: string): Promise<DaemonStatusReport> {
    const lockPath = LockManager.getLockPath(projectRoot);
    const lockInfo = await LockManager.readLock(projectRoot);

    if (!lockInfo) {
      return {
        running: false,
        lockPath,
        statusText: 'MIX authoring daemon is not running.',
      };
    }

    const uptimeSeconds = Math.round((Date.now() - lockInfo.startedAt) / 1000);
    return {
      running: true,
      pid: lockInfo.pid,
      port: lockInfo.port,
      startedAt: lockInfo.startedAt,
      uptimeSeconds,
      lockPath,
      statusText: `MIX authoring daemon is active (PID ${lockInfo.pid}, port ${lockInfo.port}, uptime ${uptimeSeconds}s).`,
    };
  }

  /**
   * Ensures an authoring service is registered. By default the current process is
   * the service owner. Desktop/CLI hosts can provide `launch` to start a real child
   * and return its bound PID/port before the lock is published.
   */
  static async ensureDaemon(projectRoot: string, options?: {
    port?: number;
    launch?: (request: { projectRoot: string; preferredPort: number }) => Promise<{ pid: number; port: number; wsPort?: number }>;
  }): Promise<DaemonLockInfo> {
    const existing = await LockManager.readLock(projectRoot);
    if (existing) {
      return existing;
    }

    const preferredPort = options?.port ?? await this.findOpenPort(5173);
    const launched = options?.launch
      ? await options.launch({ projectRoot, preferredPort })
      : { pid: process.pid, port: preferredPort, wsPort: undefined };
    if (!Number.isInteger(launched.pid) || launched.pid <= 0 || !Number.isInteger(launched.port) || launched.port <= 0) {
      throw new Error('Authoring daemon launcher returned an invalid PID or port.');
    }
    const info: Omit<DaemonLockInfo, 'lastHeartbeat'> = {
      pid: launched.pid,
      port: launched.port,
      wsPort: launched.wsPort,
      startedAt: Date.now(),
      projectRoot,
    };

    const acquired = await LockManager.acquireLock(projectRoot, info);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for project at ${projectRoot}. Another instance may be starting.`);
    }

    return {
      ...info,
      lastHeartbeat: Date.now(),
    };
  }

  /**
   * Finds an open port starting from the given preferred port.
   */
  static async findOpenPort(preferred: number): Promise<number> {
    try {
      const net = await import(/* @vite-ignore */ 'net');
      return new Promise<number>((resolve) => {
        const server = net.createServer();
        server.listen(preferred, () => {
          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : preferred;
          server.close(() => resolve(port));
        });
        server.on('error', () => {
          // Port in use, try next
          server.close();
          resolve(this.findOpenPort(preferred + 1));
        });
      });
    } catch {
      return preferred;
    }
  }

  /**
   * Checks whether a specific PID is still running.
   */
  static isProcessRunning(pid: number): boolean {
    return LockManager.isProcessAlive(pid);
  }

  /**
   * Requests a running daemon to shut down gracefully.
   */
  static async stopDaemon(projectRoot: string): Promise<boolean> {
    const lockInfo = await LockManager.readLock(projectRoot);
    if (!lockInfo) return true;

    try {
      if (lockInfo.pid === process.pid) {
        await LockManager.releaseLock(projectRoot, lockInfo.pid);
        return true;
      }
      // Send SIGTERM to running daemon PID
      process.kill(lockInfo.pid, 'SIGTERM');
      await LockManager.releaseLock(projectRoot, lockInfo.pid);
      return true;
    } catch (err) {
      await LockManager.releaseLock(projectRoot, lockInfo.pid);
      return false;
    }
  }
}
