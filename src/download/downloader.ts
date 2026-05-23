import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { mkdirp } from 'mkdirp';
import { PATHS } from '../store/paths.js';
import { getVersionDetail } from '../core/version.js';
import { getLibraryPath, getVersionJarPath, getAssetIndexPath, getAssetObjectPath } from '../store/paths.js';

export interface DownloadTask {
  url: string;
  dest: string;
  sha1?: string;
  size?: number;
  name?: string;
  expectedHash?: string;
  hashAlgorithm?: 'sha1' | 'sha256' | 'md5';
}

export interface DownloadProgress {
  taskId: number;
  totalTasks: number;
  fileName: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // seconds
  // Overall progress
  completedTasks: number;
  totalBytesAll: number;
  downloadedBytesAll: number;
  overallPercentage: number;
  resumed?: boolean; // Whether this download was resumed
}

export interface DownloadResult {
  succeeded: number;
  failed: number;
  errors: Error[];
  skipped: number;
}

// Track active downloads for potential resume
interface DownloadState {
  url: string;
  dest: string;
  downloadedSize: number;
  totalSize: number;
  hash?: string;
  lastModified: number;
}

// Store download states to .download-state.json
const STATE_FILE = '.download-state.json';

function getDownloadStatePath(dest: string): string {
  return dest + '.state';
}

function saveDownloadState(state: DownloadState): void {
  const statePath = getDownloadStatePath(state.dest);
  try {
    fs.writeFileSync(statePath, JSON.stringify(state), 'utf-8');
  } catch { /* ignore */ }
}

