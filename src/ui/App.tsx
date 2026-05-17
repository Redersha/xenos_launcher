import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import MainMenu from './MainMenu.js';
import InstanceManager from './InstanceManager.js';
import AccountManager from './AccountManager.js';
import VersionSelector from './VersionSelector.js';
import JavaManager from './JavaManager.js';
import LaunchScreen from './LaunchScreen.js';
import SettingsScreen from './SettingsScreen.js';
import CommandLine from './CommandLine.js';
import { ensureDirectories } from '../store/paths.js';
import { processManager } from '../core/processManager.js';
import { loadConfig, saveConfig, loadAccounts, loadInstances } from '../store/config.js';
import { AppConfig } from '../store/config.js';
import { AuthAccount } from '../types/auth.js';
import { GameInstance } from '../types/instance.js';
import { checkForUpdate, openInBrowser, UpdateInfo, CURRENT_VERSION } from '../core/updater.js';
import { t } from '../i18n/index.js';

export type Screen =
  | 'main'
  | 'instances'
  | 'accounts'
  | 'versions'
  | 'java'
  | 'launch'
  | 'settings';

export interface AppState {
  config: AppConfig;
  accounts: AuthAccount[];
  instances: GameInstance[];
  selectedInstanceId?: string;
  selectedAccountId?: string;
  pendingCreateVersion?: string;
  pendingCreateName?: string;
}

export const InputBlockContext = React.createContext(false);

const UpdatePrompt: React.FC<{ updateInfo: UpdateInfo; onDismiss: () => void; onAccept: () => void }> = ({ onDismiss, onAccept }) => {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onAccept();
    } else if (input === 'n' || input === 'N') {
      onDismiss();
    }
  });
  return null;
};

