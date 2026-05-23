import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { exec } from 'child_process';
import { AppState } from './App.js';
import { searchMods } from '../resources/modrinth.js';
import { getFavorites } from '../store/favorites.js';
import { detectJavaInstallations } from '../java/detector.js';
import { JavaInstallation } from '../types/java.js';
import { deleteInstance } from '../core/instance.js';
import { deleteManagedJdk } from '../java/detector.js';
import { saveAccounts } from '../store/config.js';

interface Props {
  state: AppState;
  onBack: () => void;
  onLaunch: (instanceId: string, accountId: string) => void;
  onSetCurrentInstance: (instanceId: string) => void;
  onRefresh: () => void;
}

type ResultType = 'instance' | 'account' | 'jdk' | 'mod' | 'favorite';

interface SearchResultItem {
  type: ResultType;
  id: string;
  name: string;
  description: string;
  data: any;
}

type SearchMode = 'input' | 'browse';

const GlobalSearch: React.FC<Props> = ({ state, onBack, onLaunch, onSetCurrentInstance, onRefresh }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jdkInstallations, setJdkInstallations] = useState<JavaInstallation[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [mode, setMode] = useState<SearchMode>('input');

  const lang = state.config.language || 'zh-CN';

  // Load JDK installations on mount
  useEffect(() => {
    detectJavaInstallations().then(setJdkInstallations).catch(() => {});
  }, []);

  // Refresh JDK when re-entering this screen
  useEffect(() => {
    detectJavaInstallations().then(jdks => {
      if (jdks.length > 0) setJdkInstallations(jdks);
    }).catch(() => {});
  }, []);

  const performSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError('');
    const newResults: SearchResultItem[] = [];

    const termLower = q.toLowerCase();

    // Search ALL instances (no prefix needed)
    for (const inst of state.instances) {
      const loaderStr = inst.modLoader ? `${inst.modLoader.type} ${inst.loaderVersion || inst.modLoader.version}` : '';
      if (
        inst.name.toLowerCase().includes(termLower) ||
        inst.versionId.toLowerCase().includes(termLower) ||
        inst.id.toLowerCase().includes(termLower) ||
        loaderStr.toLowerCase().includes(termLower) ||
        inst.gameDir.toLowerCase().includes(termLower)
      ) {
        newResults.push({
          type: 'instance',
          id: inst.id,
          name: inst.name,
          description: `${inst.versionId}${inst.modLoader ? ` | ${inst.modLoader.type} ${inst.loaderVersion || inst.modLoader.version}` : ''}`,
          data: inst,
        });
      }
    }

    // Search ALL accounts
    for (const acc of state.accounts) {
      if (
        acc.username.toLowerCase().includes(termLower) ||
        acc.type.toLowerCase().includes(termLower) ||
        acc.id.toLowerCase().includes(termLower)
      ) {
        newResults.push({
          type: 'account',
          id: acc.id,
          name: acc.username,
          description: `[${acc.type}]`,
          data: acc,
        });
      }
    }

    // Search ALL JDK
    for (const jdk of jdkInstallations) {
      const jdkStr = `${jdk.version} ${jdk.distribution} ${jdk.path} ${jdk.isAutoInstalled ? 'managed' : ''}`.toLowerCase();
      if (jdkStr.includes(termLower)) {
        newResults.push({
          type: 'jdk',
          id: jdk.path,
          name: `JDK ${jdk.version} (${jdk.distribution})`,
          description: `${jdk.path} ${jdk.isAutoInstalled ? '[managed]' : ''}`,
          data: jdk,
        });
      }
    }

    // Search ALL favorites
    const allCollections = getFavorites();
    const seen = new Set<string>();
    for (const col of allCollections) {
      for (const fav of col.mods) {
        const key = `${fav.source}:${fav.projectId}`;
        if (seen.has(key)) continue;
        if (
          fav.title.toLowerCase().includes(termLower) ||
          fav.description?.toLowerCase().includes(termLower) ||
          fav.source.toLowerCase().includes(termLower) ||
          fav.projectId.toLowerCase().includes(termLower)
        ) {
          seen.add(key);
          newResults.push({
            type: 'favorite',
            id: fav.projectId,
            name: fav.title,
            description: `♥ ${fav.source}${fav.description ? ` - ${fav.description.substring(0, 100)}` : ''}`,
            data: fav,
          });
        }
      }
    }

    // Search Modrinth (async, append after local results)
    if (q.length >= 2) {
      try {
        const modResult = await searchMods(q, {
          sortBy: 'downloads',
          limit: 8,
        });
        for (const mod of modResult.hits) {
          newResults.push({
            type: 'mod',
            id: mod.project_id,
            name: mod.title,
            description: `${mod.downloads.toLocaleString()} downloads | ${mod.description.substring(0, 100)}`,
            data: mod,
          });
        }
      } catch (err: any) {
        if (!newResults.length && err.message) {
          setError(err.message);
        }
      }
    }

    setResults(newResults);
    setLoading(false);
  }, [query, state.instances, state.accounts, jdkInstallations]);

  const openFolder = (dir: string) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    exec(`${cmd} "${dir}"`);
    setStatusMsg(lang === 'zh-CN' ? '已打开文件夹' : 'Opened folder');
  };

  const handleResultAction = (result: SearchResultItem) => {
    switch (result.type) {
      case 'instance': {
        onSetCurrentInstance(result.id);
        onLaunch(result.id, state.config.lastPlayedAccountId || state.accounts[0]?.id || '');
        break;
      }
      case 'account': {
        onBack();
        break;
      }
      case 'jdk': {
        openFolder(result.id);
        break;
      }
      case 'mod':
      case 'favorite':
        break;
    }
  };

  const handleOpenFolder = (result: SearchResultItem) => {
    if (result.type === 'instance') {
      openFolder(result.data.gameDir);
    } else if (result.type === 'jdk') {
      openFolder(result.id);
    }
  };

  const handleDeleteItem = (result: SearchResultItem) => {
    if (result.type === 'instance') {
      deleteInstance(result.id);
      onRefresh();
      setResults(prev => prev.filter(r => r.id !== result.id));
      setStatusMsg(`${lang === 'zh-CN' ? '已删除实例' : 'Deleted instance'}: ${result.name}`);
    } else if (result.type === 'account') {
      const updated = state.accounts.filter(a => a.id !== result.id);
      saveAccounts(updated);
      onRefresh();
      setResults(prev => prev.filter(r => r.id !== result.id));
      setStatusMsg(`${lang === 'zh-CN' ? '已删除账户' : 'Deleted account'}: ${result.name}`);
    } else if (result.type === 'jdk' && result.data?.isAutoInstalled) {
      const deleted = deleteManagedJdk(result.id);
      if (deleted) {
        onRefresh();
        setResults(prev => prev.filter(r => r.id !== result.id));
        setStatusMsg(`${lang === 'zh-CN' ? '已删除JDK' : 'Deleted JDK'}: ${result.name}`);
      } else {
        setStatusMsg(lang === 'zh-CN' ? '删除失败' : 'Delete failed');
      }
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    // Tab toggles between input and browse modes
    if (key.tab) {
      if (mode === 'input' && query.trim()) {
        setMode('browse');
        setSelected(0);
        setStatusMsg('');
        performSearch();
      } else if (mode === 'browse') {
        setMode('input');
        setSelected(0);
        setStatusMsg('');
      }
      return;
    }

    // In browse mode: navigate results and act on them
    if (mode === 'browse') {
      if (key.upArrow) {
        setSelected(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelected(prev => Math.min(prev + 1, Math.max(results.length - 1, 0)));
        return;
      }

      if (key.return && results.length > 0) {
        const item = results[selected];
        if (item) handleResultAction(item);
        return;
      }

      if (input === 'x' && results.length > 0) {
        const item = results[selected];
        if (item) handleOpenFolder(item);
        return;
      }

      if (key.delete && results.length > 0) {
        const item = results[selected];
        if (item) handleDeleteItem(item);
        return;
      }

      // Allow any other key to switch back to input mode and start typing
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setMode('input');
        setQuery(prev => prev + input);
        setResults([]);
        setSelected(0);
      }
      return;
    }

    // In input mode: edit query
    if (mode === 'input') {
      if (key.return) {
        if (query.trim()) {
          setMode('browse');
          setSelected(0);
          performSearch();
        }
        return;
      }

      if (key.upArrow || key.downArrow) {
        // If there are cached results, allow entering browse via arrows
        if (results.length > 0) {
          setMode('browse');
          setSelected(key.upArrow ? Math.max(results.length - 1, 0) : 0);
        }
        return;
      }

      if ((key.delete || key.backspace) && !query) {
        onBack();
        return;
      }

      if (key.backspace || key.delete) {
        setQuery(prev => prev.slice(0, -1));
        setStatusMsg('');
        setResults([]);
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setQuery(prev => prev + input);
        setStatusMsg('');
        setResults([]);
      }
    }
  });

  const getResultIcon = (type: ResultType): string => {
    switch (type) {
      case 'instance': return '🎮';
      case 'account': return '👤';
      case 'jdk': return '☕';
      case 'mod': return '📦';
      case 'favorite': return '♥';
    }
  };

  const getActionHint = (type: ResultType): string => {
    switch (type) {
      case 'instance': return lang === 'zh-CN' ? 'Enter 启动  x 打开文件夹  Del 删除' : 'Enter Launch  x Folder  Del Delete';
      case 'account': return lang === 'zh-CN' ? 'Enter 登录  Del 删除' : 'Enter Login  Del Delete';
      case 'jdk': return lang === 'zh-CN' ? 'Enter 打开  x 文件夹  Del 删除' : 'Enter Open  x Folder  Del Delete';
      case 'mod': return lang === 'zh-CN' ? 'Enter 下载到当前实例  x 收藏' : 'Enter Download  x Favorite';
      case 'favorite': return '♥ ' + (lang === 'zh-CN' ? '收藏的模组' : 'Fav Mod');
    }
  };

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
        <Text color="yellow" bold>🔍 {lang === 'zh-CN' ? '全局搜索' : 'Global Search'}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="white">🔎 </Text>
        <Text color="cyan">{query}<Text color="gray">▎</Text></Text>
        <Text color="gray">
          {mode === 'input'
            ? (lang === 'zh-CN' ? '  输入关键词后 Enter/Tab 搜索' : '  Enter/Tab to search')
            : (lang === 'zh-CN' ? '  Tab 回到编辑' : '  Tab back to edit')}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          {lang === 'zh-CN'
            ? '搜索: 实例 / 账户 / JDK / 收藏夹 / Modrinth模组  |  Esc 返回'
            : 'Search: Instances / Accounts / JDK / Favorites / Modrinth mods  |  Esc Back'}
        </Text>
      </Box>

      {loading ? (
        <Text color="gray">{lang === 'zh-CN' ? '搜索中...' : 'Searching...'}</Text>
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : mode === 'browse' && results.length === 0 ? (
        <Text color="yellow">{lang === 'zh-CN' ? '没有找到结果' : 'No results found'}</Text>
      ) : (
        <Box flexDirection="column">
          {results.map((item, idx) => {
            const isSelected = mode === 'browse' && idx === selected;
            return (
              <Box key={`${item.type}:${item.id}`} marginBottom={1} flexDirection="column">
                <Box>
                  <Text color={isSelected ? 'cyan' : 'gray'}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                  <Text color="gray">[</Text>
                  <Text color="green">{getResultIcon(item.type)}</Text>
                  <Text color="green"> {item.type === 'instance' ? (lang === 'zh-CN' ? '实例' : 'Instance') : item.type === 'account' ? (lang === 'zh-CN' ? '账户' : 'Account') : item.type === 'jdk' ? 'JDK' : item.type === 'mod' ? 'Mod' : lang === 'zh-CN' ? '收藏' : 'Fav'}</Text>
                  <Text color="gray">] </Text>
                  <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                    {item.name}
                  </Text>
                </Box>
                {isSelected && (
                  <Box marginLeft={4} flexDirection="column">
                    <Text color="gray">{item.description}</Text>
                    <Box marginTop={1}>
                      <Text color="yellow">{getActionHint(item.type)}</Text>
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {statusMsg && (
        <Box marginTop={1}>
          <Text color="green">{statusMsg}</Text>
        </Box>
      )}
    </Box>
  );
};

export default GlobalSearch;
