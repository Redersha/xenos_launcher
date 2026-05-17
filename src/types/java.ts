export interface JavaInstallation {
  path: string;
  version: number;
  distribution: string;
  arch: string;
  isAutoInstalled?: boolean;
}

export interface JdkDownloadInfo {
  url: string;
  sha256?: string;
  size: number;
  filename: string;
  distribution: JdkDistribution;
  version: number;
  arch: string;
}

export type JdkDistribution = 'azul' | 'oracle' | 'adoptium' | 'microsoft' | 'amazon';

export interface JdkVersionMapping {
  minMcVersion: string;
  maxMcVersion: string;
  minJava: number;
  recommendedJava: number;
  maxJava: number;
}

export const JDK_VERSION_MAPPINGS: JdkVersionMapping[] = [
  { minMcVersion: '0.0', maxMcVersion: '1.11', minJava: 8, recommendedJava: 8, maxJava: 8 },
  { minMcVersion: '1.12', maxMcVersion: '1.16.5', minJava: 8, recommendedJava: 11, maxJava: 11 },
  { minMcVersion: '1.17', maxMcVersion: '1.20.4', minJava: 16, recommendedJava: 17, maxJava: 21 },
  { minMcVersion: '1.20.5', maxMcVersion: '1.21.4', minJava: 21, recommendedJava: 21, maxJava: 23 },
  { minMcVersion: '1.21.5', maxMcVersion: '--', minJava: 21, recommendedJava: 21, maxJava: 24 },
];
