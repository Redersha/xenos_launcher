import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { JavaInstallation } from '../types/java.js';
import { detectJavaInstallations, deleteManagedJdk } from '../java/detector.js';
import { JDK_VERSION_MAPPINGS } from '../types/java.js';
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

  const lang = state.config.language || 'zh-CN';

  useEffect(() => {
    detectJavaInstallations().then(results => {
      setInstallations(results);
      setLoading(false);
    });
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      if (confirmDelete) { setConfirmDelete(false); return; }
      onBack(); return;
    }
    if (key.upArrow) setSelected(prev => (prev - 1 + installations.length) % Math.max(installations.length, 1));
    if (key.downArrow) setSelected(prev => (prev + 1) % Math.max(installations.length, 1));
    if (input === 'm') setShowMappings(prev => !prev);
    if (input === 'r') {
      setLoading(true);
      setStatus('');
      detectJavaInstallations().then(results => {
        setInstallations(results);
        setLoading(false);
      });
    }
    if (input === 'd' && installations.length > 0 && !confirmDelete) {
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
          <Text color="gray">Press [m] to toggle mappings, [Esc] back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('java.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
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
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{t('java.actions', lang)}</Text>
      </Box>
      {confirmDelete && (
        <Text color="yellow">{t('java.confirmDelete', lang)}</Text>
      )}
      {status && <Text color="green">{status}</Text>}
    </Box>
  );
};

export default JavaManager;
