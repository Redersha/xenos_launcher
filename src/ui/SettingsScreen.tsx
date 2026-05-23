import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { saveConfig } from '../store/config.js';
import { t } from '../i18n/index.js';
import { JdkDistribution } from '../types/java.js';

interface Props {
  state: AppState;
  onBack: () => void;
  onLanguageChange: () => void;
}

type ProcessPriority = 'high' | 'medium' | 'low';

interface SettingItem {
  key: string;
  label: string;
  type: 'toggle' | 'select' | 'number';
  options?: string[];
}

const DISTRIBUTIONS: JdkDistribution[] = ['azul', 'adoptium', 'microsoft', 'amazon'];
const PRIORITIES: ProcessPriority[] = ['high', 'medium', 'low'];
const LANGUAGES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
];

const SettingsScreen: React.FC<Props> = ({ state, onBack, onLanguageChange }) => {
  const [selected, setSelected] = useState(0);
  const lang = state.config.language || 'zh-CN';

  const settings: SettingItem[] = [
    { key: 'language', label: t('settings.language', lang), type: 'select', options: LANGUAGES.map(l => l.label) },
    { key: 'jvmMaxMemory', label: t('settings.jvmMaxMemory', lang), type: 'number' },
    { key: 'jvmMinMemory', label: t('settings.jvmMinMemory', lang), type: 'number' },
    { key: 'preferredJdkDistribution', label: t('settings.jdkDistribution', lang), type: 'select', options: DISTRIBUTIONS },
    { key: 'autoDownloadJdk', label: t('settings.autoDownloadJdk', lang), type: 'toggle' },
    { key: 'processPriority', label: t('settings.processPriority', lang), type: 'select', options: PRIORITIES },
    { key: 'autoRamAllocation', label: t('settings.autoRam', lang), type: 'toggle' },
    { key: 'checkUpdatesOnStart', label: t('settings.checkUpdatesOnStart', lang), type: 'toggle' },
  ];

  const cycleValue = (key: string, direction: number) => {
    const config = { ...state.config };

    switch (key) {
      case 'language': {
        const idx = LANGUAGES.findIndex(l => l.value === config.language);
        const next = (idx + direction + LANGUAGES.length) % LANGUAGES.length;
        config.language = LANGUAGES[next].value;
        break;
      }
      case 'jvmMaxMemory': {
        const step = 256;
        config.jvmMaxMemory = Math.max(512, (config.jvmMaxMemory || 2048) + step * direction);
        break;
      }
      case 'jvmMinMemory': {
        const step = 128;
        config.jvmMinMemory = Math.max(128, (config.jvmMinMemory || 512) + step * direction);
        break;
      }
      case 'preferredJdkDistribution': {
        const idx = DISTRIBUTIONS.indexOf(config.preferredJdkDistribution || 'azul');
        const next = (idx + direction + DISTRIBUTIONS.length) % DISTRIBUTIONS.length;
        config.preferredJdkDistribution = DISTRIBUTIONS[next];
        break;
      }
      case 'autoDownloadJdk': {
        config.autoDownloadJdk = !config.autoDownloadJdk;
        break;
      }
      case 'processPriority': {
        const idx = PRIORITIES.indexOf((config as any).processPriority || 'medium');
        const next = (idx + direction + PRIORITIES.length) % PRIORITIES.length;
        (config as any).processPriority = PRIORITIES[next];
        break;
      }
      case 'autoRamAllocation': {
        (config as any).autoRamAllocation = !(config as any).autoRamAllocation;
        break;
      }
      case 'checkUpdatesOnStart': {
        config.checkUpdatesOnStart = !config.checkUpdatesOnStart;
        break;
      }
    }

    saveConfig(config);
    state.config = config;
    onLanguageChange(); // trigger re-render with new config
  };

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) {
      setSelected(prev => (prev - 1 + settings.length) % settings.length);
    } else if (key.downArrow) {
      setSelected(prev => (prev + 1) % settings.length);
    } else if (key.return || key.leftArrow || input === ' ') {
      cycleValue(settings[selected].key, key.leftArrow ? -1 : 1);
    } else if (key.rightArrow) {
      cycleValue(settings[selected].key, 1);
    }
  });

  const getDisplayValue = (item: SettingItem, idx: number): string => {
    const config = state.config;
    switch (item.key) {
      case 'language': {
        const l = LANGUAGES.find(l => l.value === config.language);
        return l?.label || config.language;
      }
      case 'jvmMaxMemory': return `${config.jvmMaxMemory}MB`;
      case 'jvmMinMemory': return `${config.jvmMinMemory}MB`;
      case 'preferredJdkDistribution': return config.preferredJdkDistribution || 'azul';
      case 'autoDownloadJdk': return config.autoDownloadJdk ? t('settings.on', lang) : t('settings.off', lang);
      case 'processPriority': {
        const p = (config as any).processPriority || 'medium';
        return t(`settings.${p}`, lang);
      }
      case 'autoRamAllocation': {
        const v = (config as any).autoRamAllocation || false;
        return v ? t('settings.on', lang) : t('settings.off', lang);
      }
      case 'checkUpdatesOnStart': {
        return config.checkUpdatesOnStart ? t('settings.on', lang) : t('settings.off', lang);
      }
      default: return '';
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('settings.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginTop={1} flexDirection="column">
        {settings.map((item, idx) => (
          <Box key={item.key} marginBottom={1}>
            <Text color={idx === selected ? 'cyan' : 'gray'}>
              {idx === selected ? '❯ ' : '  '}
            </Text>
            <Text color={idx === selected ? 'white' : 'gray'} bold={idx === selected}>
              {item.label}: {' '}
            </Text>
            <Text color="green">{getDisplayValue(item, idx)}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{t('settings.actions', lang)}</Text>
      </Box>
    </Box>
  );
};

export default SettingsScreen;
