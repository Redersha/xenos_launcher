import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { GameInstance } from '../types/instance.js';
import { deleteInstance, listInstances, createInstance, importInstance, detectVersionsInDir } from '../core/instance.js';
import { getRecommendedJavaVersion } from '../java/versions.js';
import { t } from '../i18n/index.js';
import * as path from 'path';

interface Props {
  state: AppState;
  onBack: () => void;
  onLaunch: (instanceId: string, accountId: string) => void;
}

type SubScreen = 'list' | 'create' | 'detail' | 'select-account' | 'import' | 'import-select-version';

const InstanceManager: React.FC<Props> = ({ state, onBack, onLaunch }) => {
  const [selected, setSelected] = useState(0);
  const [instances, setInstances] = useState(state.instances);
  const [subScreen, setSubScreen] = useState<SubScreen>('list');
  const [createName, setCreateName] = useState('');
  const [createVersion, setCreateVersion] = useState('1.21.4');
  const [selectedAccountId, setSelectedAccountId] = useState(state.accounts[0]?.id || '');
  const [status, setStatus] = useState('');
  const [importPath, setImportPath] = useState('');
  const [importVersions, setImportVersions] = useState<string[]>([]);
  const [importSelectedVersion, setImportSelectedVersion] = useState(0);

  const lang = state.config.language || 'zh-CN';

  useInput((input, key) => {
    if (subScreen === 'list') {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelected(prev => (prev - 1 + instances.length) % Math.max(instances.length, 1));
      } else if (key.downArrow) {
        setSelected(prev => (prev + 1) % Math.max(instances.length, 1));
      } else if (key.return && instances.length > 0) {
        setSubScreen('select-account');
        setSelectedAccountId(state.accounts[0]?.id || '');
      } else if (input === 'n') {
        setSubScreen('create');
        setCreateName('');
      } else if (input === 'i') {
        setSubScreen('import');
        setImportPath('');
        setImportVersions([]);
        setStatus('');
      } else if (input === 'd' && instances.length > 0) {
        const inst = instances[selected];
        if (inst) {
          deleteInstance(inst.id);
          setInstances(listInstances());
          setSelected(0);
          setStatus(`${t('instances.deleted', lang)}: ${inst.name}`);
        }
      }
    } else if (subScreen === 'create') {
      if (key.escape) {
        setSubScreen('list');
        return;
      }
      if (key.return && createName.trim()) {
        try {
          const inst = createInstance({
            name: createName.trim(),
            versionId: createVersion,
          });
          setInstances(listInstances());
          setSubScreen('list');
          setStatus(`${t('instances.created', lang)}: ${inst.name}`);
        } catch (err: any) {
          setStatus(`Error: ${err.message}`);
        }
      } else if (key.backspace || key.delete) {
        setCreateName(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setCreateName(prev => prev + input);
      }
    } else if (subScreen === 'select-account') {
      if (key.escape) {
        setSubScreen('list');
        return;
      }
      if (key.upArrow || key.downArrow) {
        const idx = state.accounts.findIndex(a => a.id === selectedAccountId);
        const next = key.upArrow
          ? (idx - 1 + state.accounts.length) % state.accounts.length
          : (idx + 1) % state.accounts.length;
        setSelectedAccountId(state.accounts[next]?.id || '');
      } else if (key.return && selectedAccountId) {
        const inst = instances[selected];
        if (inst) {
          onLaunch(inst.id, selectedAccountId);
        }
      }
    } else if (subScreen === 'import') {
      if (key.escape) {
        setSubScreen('list');
        return;
      }
      if (key.return && importPath.trim()) {
        // Detect versions in the given directory
        const versions = detectVersionsInDir(importPath.trim());
        if (versions.length === 0) {
          setStatus(t('instances.importNoVersions', lang));
        } else {
          setImportVersions(versions);
          setImportSelectedVersion(0);
          setSubScreen('import-select-version');
          setStatus('');
        }
      } else if (key.backspace || key.delete) {
        setImportPath(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setImportPath(prev => prev + input);
      }
    } else if (subScreen === 'import-select-version') {
      if (key.escape) {
        setSubScreen('import');
        return;
      }
      if (key.upArrow) {
        setImportSelectedVersion(prev => (prev - 1 + importVersions.length) % importVersions.length);
      } else if (key.downArrow) {
        setImportSelectedVersion(prev => (prev + 1) % importVersions.length);
      } else if (key.return && importVersions.length > 0) {
        const versionId = importVersions[importSelectedVersion];
        const name = `${path ? versionId : 'Imported'}_${Date.now().toString(36)}`;
        const inst = importInstance({
          name: versionId,
          versionId,
          gameDir: importPath.trim(),
        });
        if (inst) {
          setInstances(listInstances());
          setSubScreen('list');
          setStatus(`${t('instances.imported', lang)}: ${inst.name}`);
        } else {
          setStatus(`Error: ${t('common.error', lang)}`);
        }
      }
    }
  });

  if (subScreen === 'create') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.new', lang)}</Text>
        <Box marginTop={1}>
          <Text color="white">{t('instances.name', lang)}: </Text>
          <Text color="green">{createName}<Text color="gray">▎</Text></Text>
        </Box>
        <Box>
          <Text color="white">{t('instances.version', lang)}: </Text>
          <Text color="yellow">{createVersion}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Press Enter to create, Esc to cancel</Text>
        </Box>
        {status && <Text color="red">{status}</Text>}
      </Box>
    );
  }

  if (subScreen === 'select-account') {
    const inst = instances[selected];
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.selectAccount', lang)}: {inst?.name}</Text>
        <Box marginTop={1} flexDirection="column">
          {state.accounts.length === 0 ? (
            <Text color="yellow">{t('instances.noAccount', lang)}</Text>
          ) : (
            state.accounts.map((acc, idx) => (
              <Box key={acc.id}>
                <Text color={acc.id === selectedAccountId ? 'cyan' : 'gray'}>
                  {acc.id === selectedAccountId ? '❯ ' : '  '}
                </Text>
                <Text color={acc.id === selectedAccountId ? 'white' : 'gray'}>
                  [{acc.type}] {acc.username}
                </Text>
              </Box>
            ))
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">↑↓ to select, Enter to launch, Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (subScreen === 'import') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.importTitle', lang)}</Text>
        <Box marginTop={1}>
          <Text color="white">Path: </Text>
          <Text color="green">{importPath}<Text color="gray">▎</Text></Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{t('instances.importPath', lang)} (e.g. ~/.minecraft)</Text>
        </Box>
        <Box>
          <Text color="gray">Press Enter to detect, Esc to cancel</Text>
        </Box>
        {status && <Text color="red">{status}</Text>}
      </Box>
    );
  }

  if (subScreen === 'import-select-version') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.importSelectVersion', lang)}</Text>
        <Box marginTop={1} flexDirection="column">
          {importVersions.map((ver, idx) => (
            <Box key={ver}>
              <Text color={idx === importSelectedVersion ? 'cyan' : 'gray'}>
                {idx === importSelectedVersion ? '❯ ' : '  '}
              </Text>
              <Text color={idx === importSelectedVersion ? 'white' : 'gray'}>{ver}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">↑↓ to select, Enter to import, Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('instances.title', lang)}</Text>
      <Box marginTop={1} flexDirection="column">
        {instances.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">{t('instances.empty', lang)}</Text>
            <Text color="gray">{t('instances.createHint', lang)}</Text>
          </Box>
        ) : (
          instances.map((inst, idx) => (
            <Box key={inst.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={idx === selected ? 'cyan' : 'gray'}>
                  {idx === selected ? '❯ ' : '  '}
                </Text>
                <Text
                  color={idx === selected ? 'white' : 'gray'}
                  bold={idx === selected}
                >
                  {inst.name}
                </Text>
              </Box>
              {idx === selected && (
                <Box marginLeft={4} flexDirection="column">
                  <Text color="gray">{t('instances.versionLabel', lang)}: <Text color="green">{inst.versionId}</Text></Text>
                  <Text color="gray">Java: <Text color="yellow">JDK {getRecommendedJavaVersion(inst.versionId)}</Text></Text>
                  <Text color="gray">{t('instances.dirLabel', lang)}: <Text color="blue">{inst.gameDir}</Text></Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{t('instances.actions', lang)}</Text>
      </Box>
      {status && <Text color="green">{status}</Text>}
    </Box>
  );
};

export default InstanceManager;
