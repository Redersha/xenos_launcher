import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { GameInstance } from '../types/instance.js';
import { AuthAccount } from '../types/auth.js';
import { buildLaunchCommand, launchGame } from '../core/launcher.js';
import { getInstance, listInstances } from '../core/instance.js';
import { loadAccounts, loadConfig, saveConfig } from '../store/config.js';
import { findBestJava, detectJavaInstallations } from '../java/detector.js';
import { getRecommendedJavaVersion } from '../java/versions.js';
import { downloadJdk } from '../java/downloader.js';
import { downloadVersionFiles } from '../download/downloader.js';
import { t } from '../i18n/index.js';

interface Props {
  state: AppState;
  instanceId: string;
  accountId: string;
  onBack: () => void;
}

type LaunchPhase = 'preparing' | 'downloading-java' | 'downloading-game' | 'launching' | 'running' | 'error' | 'done';

const LaunchScreen: React.FC<Props> = ({ state, instanceId, accountId, onBack }) => {
  const [phase, setPhase] = useState<LaunchPhase>('preparing');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [gamePid, setGamePid] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const instance = state.instances.find(i => i.id === instanceId);
  const account = state.accounts.find(a => a.id === accountId);
  const lang = state.config.language || 'zh-CN';

  useEffect(() => {
    launchGameFn();
  }, []);

  const launchGameFn = async () => {
    try {
      if (!instance || !account) {
        setError('Invalid instance or account');
        setPhase('error');
        return;
      }

      // Save last played info to config
      const config = loadConfig();
      config.lastPlayedInstanceId = instance.id;
      config.lastPlayedAccountId = account.id;
      saveConfig(config);

      setPhase('preparing');
      setProgress(t('launch.checkingJava', lang));

      // Check Java
      const requiredJava = getRecommendedJavaVersion(instance.versionId);
      let javaInstall = await findBestJava(requiredJava);

      if (!javaInstall) {
        setPhase('downloading-java');
        setProgress(`${t('launch.downloadingJava', lang)} JDK ${requiredJava}...`);
        try {
          await downloadJdk(requiredJava, state.config.preferredJdkDistribution, (p) => {
            setProgress(`${t('launch.downloadingJava', lang)} JDK ${requiredJava}: ${p.percentage}%`);
          });
          // Re-detect after download
          javaInstall = await findBestJava(requiredJava);
          if (!javaInstall) {
            setError(`JDK ${requiredJava} was downloaded but could not be detected.`);
            setPhase('error');
            return;
          }
        } catch (downloadErr: any) {
          setError(`Failed to download JDK: ${downloadErr.message}`);
          setPhase('error');
          return;
        }
      }

      setPhase('downloading-game');
      setProgress(t('launch.checkingFiles', lang));

      // Download version files if needed
      try {
        await downloadVersionFiles(instance.versionId, (p: any) => {
          setProgress(`${t('launch.downloadingGame', lang)} ${p.fileName}: ${p.percentage}%`);
        });
      } catch (downloadErr: any) {
        setError(`Failed to download game files: ${downloadErr.message}`);
        setPhase('error');
        return;
      }

      setPhase('launching');
      setProgress(t('launch.buildingCommand', lang));

      const instanceConfig = {
        instanceId: instance.id,
        autoJava: true,
        jvmMaxMemory: state.config.jvmMaxMemory,
        jvmMinMemory: state.config.jvmMinMemory,
      };

      const result = await launchGame({
        versionId: instance.versionId,
        account,
        instanceConfig,
        gameDir: instance.gameDir,
        instanceName: instance.name,
        instanceId: instance.id,
        accountId: account.id,
        processPriority: state.config.processPriority || 'medium',
        autoRamAllocation: state.config.autoRamAllocation || false,
      });

      const child = result.child;
      const usedJavaPath = result.command[0];

      setPhase('running');
      setProgress(t('launch.gameLaunched', lang));

      let stderrOutput = '';
      child.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
        if (stderrOutput.length > 2000) {
          stderrOutput = stderrOutput.slice(-2000);
        }
      });

      if (child.pid) {
        setGamePid(child.pid);
      }

      child.on('exit', (code) => {
        setExitCode(code);
        if (code !== 0 && code !== null) {
          setError(`Game exited with code ${code}${stderrOutput ? '\n' + stderrOutput.slice(-500) : ''}`);
          setPhase('error');
        } else {
          setPhase('done');
          setProgress(`Game exited with code ${code}`);
        }
      });

      child.on('error', (err) => {
        setError(`Game error: ${err.message}`);
        setPhase('error');
      });

    } catch (err: any) {
      setError(err.message);
      setPhase('error');
    }
  };

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (phase === 'error' || phase === 'done') {
      if (key.return) { onBack(); }
    }
  });

  const getPhaseText = () => {
    switch (phase) {
      case 'preparing': return `⏳ ${t('launch.preparing', lang)}`;
      case 'downloading-java': return `📥 ${t('launch.downloadingJava', lang)}`;
      case 'downloading-game': return `📥 ${t('launch.downloadingGame', lang)}`;
      case 'launching': return `🚀 ${t('launch.launching', lang)}`;
      case 'running': return `🎮 ${t('launch.running', lang)}`;
      case 'done': return `❌ ${t('launch.exited', lang)}`;
      case 'error': return `❌ ${t('launch.error', lang)}`;
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('launch.title', lang)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="white">{t('launch.instance', lang)}: </Text>
          <Text color="green">{instance?.name || 'Unknown'}</Text>
        </Box>
        <Box>
          <Text color="white">{t('launch.version', lang)}: </Text>
          <Text color="yellow">{instance?.versionId || 'Unknown'}</Text>
        </Box>
        <Box>
          <Text color="white">{t('launch.account', lang)}: </Text>
          <Text color="cyan">{account?.username || 'Unknown'}</Text>
          <Text color="gray"> ({account?.type || 'N/A'})</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={phase === 'done' || phase === 'error' ? 'red' : 'green'} bold>{getPhaseText()}</Text>
      </Box>
      {progress && <Text color="gray">{progress}</Text>}
      {gamePid && <Text color="gray">PID: {gamePid}</Text>}
      {error && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>{t('launch.error', lang)}: {error}</Text>
          <Text color="gray">Press Enter to go back</Text>
        </Box>
      )}
      {(phase === 'done') && (
        <Box marginTop={1}>
          <Text color="gray">Press Enter to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default LaunchScreen;
