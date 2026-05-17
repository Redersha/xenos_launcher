import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Screen, AppState } from './App.js';
import { t } from '../i18n/index.js';

interface Props {
  state: AppState;
  onNavigate: (screen: Screen) => void;
  onExit: () => void;
  onLaunchLast: (instanceId: string, accountId: string) => void;
}

const MainMenu: React.FC<Props> = ({ state, onNavigate, onExit, onLaunchLast }) => {
  const [selected, setSelected] = useState(0);
  const lang = state.config.language || 'zh-CN';

  const MENU_ITEMS = [
    { key: '1', screen: 'instances' as Screen, label: t('menu.instances', lang), desc: t('menu.instances.desc', lang) },
    { key: '2', screen: 'accounts' as Screen, label: t('menu.accounts', lang), desc: t('menu.accounts.desc', lang) },
    { key: '3', screen: 'versions' as Screen, label: t('menu.versions', lang), desc: t('menu.versions.desc', lang) },
    { key: '4', screen: 'java' as Screen, label: t('menu.java', lang), desc: t('menu.java.desc', lang) },
    { key: '5', screen: 'settings' as Screen, label: t('menu.settings', lang), desc: t('menu.settings.desc', lang) },
    { key: 'q', screen: null, label: t('menu.quit', lang), desc: t('menu.quit.desc', lang) },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected(prev => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
    } else if (key.downArrow) {
      setSelected(prev => (prev + 1) % MENU_ITEMS.length);
    } else if (key.return) {
      const item = MENU_ITEMS[selected];
      if (item.screen) {
        onNavigate(item.screen);
      } else {
        onExit();
      }
    } else if (input === 'q') {
      onExit();
    } else if (input === 'c') {
      onNavigate('settings');
    } else if (input === 'l') {
      // Launch last played game
      const lastInstanceId = state.config.lastPlayedInstanceId;
      const lastAccountId = state.config.lastPlayedAccountId;
      if (lastInstanceId && lastAccountId) {
        const instance = state.instances.find(i => i.id === lastInstanceId);
        if (instance) {
          onLaunchLast(lastInstanceId, lastAccountId);
        }
      }
    } else {
      const idx = MENU_ITEMS.findIndex(m => m.key === input);
      if (idx >= 0) {
        const item = MENU_ITEMS[idx];
        if (item.screen) {
          onNavigate(item.screen);
        } else {
          onExit();
        }
      }
    }
  });

  const canLaunchLast = state.config.lastPlayedInstanceId &&
    state.instances.find(i => i.id === state.config.lastPlayedInstanceId);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color="green">{t('menu.welcome', lang)}</Text>
      </Box>

      <Box flexDirection="column">
        {MENU_ITEMS.map((item, idx) => (
          <Box key={item.key} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={idx === selected ? 'cyan' : 'gray'}>
                {idx === selected ? '❯ ' : '  '}
              </Text>
              <Text
                color={idx === selected ? 'white' : 'gray'}
                bold={idx === selected}
              >
                [{item.key}] {item.label}
              </Text>
            </Box>
            {idx === selected && (
              <Box marginLeft={4}>
                <Text color="gray" italic>{item.desc}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="yellow">📊 </Text>
        <Text color="white">{t('menu.stats.instances', lang)}: </Text>
        <Text color="cyan">{state.instances.length} </Text>
        <Text color="white">{t('menu.stats.accounts', lang)}: </Text>
        <Text color="cyan">{state.accounts.length} </Text>
      </Box>

      {canLaunchLast && (
        <Box marginTop={1}>
          <Text color="green">{t('menu.lastLaunch', lang)}</Text>
        </Box>
      )}
    </Box>
  );
};

export default MainMenu;
