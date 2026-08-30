/**
 * AtomicFileOps — Safe atomic file writing with staging files and backup generation.
 */

export class AtomicFileOps {
  /**
   * Writes data to an absolute file path atomically.
   * 1. Writes to `${filePath}.tmp.${timestamp}`
   * 2. If target file already exists, makes a backup copy `${filePath}.bak`
   * 3. Renames the staging file to the target file.
   */
  static async writeAtomic(filePath: string, content: string | Uint8Array): Promise<{ ok: boolean; error?: string }> {
    let stagingPath: string | undefined;
    try {
      // Check if Node fs is available
      const fs = await this.getNodeFs();
      if (!fs) {
        return { ok: false, error: 'File system is not accessible in this environment.' };
      }

      stagingPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const backupPath = `${filePath}.bak`;

      // 1. Write and flush the staging file before it can become authoritative.
      const handle = await fs.promises.open(stagingPath, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }

      // 2. Backup existing file if present
      try {
        await fs.promises.copyFile(filePath, backupPath);
      } catch {
        // Target file did not exist yet; ignore
      }

      // 3. Atomically replace target file. Never copy bytes directly into the
      // destination: a crash during copy would expose a truncated primary file.
      try {
        await fs.promises.rename(stagingPath, filePath);
      } catch (renameError) {
        const displacedPath = `${filePath}.replace.${Date.now()}`;
        let displaced = false;
        try {
          await fs.promises.rename(filePath, displacedPath);
          displaced = true;
          await fs.promises.rename(stagingPath, filePath);
          await fs.promises.unlink(displacedPath).catch(() => {});
        } catch (replacementError) {
          if (displaced) await fs.promises.rename(displacedPath, filePath).catch(() => {});
          throw replacementError ?? renameError;
        }
      }
      stagingPath = undefined;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? String(err) };
    } finally {
      if (stagingPath) {
        try {
          const fs = await this.getNodeFs();
          await fs?.promises.unlink(stagingPath);
        } catch {}
      }
    }
  }

  /**
   * Reads a file with fallback to backup if the primary file is corrupted or missing.
   */
  static async readWithBackup(filePath: string): Promise<{ data?: string; recoveredFromBackup?: boolean; error?: string }> {
    try {
      const fs = await this.getNodeFs();
      if (!fs) return { error: 'File system is not accessible in this environment.' };

      try {
        const text = await fs.promises.readFile(filePath, 'utf-8');
        return { data: text, recoveredFromBackup: false };
      } catch {
        // Try reading backup
        const backupPath = `${filePath}.bak`;
        const text = await fs.promises.readFile(backupPath, 'utf-8');
        return { data: text, recoveredFromBackup: true };
      }
    } catch (err) {
      return { error: (err as Error)?.message ?? String(err) };
    }
  }

  private static async getNodeFs(): Promise<any> {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        // Dynamic import to remain bundle-safe in browser builds
        const fsModule = 'fs';
        return await import(/* @vite-ignore */ fsModule);
      }
    } catch {}
    return null;
  }
}