function loadDownloadState(dest: string): DownloadState | null {
  const statePath = getDownloadStatePath(dest);
  if (!fs.existsSync(statePath)) return null;
  try {
    const data = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

function clearDownloadState(dest: string): void {
  const statePath = getDownloadStatePath(dest);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
}

function computeFileHash(filePath: string, algorithm: 'sha1' | 'sha256' | 'md5' = 'sha1'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function computeStreamHash(data: Buffer, algorithm: 'sha1' | 'sha256' | 'md5' = 'sha1'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

// Verify file integrity
async function verifyFileIntegrity(
  filePath: string,
  expectedHash?: string,
  hashAlgorithm: 'sha1' | 'sha256' | 'md5' = 'sha1'
): Promise<boolean> {
  if (!expectedHash) return true;

  try {
    const actualHash = await computeFileHash(filePath, hashAlgorithm);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
  } catch {
    return false;
  }
}

// Check if file is complete and valid
async function isFileValid(
  dest: string,
  expectedHash?: string,
  expectedSize?: number,
  hashAlgorithm: 'sha1' | 'sha256' | 'md5' = 'sha1'
): Promise<boolean> {
  if (!fs.existsSync(dest)) return false;

  const stat = fs.statSync(dest);
  if (expectedSize && stat.size !== expectedSize) return false;

  if (expectedHash) {
    return await verifyFileIntegrity(dest, expectedHash, hashAlgorithm);
  }

  return true;
}

export async function downloadWithProgress(
  tasks: DownloadTask[],
  concurrency: number = 4,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Error[] = [];
  let taskIndex = 0;
  let completedTasks = 0;

  // Pre-calculate total bytes from all tasks
  const totalBytesAll = tasks.reduce((sum, t) => sum + (t.size || 0), 0);
  let downloadedBytesAll = 0;

  // Track per-file downloaded bytes for overall calculation
  const fileDownloaded: number[] = new Array(tasks.length).fill(0);

  const startTime = Date.now();

  async function processTask(): Promise<void> {
    while (taskIndex < tasks.length) {
      const currentIndex = taskIndex++;
      const task = tasks[currentIndex];
      const hashAlgo = task.hashAlgorithm || 'sha1';

      try {
        // Check if file is already valid (complete and hash matches)
        const existingValid = await isFileValid(
          task.dest,
          task.sha1 || task.expectedHash,
          task.size,
          hashAlgo
        );

        if (existingValid) {
          completedTasks++;
          skipped++;
          const existingSize = fs.statSync(task.dest).size;
          fileDownloaded[currentIndex] = existingSize;
          downloadedBytesAll += existingSize;
          if (onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? downloadedBytesAll / elapsed : 0;
            onProgress({
              taskId: currentIndex,
              totalTasks: tasks.length,
              fileName: task.name || path.basename(task.dest),
              bytesDownloaded: existingSize,
              totalBytes: existingSize,
              percentage: 100,
              speed,
              eta: 0,
              completedTasks,
              totalBytesAll,
              downloadedBytesAll,
              overallPercentage: totalBytesAll > 0 ? Math.round((downloadedBytesAll / totalBytesAll) * 100) : Math.round((completedTasks / tasks.length) * 100),
            });
          }
          clearDownloadState(task.dest); // Clean up any stale state
          continue;
        }

        // Ensure parent directory exists
        await mkdirp(path.dirname(task.dest));

        // Download with resume support
        const resumed = await downloadFileWithResume(task, currentIndex, (progress) => {
          if (onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? (progress.downloadedBytesAll) / elapsed : 0;
            onProgress({
              taskId: currentIndex,
              totalTasks: tasks.length,
              fileName: task.name || path.basename(task.dest),
              bytesDownloaded: progress.bytesDownloaded || 0,
              totalBytes: progress.totalBytes || 0,
              percentage: progress.percentage || 0,
              speed,
              eta: progress.eta || 0,
              completedTasks,
              totalBytesAll,
              downloadedBytesAll: progress.downloadedBytesAll,
              overallPercentage: totalBytesAll > 0 ? Math.round((progress.downloadedBytesAll / totalBytesAll) * 100) : Math.round((completedTasks / tasks.length) * 100),
              resumed: progress.resumed,
            });
          }
        });

        if (resumed) {
          downloadedBytesAll = fileDownloaded.reduce((a, b) => a + b, 0);
        }

        // Final integrity check
        const isValid = await verifyFileIntegrity(
          task.dest,
          task.sha1 || task.expectedHash,
          hashAlgo
        );

        if (!isValid && (task.sha1 || task.expectedHash)) {
          // Delete invalid file and clear state
          if (fs.existsSync(task.dest)) {
            fs.unlinkSync(task.dest);
          }
          clearDownloadState(task.dest);
          throw new Error(`Integrity verification failed for ${task.name || task.dest}`);
        }

        clearDownloadState(task.dest);
        completedTasks++;
        succeeded++;
      } catch (error) {
        failed++;
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Run concurrent downloads
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => processTask());
  await Promise.all(workers);

  return { succeeded, failed, errors, skipped };
}

/**
 * Download a single file with resume support (断点续传).
 * Checks for partial downloads and resumes from where left off.
 */
async function downloadFileWithResume(
  task: DownloadTask,
  taskIdx: number,
  onProgress?: (progress: Partial<DownloadProgress> & { downloadedBytesAll: number }) => void
): Promise<boolean> {
  const tmpPath = task.dest + '.downloading';
  const statePath = getDownloadStatePath(task.dest);

  let downloadedBytesAll = 0;
  let lastProgress = 0;
  let lastProgressTime = Date.now();
  let resumed = false;

  // Load previous download state
  let startByte = 0;
  let existingSize = 0;

  if (fs.existsSync(tmpPath)) {
    existingSize = fs.statSync(tmpPath).size;
    startByte = existingSize;
    resumed = true;
  }

  // Restore progress from state file if available
  const savedState = loadDownloadState(task.dest);
  if (savedState && savedState.downloadedSize > existingSize) {
    startByte = savedState.downloadedSize;
    existingSize = startByte;
  }

  const headers: Record<string, string> = {};
  if (startByte > 0) {
    headers['Range'] = `bytes=${startByte}-`;
  }

  try {
    const resp = await axios.get(task.url, {
      responseType: 'stream',
      timeout: 60000,
      headers,
    });

    const totalSize = parseInt(String(resp.headers['content-length'] || task.size || 0)) + startByte;
    const isPartial = resp.headers['content-range'] !== undefined;

    // Update startByte based on server response
    if (isPartial && resp.headers['content-range']) {
      const rangeMatch = resp.headers['content-range'].match(/bytes \d+-(\d+)\/(\d+)/);
      if (rangeMatch) {
        startByte = parseInt(rangeMatch[1]) + 1;
      }
    }

    // Save initial state
    saveDownloadState({
      url: task.url,
      dest: task.dest,
      downloadedSize: startByte,
      totalSize,
      hash: task.sha1 || task.expectedHash,
      lastModified: Date.now(),
    });

    let downloaded = startByte;
    downloadedBytesAll = startByte;

    // Open file in append mode if resuming
    const writer = fs.createWriteStream(tmpPath, { flags: resumed ? 'a' : 'w' });

    await new Promise<void>((resolve, reject) => {
      resp.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        downloadedBytesAll += chunk.length;

        // Update state file periodically (every 5 seconds or 1MB)
        if (downloaded - lastProgress > 1024 * 1024 || Date.now() - lastProgressTime > 5000) {
          saveDownloadState({
            url: task.url,
            dest: task.dest,
            downloadedSize: downloaded,
            totalSize,
            hash: task.sha1 || task.expectedHash,
            lastModified: Date.now(),
          });
          lastProgress = downloaded;
          lastProgressTime = Date.now();
        }

        if (onProgress) {
          const elapsed = (Date.now() - lastProgressTime) / 1000;
          const speed = elapsed > 0 ? (downloaded - startByte - (lastProgress - startByte)) / elapsed : 0;

          onProgress({
            taskId: taskIdx,
            totalTasks: 1,
            fileName: task.name || path.basename(task.dest),
            bytesDownloaded: downloaded - startByte,
            totalBytes: totalSize - startByte,
            percentage: totalSize > startByte ? Math.round(((downloaded - startByte) / (totalSize - startByte)) * 100) : 0,
            eta: speed > 0 ? Math.round(((totalSize - downloaded) / speed)) : 0,
            downloadedBytesAll,
            resumed,
          });
        }
      });

      resp.data.pipe(writer);

      writer.on('finish', () => {
        // Final state save
        saveDownloadState({
          url: task.url,
          dest: task.dest,
          downloadedSize: downloaded,
          totalSize,
          hash: task.sha1 || task.expectedHash,
          lastModified: Date.now(),
        });
        resolve();
      });
      writer.on('error', reject);
      resp.data.on('error', reject);
    });

    // Move temp file to final destination
    if (fs.existsSync(task.dest)) {
      fs.unlinkSync(task.dest);
    }
    fs.renameSync(tmpPath, task.dest);

    return resumed;
  } catch (error: any) {
    // Save progress before throwing
    if (downloadedBytesAll > startByte) {
      saveDownloadState({
        url: task.url,
        dest: task.dest,
        downloadedSize: downloadedBytesAll,
        totalSize: 0,
        hash: task.sha1 || task.expectedHash,
        lastModified: Date.now(),
      });
    }

    // Clean up temp file only if it's smaller than what we had
    if (fs.existsSync(tmpPath)) {
      const tmpSize = fs.statSync(tmpPath).size;
      if (tmpSize <= startByte) {
        fs.unlinkSync(tmpPath);
      }
    }

    throw error;
  }
}

/**
 * Verify all game files for an instance before launch.
 * Returns list of missing or corrupt files.
 */
export async function verifyInstanceFiles(
  versionId: string,
  onProgress?: (msg: string) => void
): Promise<{ valid: boolean; missingFiles: string[]; corruptFiles: string[] }> {
  const missingFiles: string[] = [];
  const corruptFiles: string[] = [];

  try {
    const detail = await getVersionDetail(versionId);

    // Check client jar
    const jarPath = getVersionJarPath(versionId);
    if (!fs.existsSync(jarPath)) {
      missingFiles.push(jarPath);
    } else if (detail.downloads?.client?.sha1) {
      const hash = await computeFileHash(jarPath);
      if (hash !== detail.downloads.client.sha1) {
        corruptFiles.push(jarPath);
      }
    }

    // Check libraries
    for (const lib of detail.libraries) {
      if (lib.downloads?.artifact) {
        const libPath = getLibraryPath(lib.downloads.artifact.path);
        if (!fs.existsSync(libPath)) {
          missingFiles.push(libPath);
        } else if (lib.downloads.artifact.sha1) {
          const hash = await computeFileHash(libPath);
          if (hash !== lib.downloads.artifact.sha1) {
            corruptFiles.push(libPath);
          }
        }
      }
    }

    // Check asset index
    if (detail.assetIndex) {
      const indexPath = getAssetIndexPath(detail.assetIndex.id);
      if (!fs.existsSync(indexPath)) {
        missingFiles.push(indexPath);
      } else if (detail.assetIndex.sha1) {
        const hash = await computeFileHash(indexPath);
        if (hash !== detail.assetIndex.sha1) {
          corruptFiles.push(indexPath);
        }
      }
    }

    const valid = missingFiles.length === 0 && corruptFiles.length === 0;
    return { valid, missingFiles, corruptFiles };
  } catch (error) {
    return { valid: false, missingFiles: [], corruptFiles: [] };
  }
}

/**
 * Clean up incomplete downloads (temp files and state files).
 */
export function cleanupIncompleteDownloads(): void {
  const cleanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          cleanDir(fullPath);
        } else if (entry.name.endsWith('.downloading') || entry.name.endsWith('.state')) {
          try {
            fs.unlinkSync(fullPath);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  };

  cleanDir(PATHS.versions);
  cleanDir(PATHS.libraries);
  cleanDir(PATHS.assets);
}

/**
 * Resume interrupted downloads for a specific version.
 */
export async function resumeVersionDownloads(
  versionId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  // First verify what files are needed
  const detail = await getVersionDetail(versionId);
  const tasks: DownloadTask[] = [];

  // Client jar
  if (detail.downloads?.client) {
    const jarPath = getVersionJarPath(versionId);
    const isValid = await isFileValid(jarPath, detail.downloads.client.sha1, detail.downloads.client.size);
    if (!isValid) {
      tasks.push({
        url: detail.downloads.client.url,
        dest: jarPath,
        sha1: detail.downloads.client.sha1,
        size: detail.downloads.client.size,
        name: `${versionId}.jar`,
      });
    }
  }

  // Libraries
  for (const lib of detail.libraries) {
    if (lib.downloads?.artifact) {
      const libPath = getLibraryPath(lib.downloads.artifact.path);
      const isValid = await isFileValid(libPath, lib.downloads.artifact.sha1, lib.downloads.artifact.size);
      if (!isValid) {
        tasks.push({
          url: lib.downloads.artifact.url,
          dest: libPath,
          sha1: lib.downloads.artifact.sha1,
          size: lib.downloads.artifact.size,
          name: lib.name,
        });
      }
    }
  }

  // Asset index
  if (detail.assetIndex) {
    const indexPath = getAssetIndexPath(detail.assetIndex.id);
    const isValid = await isFileValid(indexPath, detail.assetIndex.sha1, detail.assetIndex.size);
    if (!isValid) {
      tasks.push({
        url: detail.assetIndex.url,
        dest: indexPath,
        sha1: detail.assetIndex.sha1,
        size: detail.assetIndex.size,
        name: `${detail.assetIndex.id}.json`,
      });
    }
  }

  if (tasks.length === 0) {
    return { succeeded: 0, failed: 0, errors: [], skipped: 0 };
  }

  return await downloadWithProgress(tasks, 8, onProgress);
}

export async function downloadVersionFiles(
  versionId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  const detail = await getVersionDetail(versionId);
  const tasks: DownloadTask[] = [];

  // Client jar
  if (detail.downloads?.client) {
    const jarPath = getVersionJarPath(versionId);
    // Only add if not already valid
    if (!await isFileValid(jarPath, detail.downloads.client.sha1, detail.downloads.client.size)) {
      tasks.push({
        url: detail.downloads.client.url,
        dest: jarPath,
        sha1: detail.downloads.client.sha1,
        size: detail.downloads.client.size,
        name: `${versionId}.jar`,
      });
    }
  }

  // Libraries
  for (const lib of detail.libraries) {
    if (lib.downloads?.artifact) {
      const libPath = getLibraryPath(lib.downloads.artifact.path);
      if (!await isFileValid(libPath, lib.downloads.artifact.sha1, lib.downloads.artifact.size)) {
        tasks.push({
          url: lib.downloads.artifact.url,
          dest: libPath,
          sha1: lib.downloads.artifact.sha1,
          size: lib.downloads.artifact.size,
          name: lib.name,
        });
      }
    } else if ((lib as any).url && lib.name) {
      // Maven-style library (Fabric/Quilt) - resolve from Maven coordinates
      const mavenTask = resolveMavenLibrary(lib);
      if (mavenTask) tasks.push(mavenTask);
    }
    // Native classifiers (e.g. lwjgl-platform, jinput-platform)
    if (lib.downloads?.classifiers) {
      for (const [classifier, download] of Object.entries(lib.downloads.classifiers)) {
        const dl = download as { url: string; path: string; sha1: string; size: number };
        const classifierPath = getLibraryPath(dl.path);
        if (!await isFileValid(classifierPath, dl.sha1, dl.size)) {
          tasks.push({
            url: dl.url,
            dest: classifierPath,
            sha1: dl.sha1,
            size: dl.size,
            name: `${lib.name} (${classifier})`,
          });
        }
      }
    }
  }

  // Asset index
  if (detail.assetIndex) {
    const indexPath = getAssetIndexPath(detail.assetIndex.id);
    if (!await isFileValid(indexPath, detail.assetIndex.sha1, detail.assetIndex.size)) {
      tasks.push({
        url: detail.assetIndex.url,
        dest: indexPath,
        sha1: detail.assetIndex.sha1,
        size: detail.assetIndex.size,
        name: `${detail.assetIndex.id}.json`,
      });
    }

    // Download asset index to get individual asset URLs
    if (fs.existsSync(indexPath)) {
      const assetIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      for (const [name, asset] of Object.entries(assetIndex.objects || {})) {
        const assetInfo = asset as any;
        const hash = assetInfo.hash as string;
        const prefix = hash.substring(0, 2);
        const assetPath = getAssetObjectPath(hash);
        if (!await isFileValid(assetPath, hash, assetInfo.size)) {
          tasks.push({
            url: `https://resources.download.minecraft.net/${prefix}/${hash}`,
            dest: assetPath,
            sha1: hash,
            size: assetInfo.size,
            name,
          });
        }
      }
    }
  }

  if (tasks.length === 0) {
    return { succeeded: 0, failed: 0, errors: [], skipped: 0 };
  }

  return await downloadWithProgress(tasks, 8, onProgress);
}

/**
 * Resolve a Maven-style library (Fabric/Quilt) to a download task.
 * These libraries have `name` (Maven coordinates) and `url` (repository URL) fields.
 */
function resolveMavenLibrary(lib: any): DownloadTask | null {
  const name = lib.name as string;
  if (!name) return null;

  const parts = name.split(':');
  if (parts.length < 3) return null;

  const group = parts[0];
  const artifact = parts[1];
  const version = parts[2];
  const relPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
  const destPath = getLibraryPath(relPath);
  const repoUrl = (lib.url as string) || 'https://maven.minecraftforge.net/';
  const downloadUrl = `${repoUrl}${relPath}`;

  return {
    url: downloadUrl,
    dest: destPath,
    name: `${artifact}-${version}.jar`,
  };
}