const App: React.FC = () => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('main');
  const [state, setState] = useState<AppState>({
    config: loadConfig(),
    accounts: loadAccounts(),
    instances: loadInstances(),
  });
  const [ready, setReady] = useState(false);
  const [commandLineActive, setCommandLineActive] = useState(false);
  const [selectingVersionForCreate, setSelectingVersionForCreate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const lastSlashTime = useRef(0);

  useEffect(() => {
    ensureDirectories().then(() => {
      setReady(true);
      // Check for updates in background
      const config = loadConfig();
      if (config.checkUpdatesOnStart !== false) {
        checkForUpdate().then(info => {
          if (info) setUpdateInfo(info);
        });
      }
    });
  }, []);

  const refreshState = () => {
    setState({
      config: loadConfig(),
      accounts: loadAccounts(),
      instances: loadInstances(),
    });
  };

  // Global input handling for Ctrl+C and // command line toggle
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Detect double-slash for command line
    if (input === '/' && !key.ctrl && !key.meta) {
      const now = Date.now();
      if (now - lastSlashTime.current < 500) {
        setCommandLineActive(prev => !prev);
        lastSlashTime.current = 0;
        return;
      }
      lastSlashTime.current = now;
    }
  });

  if (!ready) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Xenos Launcher</Text>
        <Text color="gray">Initializing...</Text>
      </Box>
    );
  }

  const lang = state.config.language || 'zh-CN';

  // Update prompt screen
  if (updateInfo && !updateDismissed) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
          <Text color="cyan" bold> ⚡ Xenos Launcher | 终端 Minecraft 启动器</Text>
          <Text color="gray"> v{CURRENT_VERSION} </Text>
          <Text color="gray">by Redersha</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={0}>
          <Text color="yellow" bold>{t('update.available', lang)}</Text>
          <Text color="white">{t('update.newVersion', lang)}: v{updateInfo.version}</Text>
          <Text color="gray">{t('update.currentVersion', lang)}: v{CURRENT_VERSION}</Text>
          {updateInfo.body && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="gray">{t('update.changelog', lang)}:</Text>
              <Text color="white">{updateInfo.body.split('\n').slice(0, 8).join('\n')}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="green">{t('update.prompt', lang)}</Text>
          </Box>
        </Box>
        <UpdatePrompt
          updateInfo={updateInfo}
          onDismiss={() => setUpdateDismissed(true)}
          onAccept={() => {
            openInBrowser(updateInfo.htmlUrl);
            setUpdateDismissed(true);
          }}
        />
      </Box>
    );
  }

  const renderScreen = () => {
    if (commandLineActive) {
      return (
        <CommandLine
          language={lang}
          onExit={() => setCommandLineActive(false)}
          onLaunch={(instanceId, accountId) => {
            setCommandLineActive(false);
            const freshState = {
              config: loadConfig(),
              accounts: loadAccounts(),
              instances: loadInstances(),
              selectedInstanceId: instanceId,
              selectedAccountId: accountId,
            };
            setState(freshState);
            setScreen('launch');
          }}
          onQuit={(killAll?: boolean, killBesidesInstance?: string) => {
            if (killAll) {
              if (killBesidesInstance) {
                processManager.killAllBesidesInstance(killBesidesInstance);
              } else {
                processManager.killAll();
              }
            }
            exit();
          }}
        />
      );
    }

    switch (screen) {
      case 'main':
        return (
          <MainMenu
            state={state}
            onNavigate={setScreen}
            onExit={exit}
            onLaunchLast={(instanceId, accountId) => {
              const freshState = {
                config: loadConfig(),
                accounts: loadAccounts(),
                instances: loadInstances(),
                selectedInstanceId: instanceId,
                selectedAccountId: accountId,
              };
              setState(freshState);
              setScreen('launch');
            }}
          />
        );
      case 'instances':
        return (
          <InstanceManager
            state={state}
            onBack={() => { refreshState(); setState(prev => ({ ...prev, pendingCreateVersion: undefined, pendingCreateName: undefined })); setScreen('main'); }}
            onLaunch={(instanceId, accountId) => {
              const freshState = {
                config: loadConfig(),
                accounts: loadAccounts(),
                instances: loadInstances(),
                selectedInstanceId: instanceId,
                selectedAccountId: accountId,
              };
              setState(freshState);
              setScreen('launch');
            }}
            pendingCreateVersion={state.pendingCreateVersion}
            pendingCreateName={state.pendingCreateName}
            onSelectVersion={(draftName) => {
              setSelectingVersionForCreate(true);
              setState(prev => ({ ...prev, pendingCreateName: draftName }));
              setScreen('versions');
            }}
          />
        );
      case 'accounts':
        return (
          <AccountManager
            state={state}
            onBack={() => { refreshState(); setScreen('main'); }}
          />
        );
      case 'versions':
        return (
          <VersionSelector
            state={state}
            onBack={() => { setSelectingVersionForCreate(false); setScreen('main'); }}
            onSelect={(versionId) => {
              setState(prev => ({ ...prev, pendingCreateVersion: versionId }));
              setSelectingVersionForCreate(false);
              setScreen('instances');
            }}
          />
        );
      case 'java':
        return (
          <JavaManager
            state={state}
            onBack={() => { refreshState(); setScreen('main'); }}
          />
        );
      case 'launch':
        return (
          <LaunchScreen
            state={state}
            instanceId={state.selectedInstanceId || ''}
            accountId={state.selectedAccountId || ''}
            onBack={() => setScreen('main')}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            state={state}
            onBack={() => { refreshState(); setScreen('main'); }}
            onLanguageChange={refreshState}
          />
        );
      default:
        return <MainMenu state={state} onNavigate={setScreen} onExit={exit} onLaunchLast={() => {}} />;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text color="cyan" bold> ⚡ Xenos Launcher | 终端 Minecraft 启动器</Text>
        <Text color="gray"> v{CURRENT_VERSION} </Text>
        <Text color="gray">by Redersha</Text>
      </Box>
      {renderScreen()}
      {!commandLineActive && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>{lang === 'zh-CN' ? '按 // 进入命令行' : 'Press // for command line'}</Text>
        </Box>
      )}
    </Box>
  );
};

export default App;
