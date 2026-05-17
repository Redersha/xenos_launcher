import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
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
}

export async function downloadWithProgress(
  tasks: DownloadTask[],
  concurrency: number = 4,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ succeeded: number; failed: number; errors: Error[] }> {
  let succeeded = 0;
  let failed = 0;
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

      try {
        // Check if file already exists and matches
        if (fs.existsSync(task.dest)) {
          if (task.sha1) {
            const existingSha1 = await computeSha1(task.dest);
            if (existingSha1 === task.sha1) {
              completedTasks++;
              // Count existing file size as already downloaded
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
              continue; // Skip, already downloaded
            }
          } else if (task.size && fs.statSync(task.dest).size === task.size) {
            completedTasks++;
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
            continue; // Skip, size matches
          }
        }

        // Ensure parent directory exists
        await mkdirp(path.dirname(task.dest));

        // Download the file
        await downloadFile(task, currentIndex);

        // Verify SHA1 if provided
        if (task.sha1) {
          const actualSha1 = await computeSha1(task.dest);
          if (actualSha1 !== task.sha1) {
            fs.unlinkSync(task.dest);
            throw new Error(`SHA1 mismatch for ${task.name || task.dest}: expected ${task.sha1}, got ${actualSha1}`);
          }
        }

        completedTasks++;
        succeeded++;
      } catch (error) {
        failed++;
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async function downloadFile(task: DownloadTask, taskIdx: number): Promise<void> {
    const tmpPath = task.dest + '.downloading';
    let lastProgress = 0;
    let lastProgressTime = Date.now();

    try {
      const resp = await axios.get(task.url, {
        responseType: 'stream',
        timeout: 30000,
      });

      const total = parseInt(String(resp.headers['content-length'] || task.size || 0));
      let downloaded = 0;

      const writer = fs.createWriteStream(tmpPath);

      await new Promise<void>((resolve, reject) => {
        resp.data.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          downloadedBytesAll += chunk.length;

          if (onProgress) {
            const now = Date.now();
            const elapsed = (now - lastProgressTime) / 1000;
            const speed = elapsed > 0 ? (downloaded - lastProgress) / elapsed : 0;

            onProgress({
              taskId: taskIdx,
              totalTasks: tasks.length,
              fileName: task.name || path.basename(task.dest),
              bytesDownloaded: downloaded,
              totalBytes: total,
              percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
              speed,
              eta: speed > 0 ? Math.round((total - downloaded) / speed) : 0,
              completedTasks,
              totalBytesAll,
              downloadedBytesAll,
              overallPercentage: totalBytesAll > 0 ? Math.round((downloadedBytesAll / totalBytesAll) * 100) : Math.round((completedTasks / tasks.length) * 100),
            });

            lastProgress = downloaded;
            lastProgressTime = now;
          }
        });

        resp.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
        resp.data.on('error', reject);
      });

      // Move temp file to final destination
      if (fs.existsSync(task.dest)) {
        fs.unlinkSync(task.dest);
      }
      fs.renameSync(tmpPath, task.dest);
    } catch (error) {
      // Clean up temp file
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      throw error;
    }
  }

  // Run concurrent downloads
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => processTask());
  await Promise.all(workers);

  return { succeeded, failed, errors };
}

async function computeSha1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function downloadVersionFiles(
  versionId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const detail = await getVersionDetail(versionId);
  const tasks: DownloadTask[] = [];

  // Client jar
  if (detail.downloads?.client) {
    tasks.push({
      url: detail.downloads.client.url,
      dest: getVersionJarPath(versionId),
      sha1: detail.downloads.client.sha1,
      size: detail.downloads.client.size,
      name: `${versionId}.jar`,
    });
  }

  // Libraries
  for (const lib of detail.libraries) {
    if (lib.downloads?.artifact) {
      tasks.push({
        url: lib.downloads.artifact.url,
        dest: getLibraryPath(lib.downloads.artifact.path),
        sha1: lib.downloads.artifact.sha1,
        size: lib.downloads.artifact.size,
        name: lib.name,
      });
    }
    // Native classifiers (e.g. lwjgl-platform, jinput-platform)
    if (lib.downloads?.classifiers) {
      for (const [classifier, download] of Object.entries(lib.downloads.classifiers)) {
        const dl = download as { url: string; path: string; sha1: string; size: number };
        tasks.push({
          url: dl.url,
          dest: getLibraryPath(dl.path),
          sha1: dl.sha1,
          size: dl.size,
          name: `${lib.name} (${classifier})`,
        });
      }
    }
  }

  // Asset index
  if (detail.assetIndex) {
    tasks.push({
      url: detail.assetIndex.url,
      dest: getAssetIndexPath(detail.assetIndex.id),
      sha1: detail.assetIndex.sha1,
      size: detail.assetIndex.size,
      name: `${detail.assetIndex.id}.json`,
    });

    // Download asset index to get individual asset URLs
    const assetIndexPath = getAssetIndexPath(detail.assetIndex.id);
    if (fs.existsSync(assetIndexPath)) {
      const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
      for (const [name, asset] of Object.entries(assetIndex.objects || {})) {
        const assetInfo = asset as any;
        const hash = assetInfo.hash as string;
        const prefix = hash.substring(0, 2);
        tasks.push({
          url: `https://resources.download.minecraft.net/${prefix}/${hash}`,
          dest: getAssetObjectPath(hash),
          sha1: hash,
          size: assetInfo.size,
          name,
        });
      }
    }
  }

  await downloadWithProgress(tasks, 8, onProgress);
}
