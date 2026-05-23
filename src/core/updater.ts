import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const GITHUB_REPO = 'Redersha/xenos_launcher';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export const CURRENT_VERSION = '0.3';

export interface UpdateInfo {
  version: string;
  htmlUrl: string;
  body: string;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const resp = await axios.get(GITHUB_API_URL, {
      timeout: 10000,
      headers: { 'User-Agent': 'xenos-launcher' },
    });
    const tag = resp.data.tag_name as string;
    if (!tag) return null;
    if (compareVersions(tag, CURRENT_VERSION) > 0) {
      return {
        version: tag.replace(/^v/, ''),
        htmlUrl: resp.data.html_url as string,
        body: (resp.data.body || '').split('\n')[0].trim().slice(0, 500),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    await execAsync(`${cmd} "${url}"`);
  } catch {
    // ignore
  }
}
