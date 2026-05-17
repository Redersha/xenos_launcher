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
  { minMcVersion: '1.12', maxMcVersion: '1.16.5', minJava: 8, recommendedJava: 8, maxJava: 11 },
  { minMcVersion: '1.17', maxMcVersion: '1.17', minJava: 16, recommendedJava: 16, maxJava: 17 },
  { minMcVersion: '1.17.1', maxMcVersion: '1.17.1', minJava: 17, recommendedJava: 17, maxJava: 21 },
  { minMcVersion: '1.18', maxMcVersion: '1.20.4', minJava: 17, recommendedJava: 17, maxJava: 21 },
  { minMcVersion: '1.20.5', maxMcVersion: '1.21.4', minJava: 21, recommendedJava: 21, maxJava: 23 },
  { minMcVersion: '1.21.5', maxMcVersion: '99.99', minJava: 21, recommendedJava: 21, maxJava: 24 },
];
