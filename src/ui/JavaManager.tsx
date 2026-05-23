import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { exec } from 'child_process';
import { AppState } from './App.js';
import { JavaInstallation } from '../types/java.js';
import { detectJavaInstallations, deleteManagedJdk } from '../java/detector.js';
import { downloadJdk } from '../java/downloader.js';
import { JDK_VERSION_MAPPINGS } from '../types/java.js';
import { PATHS } from '../store/paths.js';
import { t } from '../i18n/index.js';

interface Props {
  state: AppState;
  onBack: () => void;
}

const JavaManager: React.FC<Props> = ({ state, onBack }) => {
  const [installations, setInstallations] = useState<JavaInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [showMappings, setShowMappings] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectJdkVersion, setSelectJdkVersion] = useState(false);
  const [selectedJdkVersion, setSelectedJdkVersion] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<{ percentage: number; downloaded: number; total: number } | null>(null);

  const lang = state.config.language || 'zh-CN';

  const JDK_DOWNLOAD_VERSIONS = [8, 11, 17, 21, 24];

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  const progressBar = (pct: number, width: number = 20): string => {
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  useEffect(() => {
    detectJavaInstallations().then(results => {
      setInstallations(results);
      setLoading(false);
    });
  }, []);

  useInput(async (input, key) => {
    if (selectJdkVersion) {
      if (key.escape) { setSelectJdkVersion(false); return; }
      if (key.upArrow) setSelectedJdkVersion(prev => (prev - 1 + JDK_DOWNLOAD_VERSIONS.length) % JDK_DOWNLOAD_VERSIONS.length);
      if (key.downArrow) setSelectedJdkVersion(prev => (prev + 1) % JDK_DOWNLOAD_VERSIONS.length);
      if (key.return) {
        const version = JDK_DOWNLOAD_VERSIONS[selectedJdkVersion];
        setSelectJdkVersion(false);
        setLoading(true);
        setDownloadProgress(null);
        setStatus(`${t('java.downloading', lang)} JDK ${version}...`);
        try {
          await downloadJdk(version, 'azul', (progress) => {
            setDownloadProgress(progress);
            setStatus(`${t('java.downloading', lang)} JDK ${version}...`);
          });
          setStatus(`JDK ${version} ${t('java.downloaded', lang)}`);
          setDownloadProgress(null);
          detectJavaInstallations().then(results => {
            setInstallations(results);
            setLoading(false);
          });
        } catch (err: any) {
          setStatus(`Error: ${err.message}`);
          setDownloadProgress(null);
          setLoading(false);
        }
        return;
      }
      return;
    }
    if (key.escape) {
      if (confirmDelete) { setConfirmDelete(false); return; }
      onBack(); return;
    }
    if (key.upArrow) setSelected(prev => (prev - 1 + installations.length) % Math.max(installations.length, 1));
    if (key.downArrow) setSelected(prev => (prev + 1) % Math.max(installations.length, 1));
    if (input === 'v') setShowMappings(prev => !prev);
    if (input === 'x') {
      setLoading(true);
      setStatus('');
      detectJavaInstallations().then(results => {
        setInstallations(results);
        setLoading(false);
      });
    }
    if (input === 'c') {
      // Open Java folder
      const javaDir = PATHS.java;
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      exec(`${cmd} "${javaDir}"`);
      setStatus(`Opened: ${javaDir}`);
    }
    if (input === 'z') {
      // Download a JDK — let user select version
      setSelectJdkVersion(true);
      setSelectedJdkVersion(2); // default to JDK 21 (index 2)
    }
    if ((key.delete || key.backspace) && installations.length > 0 && !confirmDelete) {
      const inst = installations[selected];
      if (inst && inst.isAutoInstalled) {
        setConfirmDelete(true);
      } else {
        setStatus(t('java.deleteNotManaged', lang));
      }
    }
    if (confirmDelete && (input === 'y' || input === 'Y')) {
      const inst = installations[selected];
      if (inst) {
        const deleted = deleteManagedJdk(inst.path);
        if (deleted) {
          setStatus(`${t('java.deleted', lang)}: JDK ${inst.version} (${inst.distribution})`);
          setLoading(true);
          detectJavaInstallations().then(results => {
            setInstallations(results);
            setSelected(prev => Math.min(prev, Math.max(results.length - 1, 0)));
            setLoading(false);
          });
        } else {
          setStatus(t('java.deleteFailed', lang));
        }
      }
      setConfirmDelete(false);
    }
    if (confirmDelete && (input === 'n' || input === 'N')) {
      setConfirmDelete(false);
    }
  });

  if (selectJdkVersion) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('java.selectVersion', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1} flexDirection="column">
          {JDK_DOWNLOAD_VERSIONS.map((ver, idx) => (
            <Box key={ver}>
              <Text color={idx === selectedJdkVersion ? 'cyan' : 'gray'}>
                {idx === selectedJdkVersion ? '❯ ' : '  '}
              </Text>
              <Text color={idx === selectedJdkVersion ? 'white' : 'gray'} bold={idx === selectedJdkVersion}>
                JDK {ver}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">↑↓ {t('resources.select', lang)}, Enter {t('resources.confirm', lang)}, Esc {t('common.back', lang)}</Text>
        </Box>
      </Box>
    );
  }

  if (loading && downloadProgress) {
    // Downloading JDK with progress
    const bar = progressBar(downloadProgress.percentage);
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('java.title', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">{status}</Text>
          <Box marginTop={1}>
            <Text color="cyan">[{bar}]</Text>
            <Text color="white"> {downloadProgress.percentage}%</Text>
          </Box>
          <Box marginTop={0}>
            <Text color="gray">
              {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('java.title', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Text color="yellow">{t('java.scanning', lang)}</Text>
      </Box>
    );
  }

  if (showMappings) {
    return (
      <Box flexDirection="column">
      <Text color="cyan" bold>{t('java.versionMappings', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginTop={1} flexDirection="column">
          {JDK_VERSION_MAPPINGS.map((m, idx) => (
            <Box key={idx}>
              <Text color="white">MC {m.minMcVersion}-{m.maxMcVersion}: </Text>
              <Text color="yellow">Java {m.minJava}-{m.maxJava} </Text>
              <Text color="green">({t('java.recommended', lang)}: {m.recommendedJava})</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Press [v] to toggle mappings, [Esc] back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('java.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{t('java.actions', lang)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {installations.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">{t('java.notFound', lang)}</Text>
            <Text color="gray">{t('java.installHint', lang)}</Text>
          </Box>
        ) : (
          installations.map((inst, idx) => (
            <Box key={inst.path} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={idx === selected ? 'cyan' : 'gray'}>
                  {idx === selected ? '❯ ' : '  '}
                </Text>
                <Text color={idx === selected ? 'white' : 'gray'} bold={idx === selected}>
                  JDK {inst.version} ({inst.distribution})
                </Text>
                {inst.isAutoInstalled && <Text color="green"> [{t('java.managed', lang)}]</Text>}
              </Box>
              {idx === selected && (
                <Box marginLeft={4}>
                  <Text color="gray">Path: {inst.path}</Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
      {confirmDelete && (
        <Text color="yellow">{t('java.confirmDelete', lang)}</Text>
      )}
      {status && <Text color="green">{status}</Text>}
    </Box>
  );
};

export default JavaManager;
