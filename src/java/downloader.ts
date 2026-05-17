import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import axios from 'axios';
import { JdkDownloadInfo, JdkDistribution } from '../types/java.js';
import { PATHS, getJavaInstallDir } from '../store/paths.js';
import { mkdirp } from 'mkdirp';

// JDK download API URLs
const JDK_APIS: Record<JdkDistribution, string> = {
  azul: 'https://api.azul.com/metadata/v1/zulu/packages',
  adoptium: 'https://api.adoptium.net/v3/assets/latest',
  oracle: 'https://download.oracle.com/java/',
  microsoft: 'https://api.github.com/repos/microsoft/build-of-openjdk/releases',
  amazon: 'https://api.github.com/repos/corretto/corretto-',
};

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export async function downloadJdk(
  version: number,
  distribution: JdkDistribution,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  const installDir = getJavaInstallDir(distribution, version);

  // Check if already installed
  const javaBin = os.platform() === 'win32'
    ? path.join(installDir, 'bin', 'java.exe')
    : path.join(installDir, 'bin', 'java');

  if (fs.existsSync(javaBin)) {
    return javaBin;
  }

  // Get download info
  const downloadInfo = await getJdkDownloadInfo(version, distribution);

  // Download
  const tmpDir = path.join(PATHS.cacheDir, 'jdk-downloads');
  await mkdirp(tmpDir);
  const tmpFile = path.join(tmpDir, downloadInfo.filename);

  if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size !== downloadInfo.size) {
    await downloadFile(downloadInfo.url, tmpFile, downloadInfo.size, onProgress);
  }

  // Extract
  await mkdirp(installDir);
  await extractArchive(tmpFile, installDir);

  // Verify
  if (!fs.existsSync(javaBin)) {
    throw new Error(`JDK installation failed: ${javaBin} not found after extraction`);
  }

  // Make executable on Unix
  if (os.platform() !== 'win32') {
    fs.chmodSync(javaBin, 0o755);
  }

  return javaBin;
}

async function getJdkDownloadInfo(
  version: number,
  distribution: JdkDistribution
): Promise<JdkDownloadInfo> {
  const arch = getArchForApi();
  const platform = getPlatformForApi();

  switch (distribution) {
    case 'azul':
      return getAzulJdkInfo(version, platform, arch);
    case 'adoptium':
      return getAdoptiumJdkInfo(version, platform, arch);
    case 'microsoft':
      return getMicrosoftJdkInfo(version, platform, arch);
    case 'amazon':
      return getAmazonJdkInfo(version, platform, arch);
    default:
      return getAzulJdkInfo(version, platform, arch);
  }
}

function getPlatformForApi(): string {
  switch (os.platform()) {
    case 'win32': return 'windows';
    case 'darwin': return 'macos';
    default: return 'linux';
  }
}

function getArchForApi(): string {
  switch (process.arch) {
    case 'x64': return 'x64';
    case 'arm64': return 'arm64';
    case 'ia32': return 'x86';
    default: return 'x64';
  }
}

async function getAzulJdkInfo(version: number, platform: string, arch: string): Promise<JdkDownloadInfo> {
  const archMap: Record<string, string> = { x64: 'x86_64', arm64: 'arm64', x86: 'i686' };
  const osMap: Record<string, string> = { windows: 'windows', macos: 'macos', linux: 'linux' };

  // Determine preferred archive type per platform
  let archiveType: string;
  if (platform === 'windows') {
    archiveType = 'zip';
  } else {
    archiveType = 'tar_gz';
  }

  const apiUrl = `${JDK_APIS.azul}?java_version=${version}&os=${osMap[platform]}&arch=${archMap[arch]}&archive_type=${archiveType}&java_package_type=jdk&latest=true`;

  const resp = await axios.get(apiUrl, { timeout: 15000 });
  const packages = resp.data;

  if (!packages || packages.length === 0) {
    throw new Error(`No Azul JDK ${version} found for ${platform}-${arch}`);
  }

  // API returns flat objects with download_url and name at top level
  const pkg = packages[0];
  const downloadUrl = pkg.download_url;
  if (!downloadUrl) {
    throw new Error('No download URL found in Azul response');
  }

  const filename = pkg.name || `azul-jdk${version}-${platform}-${arch}.${platform === 'windows' ? 'zip' : 'tar.gz'}`;

  return {
    url: downloadUrl,
    sha256: pkg.sha256_hash,
    size: pkg.size || 0,
    filename,
    distribution: 'azul',
    version,
    arch,
  };
}

async function getAdoptiumJdkInfo(version: number, platform: string, arch: string): Promise<JdkDownloadInfo> {
  const archMap: Record<string, string> = { x64: 'x64', arm64: 'aarch64', x86: 'x32' };
  const osMap: Record<string, string> = { windows: 'windows', macos: 'mac', linux: 'linux' };

  const imageType = 'jdk';
  const apiUrl = `${JDK_APIS.adoptium}/${version}/${imageType}/${osMap[platform]}/${archMap[arch]}/latest`;

  const resp = await axios.get(apiUrl, { timeout: 15000 });
  const assets = resp.data;

  if (!assets || assets.length === 0) {
    throw new Error(`No Adoptium JDK ${version} found for ${platform}-${arch}`);
  }

  const asset = assets[0];
  const binary = asset.binary;
  if (!binary) {
    throw new Error('No binary found in Adoptium response');
  }

  const pkg = binary.package;
  const installer = binary.installer;

  // Prefer installer on Windows/macOS, package on Linux
  const download = (platform !== 'linux' && installer) ? installer : pkg;

  return {
    url: download.link,
    sha256: download.checksum,
    size: download.size,
    filename: download.name || `adoptium-jdk${version}-${platform}-${arch}.${platform === 'windows' ? 'msi' : 'tar.gz'}`,
    distribution: 'adoptium',
    version,
    arch,
  };
}

