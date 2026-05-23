import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { VersionEntry, VersionManifest } from '../types/minecraft.js';
import { getVersionManifest, getAvailableVersions, compareMcVersions } from '../core/version.js';
import { t } from '../i18n/index.js';

interface Props {
  state: AppState;
  onBack: () => void;
  onSelect: (versionId: string) => void;
  title?: string;
}

type VersionFilter = 'release' | 'snapshot' | 'all';

const VersionSelector: React.FC<Props> = ({ state, onBack, onSelect, title }) => {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<VersionFilter>('release');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const lang = state.config.language || 'zh-CN';

  useEffect(() => {
    loadVersions();
  }, [filter]);

  const loadVersions = async () => {
    setLoading(true);
    setError('');
    try {
      const type = filter === 'all' ? undefined : filter;
      const available = await getAvailableVersions({ type });
      setVersions(available);
      setSelected(0);
      setPage(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useInput((input, key) => {
    if (loading) return;
    if (key.escape) { onBack(); return; }
    if (key.upArrow) {
      setSelected(prev => (prev - 1 + visibleVersions.length) % visibleVersions.length);
    }
    if (key.downArrow) {
      setSelected(prev => (prev + 1) % visibleVersions.length);
    }
    if (key.leftArrow) {
      setPage(prev => Math.max(0, prev - 1));
      setSelected(0);
    }
    if (key.rightArrow) {
      const maxPage = Math.floor(versions.length / PAGE_SIZE);
      setPage(prev => Math.min(maxPage, prev + 1));
      setSelected(0);
    }
    if (key.return && visibleVersions.length > 0) {
      onSelect(visibleVersions[selected].id);
    }
    if (input === '1') { setFilter('release'); }
    if (input === '2') { setFilter('snapshot'); }
    if (input === '3') { setFilter('all'); }
  });

  const visibleVersions = versions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{title || t('versions.title', lang)}</Text>
        <Text color="yellow">{t('versions.loading', lang)}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{title || t('versions.title', lang)}</Text>
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Press Esc to go back</Text>
      </Box>
    );
  }

  const totalPages = Math.ceil(versions.length / PAGE_SIZE);

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{title || t('versions.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginBottom={1}>
        <Text color={filter === 'release' ? 'green' : 'gray'}>[1]Release </Text>
        <Text color={filter === 'snapshot' ? 'green' : 'gray'}>[2]Snapshot </Text>
        <Text color={filter === 'all' ? 'green' : 'gray'}>[3]All</Text>
      </Box>
      <Box flexDirection="column">
        {visibleVersions.map((v, idx) => (
          <Box key={v.id}>
            <Text color={idx === selected ? 'cyan' : 'gray'}>
              {idx === selected ? '❯ ' : '  '}
            </Text>
            <Text color={v.type === 'release' ? 'white' : 'yellow'}>
              {v.id}
            </Text>
            <Text color="gray"> ({v.type}) {new Date(v.releaseTime).toLocaleDateString()}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          {t('versions.page', lang)} {page + 1}/{totalPages} | {t('versions.navigate', lang)}
        </Text>
      </Box>
    </Box>
  );
};

export default VersionSelector;
