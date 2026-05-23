import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { GameInstance } from '../types/instance.js';
import { deleteInstance, listInstances, createInstance, importInstance, detectVersionsInDir, installInstanceModLoader } from '../core/instance.js';
import { getRecommendedJavaVersion } from '../java/versions.js';
import { t } from '../i18n/index.js';
import { ModLoaderType, ModLoaderVersion, fetchLoaderVersions } from '../modloader/index.js';
import { MOD_LOADER_LABELS } from '../types/modloader.js';
import * as path from 'path';
import * as child_process from 'child_process';

interface Props {
  state: AppState;
  onBack: () => void;
  onLaunch: (instanceId: string, accountId: string) => void;
  onSetCurrentInstance: (instanceId: string) => void;
  pendingCreateVersion?: string;
  pendingCreateName?: string;
  onSelectVersion?: (draftName?: string) => void;
}

type SubScreen = 'list' | 'create' | 'detail' | 'select-account' | 'import' | 'import-select-version' | 'select-loader' | 'select-loader-version';

const LOADER_TYPES: { type: ModLoaderType; labelKey: string }[] = [
  { type: 'fabric', labelKey: 'modloader.fabric' },
  { type: 'forge', labelKey: 'modloader.forge' },
  { type: 'neoforge', labelKey: 'modloader.neoforge' },
  { type: 'quilt', labelKey: 'modloader.quilt' },
];

