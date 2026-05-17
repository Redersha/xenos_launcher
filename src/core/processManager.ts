import * as child_process from 'child_process';
import * as os from 'os';

export interface RunningGame {
  pid: number;
  instanceId: string;
  instanceName: string;
  versionId: string;
  accountId: string;
  startTime: number;
  child: child_process.ChildProcess;
}

class ProcessManager {
  private games: Map<number, RunningGame> = new Map();

  register(
    pid: number,
    instanceId: string,
    instanceName: string,
    versionId: string,
    accountId: string,
    child: child_process.ChildProcess
  ): void {
    this.games.set(pid, {
      pid,
      instanceId,
      instanceName,
      versionId,
      accountId,
      startTime: Date.now(),
      child,
    });
  }

  unregister(pid: number): void {
    this.games.delete(pid);
  }

  list(): RunningGame[] {
    // Clean up exited processes
    for (const [pid, game] of this.games) {
      try {
        // Check if process is still running - kill with signal 0 is a no-op check
        process.kill(pid, 0);
      } catch {
        this.games.delete(pid);
      }
    }
    return Array.from(this.games.values());
  }

  findByPid(pid: number): RunningGame | undefined {
    return this.games.get(pid);
  }

  findByName(name: string): RunningGame[] {
    return this.list().filter(g =>
      g.instanceName.toLowerCase().includes(name.toLowerCase())
    );
  }

  findByVersion(version: string): RunningGame[] {
    return this.list().filter(g => g.versionId === version);
  }

  killByPid(pid: number): boolean {
    const game = this.games.get(pid);
    if (!game) return false;
    try {
      if (os.platform() === 'win32') {
        child_process.execSync(`taskkill /pid ${pid} /T /F`, { timeout: 5000 });
      } else {
        process.kill(pid, 'SIGTERM');
        // Give it a moment, then force kill if still running
        setTimeout(() => {
          try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
        }, 3000);
      }
      this.games.delete(pid);
      return true;
    } catch {
      try {
        this.games.delete(pid);
      } catch { /* ignore */ }
      return false;
    }
  }

  killByName(name: string): number {
    const games = this.findByName(name);
    let killed = 0;
    for (const game of games) {
      if (this.killByPid(game.pid)) killed++;
    }
    return killed;
  }

  killByVersion(version: string): number {
    const games = this.findByVersion(version);
    let killed = 0;
    for (const game of games) {
      if (this.killByPid(game.pid)) killed++;
    }
    return killed;
  }

  getRunningCount(): number {
    return this.list().length;
  }
}

export const processManager = new ProcessManager();