async function getMicrosoftJdkInfo(version: number, platform: string, arch: string): Promise<JdkDownloadInfo> {
  // Microsoft only provides JDK 11, 17, and 21
  if (![11, 17, 21].includes(version)) {
    return getAdoptiumJdkInfo(version, platform, arch);
  }

  const apiUrl = `${JDK_APIS.microsoft}/latest/assets`;
  const resp = await axios.get(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    timeout: 15000,
  });

  const release = resp.data;
  const archStr = arch === 'arm64' ? 'aarch64' : 'x64';
  const osStr = platform === 'macos' ? 'macos' : platform;

  const asset = release.find((a: any) =>
    a.name.includes(`${version}`) && a.name.includes(archStr) && a.name.includes(osStr)
  );

  if (!asset) {
    return getAdoptiumJdkInfo(version, platform, arch);
  }

  return {
    url: asset.browser_download_url,
    size: asset.size,
    filename: asset.name,
    distribution: 'microsoft',
    version,
    arch,
  };
}

async function getAmazonJdkInfo(version: number, platform: string, arch: string): Promise<JdkDownloadInfo> {
  // Amazon Corretto - fall back to Adoptium for now
  return getAdoptiumJdkInfo(version, platform, arch);
}

async function downloadFile(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const resp = await axios.get(url, {
    responseType: 'stream',
    timeout: 0,
  });

  const total = parseInt(String(resp.headers['content-length'] || expectedSize));
  let downloaded = 0;

  const writer = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    resp.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (onProgress) {
        onProgress({
          downloaded,
          total,
          percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
        });
      }
    });

    resp.data.pipe(writer);

    writer.on('finish', resolve);
    writer.on('error', reject);
    resp.data.on('error', reject);
  });
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const platform = os.platform();

  if (platform === 'win32' && archivePath.endsWith('.zip')) {
    // Use PowerShell to extract zip on Windows
    child_process.execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`);
  } else if (platform === 'darwin' && archivePath.endsWith('.dmg')) {
    // Mount DMG, copy contents, unmount
    const mountPoint = path.join(PATHS.cacheDir, 'dmg_mount');
    if (!fs.existsSync(mountPoint)) fs.mkdirSync(mountPoint, { recursive: true });

    try {
      child_process.execSync(`hdiutil attach "${archivePath}" -mountpoint "${mountPoint}" -nobrowse`);
      const entries = fs.readdirSync(mountPoint);
      const pkg = entries.find(e => e.endsWith('.pkg') || e.endsWith('.app'));
      if (pkg) {
        throw new Error('DMG package extraction not supported, please use tar.gz distribution');
      }
      const jdkDir = entries.find(e => fs.statSync(path.join(mountPoint, e)).isDirectory() && e.includes('jdk'));
      if (jdkDir) {
        child_process.execSync(`cp -R "${path.join(mountPoint, jdkDir, 'Contents', 'Home')}" "${destDir}"`);
      }
    } finally {
      try { child_process.execSync(`hdiutil detach "${mountPoint}" -force`); } catch { /* ignore */ }
    }
  } else {
    // tar.gz extraction - extract to a temp location first, then move the inner directory contents
    const tmpExtract = path.join(PATHS.cacheDir, 'jdk-extract-tmp');
    if (fs.existsSync(tmpExtract)) {
      fs.rmSync(tmpExtract, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpExtract, { recursive: true });

    child_process.execSync(`tar -xzf "${archivePath}" -C "${tmpExtract}"`);

    // Find the top-level directory inside the archive (e.g., zulu21.50.19-ca-jdk21.0.11-macosx_aarch64/)
    const entries = fs.readdirSync(tmpExtract);
    const jdkRoot = entries.find(e => {
      const p = path.join(tmpExtract, e);
      return fs.statSync(p).isDirectory() && (
        fs.existsSync(path.join(p, 'bin', 'java')) ||
        fs.existsSync(path.join(p, 'bin', 'java.exe')) ||
        fs.existsSync(path.join(p, 'Contents', 'Home', 'bin', 'java'))
      );
    });

    if (jdkRoot) {
      const jdkPath = path.join(tmpExtract, jdkRoot);
      // macOS .jdk bundles have Contents/Home structure
      const homePath = path.join(jdkPath, 'Contents', 'Home');
      const srcPath = fs.existsSync(homePath) ? homePath : jdkPath;

      // Copy all contents to destDir
      const items = fs.readdirSync(srcPath);
      for (const item of items) {
        const src = path.join(srcPath, item);
        const dst = path.join(destDir, item);
        try {
          fs.renameSync(src, dst);
        } catch {
          // Fallback to copy if rename fails (cross-device)
          child_process.execSync(`cp -R "${src}" "${dst}"`);
        }
      }
    } else {
      // Fallback: just move everything
      const items = fs.readdirSync(tmpExtract);
      for (const item of items) {
        const src = path.join(tmpExtract, item);
        const dst = path.join(destDir, item);
        try {
          fs.renameSync(src, dst);
        } catch {
          child_process.execSync(`cp -R "${src}" "${dst}"`);
        }
      }
    }

    // Cleanup
    fs.rmSync(tmpExtract, { recursive: true, force: true });
  }
}
