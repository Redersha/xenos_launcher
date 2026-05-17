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
import { loadConfig, saveConfig, loadAccounts, loadInstances } from '../store/config.js';
import { AppConfig } from '../store/config.js';
import { AuthAccount } from '../types/auth.js';
import { GameInstance } from '../types/instance.js';

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
}

export const InputBlockContext = React.createContext(false);

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
  const lastSlashTime = useRef(0);

  useEffect(() => {
    ensureDirectories().then(() => setReady(true));
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
        <Text color="cyan" bold>Terminal Craft Launcher</Text>
        <Text color="gray">Initializing...</Text>
      </Box>
    );
  }

  const lang = state.config.language || 'zh-CN';

  const renderScreen = () => {
    if (commandLineActive) {
      return (
        <CommandLine
          language={lang}
          onExit={() => setCommandLineActive(false)}
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
            onBack={() => { refreshState(); setScreen('main'); }}
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
            onBack={() => setScreen('main')}
            onSelect={(versionId) => {
              refreshState();
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
        <Text color="cyan" bold> ⛏ Terminal Craft Launcher | 终端 Minecraft 启动器</Text>
        <Text color="gray"> v0.1 </Text>
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