const InstanceManager: React.FC<Props> = ({ state, onBack, onLaunch, onSetCurrentInstance, pendingCreateVersion, pendingCreateName, onSelectVersion }) => {
  const [selected, setSelected] = useState(0);
  const [instances, setInstances] = useState(state.instances);
  const [subScreen, setSubScreen] = useState<SubScreen>(pendingCreateVersion ? 'create' : 'list');
  const [createName, setCreateName] = useState(pendingCreateName || '');
  const [createVersion, setCreateVersion] = useState(pendingCreateVersion || '1.21.4');
  const [selectedAccountId, setSelectedAccountId] = useState(state.accounts[0]?.id || '');
  const [status, setStatus] = useState('');
  const [importPath, setImportPath] = useState('');
  const [importVersions, setImportVersions] = useState<string[]>([]);
  const [importSelectedVersion, setImportSelectedVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Mod loader selection state
  const [selectedLoaderType, setSelectedLoaderType] = useState<ModLoaderType>('fabric');
  const [loaderVersions, setLoaderVersions] = useState<ModLoaderVersion[]>([]);
  const [selectedLoaderVersionIdx, setSelectedLoaderVersionIdx] = useState(0);
  const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
  const [creatingInstance, setCreatingInstance] = useState(false);

  const lang = state.config.language || 'zh-CN';

  // Load loader versions when entering select-loader screen
  useEffect(() => {
    if (subScreen === 'select-loader' || subScreen === 'select-loader-version') {
      loadLoaderVersions();
    }
  }, [subScreen, createVersion, selectedLoaderType]);

  const loadLoaderVersions = async () => {
    setLoadingLoaderVersions(true);
    try {
      const versions = await fetchLoaderVersions(selectedLoaderType, createVersion);
      // Filter only stable versions for Fabric/Quilt, then take latest 10
      let filtered = versions
        .filter(v => v.gameVersion === createVersion && v.stable);

      // If no stable versions (e.g. no releases yet for this game version), fall back to all
      if (filtered.length === 0) {
        filtered = versions.filter(v => v.gameVersion === createVersion);
      }

      // Take latest 10 (API usually returns newest last, so reverse + limit)
      filtered = filtered.slice(-10).reverse();

      setLoaderVersions(filtered);
      setSelectedLoaderVersionIdx(0);
    } catch (err) {
      setLoaderVersions([]);
    } finally {
      setLoadingLoaderVersions(false);
    }
  };

  useInput(async (input, key) => {
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
        // Set current instance and launch
        const inst = instances[selected];
        if (inst) {
          onSetCurrentInstance(inst.id);
          setSubScreen('select-account');
          setSelectedAccountId(state.accounts[0]?.id || '');
        }
      } else if (input === 'z') {
        // Create new instance with version selection
        if (onSelectVersion) {
          onSelectVersion();
        } else {
          setSubScreen('create');
          setCreateName('');
        }
      } else if (input === 'c') {
        // Import instance
        setSubScreen('import');
        setImportPath('');
        setImportVersions([]);
        setStatus('');
      } else if (input === 'x' && instances.length > 0) {
        // Open instance folder
        const inst = instances[selected];
        if (inst) {
          const dir = inst.gameDir;
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
          child_process.exec(`${cmd} "${dir}"`);
          setStatus(`${t('instances.openFolder', lang)}: ${dir}`);
        }
      } else if ((key.delete || key.backspace) && instances.length > 0 && !confirmDelete) {
        // Delete instance
        setConfirmDelete(true);
      } else if (confirmDelete && (input === 'y' || input === 'Y')) {
        const inst = instances[selected];
        if (inst) {
          deleteInstance(inst.id);
          setInstances(listInstances());
          setSelected(0);
          setStatus(`${t('instances.deleted', lang)}: ${inst.name}`);
        }
        setConfirmDelete(false);
      } else if (confirmDelete && (input === 'n' || input === 'N' || key.escape)) {
        setConfirmDelete(false);
      }
    } else if (subScreen === 'create') {
      if (key.escape) {
        setSubScreen('list');
        return;
      }
      if (key.tab) {
        setSubScreen('select-loader');
        return;
      }
      if (input === 'v' && !key.ctrl && !key.meta) {
        if (onSelectVersion) {
          onSelectVersion();
        }
        return;
      }
      if (key.return && createName.trim()) {
        // Create vanilla instance (no mod loader)
        setCreatingInstance(true);
        try {
          const inst = createInstance({
            name: createName.trim(),
            versionId: createVersion,
          });
          setInstances(listInstances());
          setSelected(0);
          setSubScreen('list');
          setStatus(`${t('instances.created', lang)}: ${inst.name} (${createVersion})`);
        } catch (err: any) {
          setStatus(`Error: ${err.message}`);
        } finally {
          setCreatingInstance(false);
        }
        return;
      } else if (key.backspace || key.delete) {
        setCreateName(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setCreateName(prev => prev + input);
      }
    } else if (subScreen === 'select-loader') {
      if (key.escape) {
        setSubScreen('create');
        return;
      }
      if (key.upArrow) {
        setSelectedLoaderType(prev => {
          const idx = LOADER_TYPES.findIndex(l => l.type === prev);
          return LOADER_TYPES[(idx - 1 + LOADER_TYPES.length) % LOADER_TYPES.length].type;
        });
      } else if (key.downArrow) {
        setSelectedLoaderType(prev => {
          const idx = LOADER_TYPES.findIndex(l => l.type === prev);
          return LOADER_TYPES[(idx + 1) % LOADER_TYPES.length].type;
        });
      } else if (key.return) {
        // Go to select loader version
        setSubScreen('select-loader-version');
        return;
      } else {
        // Number key shortcut
        const num = parseInt(input);
        if (num >= 1 && num <= LOADER_TYPES.length) {
          setSelectedLoaderType(LOADER_TYPES[num - 1].type);
          setSubScreen('select-loader-version');
        }
      }
    } else if (subScreen === 'select-loader-version') {
      if (key.escape) {
        setSubScreen('select-loader');
        return;
      }
      if (key.upArrow) {
        setSelectedLoaderVersionIdx(prev => (prev - 1 + loaderVersions.length) % Math.max(loaderVersions.length, 1));
      } else if (key.downArrow) {
        setSelectedLoaderVersionIdx(prev => (prev + 1) % Math.max(loaderVersions.length, 1));
      } else if (key.return && !loadingLoaderVersions && loaderVersions.length > 0) {
        // Create the instance with mod loader
        setCreatingInstance(true);
        try {
          const loaderVersion = loaderVersions[selectedLoaderVersionIdx];
          const inst = createInstance({
            name: createName.trim(),
            versionId: createVersion,
            modLoader: { type: selectedLoaderType, version: loaderVersion.version },
            loaderVersion: loaderVersion.version,
          });

          // Install mod loader and Fabric API (async)
          await installInstanceModLoader(inst.id, (msg) => setStatus(msg));

          setInstances(listInstances());
          setSelected(0);
          setSubScreen('list');
          setStatus(`${t('instances.created', lang)}: ${inst.name} (${MOD_LOADER_LABELS[selectedLoaderType]} ${loaderVersion.version})`);
        } catch (err: any) {
          setStatus(`Error: ${err.message}`);
          setSubScreen('create');
        } finally {
          setCreatingInstance(false);
        }
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
        const inst = importInstance({
          name: versionId,
          versionId,
          gameDir: importPath.trim(),
        });
        if (inst) {
          setInstances(listInstances());
          setSelected(0);
          setSubScreen('list');
          setStatus(`${t('instances.imported', lang)}: ${inst.name}`);
        } else {
          setStatus(`Error: ${t('common.error', lang)}`);
        }
      }
    }
  });

  // Create screen
  if (subScreen === 'create') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.new', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1}>
          <Text color="white">{t('instances.name', lang)}: </Text>
          <Text color="green">{createName}<Text color="gray">▎</Text></Text>
        </Box>
        <Box>
          <Text color="white">{t('instances.version', lang)}: </Text>
          <Text color="yellow">{createVersion}</Text>
          <Text color="gray"> [v]{t('instances.selectVersion', lang)}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Enter {t('instances.createVanilla', lang)}, [Tab] {t('modloader.selectLoader', lang)}, [v] {t('instances.selectVersion', lang)}, Esc {t('common.cancel', lang)}</Text>
        </Box>
        {status && <Text color="red">{status}</Text>}
      </Box>
    );
  }

  // Select mod loader type screen
  if (subScreen === 'select-loader') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('modloader.selectLoader', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1} flexDirection="column">
          {LOADER_TYPES.map((loader, idx) => (
            <Box key={loader.type}>
              <Text color={loader.type === selectedLoaderType ? 'cyan' : 'gray'}>
                {loader.type === selectedLoaderType ? '❯ ' : '  '}
              </Text>
              <Text color={loader.type === selectedLoaderType ? 'white' : 'gray'} bold={loader.type === selectedLoaderType}>
                [{idx + 1}] {t(loader.labelKey, lang)}
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

  // Select mod loader version screen
  if (subScreen === 'select-loader-version') {
    if (loadingLoaderVersions) {
      return (
        <Box flexDirection="column">
          <Text color="cyan" bold>{t('modloader.loadingVersions', lang)}</Text>
        </Box>
      );
    }

    if (creatingInstance) {
      return (
        <Box flexDirection="column">
          <Text color="cyan" bold>{t('modloader.creating', lang)}</Text>
        </Box>
      );
    }

    const currentLoader = loaderVersions[selectedLoaderVersionIdx];

    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>
          {MOD_LOADER_LABELS[selectedLoaderType]} - {createVersion}
        </Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1} flexDirection="column">
          {loaderVersions.length === 0 ? (
            <Text color="yellow">{t('modloader.noCompatibleVersions', lang)}</Text>
          ) : (
            loaderVersions.map((loader, idx) => (
              <Box key={loader.version}>
                <Text color={idx === selectedLoaderVersionIdx ? 'cyan' : 'gray'}>
                  {idx === selectedLoaderVersionIdx ? '❯ ' : '  '}
                </Text>
                <Text color={idx === selectedLoaderVersionIdx ? 'white' : 'gray'} bold={idx === selectedLoaderVersionIdx}>
                  {loader.version}
                </Text>
                {idx === 0 && (
                  <Text color="green"> {t('modloader.latest', lang)}</Text>
                )}
                {!loader.stable && (
                  <Text color="yellow"> {t('modloader.betaAlpha', lang)}</Text>
                )}
              </Box>
            ))
          )}
        </Box>
        {currentLoader && (
          <Box marginTop={1}>
            <Text color="gray">{t('modloader.selected', lang)} </Text>
            <Text color="green">{MOD_LOADER_LABELS[selectedLoaderType]} {currentLoader.version}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="gray">↑↓ {t('resources.select', lang)}, Enter {t('modloader.createInstance', lang)}, Esc {t('common.back', lang)}</Text>
        </Box>
      </Box>
    );
  }

  // Select account screen
  if (subScreen === 'select-account') {
    const inst = instances[selected];
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.selectAccount', lang)}: {inst?.name}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
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

  // Import screen
  if (subScreen === 'import') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.importTitle', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
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

  // Import select version screen
  if (subScreen === 'import-select-version') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('instances.importSelectVersion', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
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

  // List screen
  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('instances.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">[z] {t('instances.new', lang)}  [c] {t('instances.importTitle', lang)}  [x] {t('instances.openFolder', lang)}  [Del] {t('instances.delete', lang)}  [Enter] {t('instances.launch', lang)}  [Esc] {t('common.back', lang)}</Text>
      </Box>
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
                <Text color="gray"> — </Text>
                <Text color="green">{inst.versionId}</Text>
                {inst.modLoader && (
                  <>
                    <Text color="gray"> | </Text>
                    <Text color="magenta">{MOD_LOADER_LABELS[inst.modLoader.type]} {inst.loaderVersion || inst.modLoader.version}</Text>
                  </>
                )}
              </Box>
              {idx === selected && (
                <Box marginLeft={4} flexDirection="column">
                  <Text color="gray">{t('instances.dirLabel', lang)}: <Text color="blue">{inst.gameDir}</Text></Text>
                  <Text color="yellow">JDK {getRecommendedJavaVersion(inst.versionId)}</Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
      {confirmDelete && (
        <Text color="yellow">{t('instances.confirmDelete', lang)}</Text>
      )}
      {status && <Text color="green">{status}</Text>}
    </Box>
  );
};

export default InstanceManager;
