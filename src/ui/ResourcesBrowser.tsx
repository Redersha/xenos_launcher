import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { exec } from 'child_process';
import { AppState } from './App.js';
import { searchMods, getProjectVersions, downloadModFile, getProject, searchMods as searchModsApi, ModrinthProject, ModrinthVersion } from '../resources/modrinth.js';
import { translateText, isLikelyTargetLanguage } from '../resources/translator.js';
import { getMcmodInfoBySlug, McmodModInfo } from '../resources/mcmod.js';
import { MOD_LOADER_LABELS } from '../types/modloader.js';
import { t } from '../i18n/index.js';
import { addModToCollection, removeModFromCollection, isModInAnyCollection, getFavorites, createCollection, FavoriteCollection, FavoriteMod } from '../store/favorites.js';

interface Props {
  state: AppState;
  onBack: () => void;
  onSetCurrentInstance: (instanceId: string) => void;
  onInstanceCreated?: (instanceId: string) => void;
}

const ResourcesBrowser: React.FC<Props> = ({ state, onBack, onSetCurrentInstance }) => {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ModrinthProject[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
  const [projectVersions, setProjectVersions] = useState<ModrinthVersion[]>([]);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [inputMode, setInputMode] = useState(false);
  const [inputBuffer, setInputBuffer] = useState('');
  const [showExternalMenu, setShowExternalMenu] = useState(false);
  const [selectedExternalIdx, setSelectedExternalIdx] = useState(0);
  const [versionScrollRow, setVersionScrollRow] = useState(0);

  // 翻译和MC百科信息
  const [translatedDescription, setTranslatedDescription] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [mcmodInfo, setMcmodInfo] = useState<McmodModInfo | null>(null);
  const [loadingMcmod, setLoadingMcmod] = useState(false);

  // MC百科信息用于列表视图（异步加载每个模组的标签和中文名）
  const [listMcmodInfos, setListMcmodInfos] = useState<Map<string, McmodModInfo>>(new Map());
  const mcmodLoadRequested = useRef<Set<string>>(new Set());

  // 收藏夹
  const [collections, setCollections] = useState<FavoriteCollection[]>(getFavorites());
  const defaultCollection = collections.length > 0 ? collections[0] : null;

  // 收藏视图
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoriteMods, setFavoriteMods] = useState<FavoriteMod[]>([]);
  const [favoriteModsSelected, setFavoriteModsSelected] = useState(0);
  const [loadingFavoriteDetails, setLoadingFavoriteDetails] = useState(false);

  const PAGE_SIZE = 15;
  const VERSIONS_PER_ROW = 5;
  const MAX_VISIBLE_ROWS = 5;
  const lang = state.config.language || 'zh-CN';

  // 判断是否为非英文语言
  const isNonEnglish = lang !== 'en';

  const externalPlatforms = [
    { id: 'modrinth', label: 'Modrinth', url: (slug: string) => `https://modrinth.com/mod/${slug}` },
    { id: 'curseforge', label: 'CurseForge', url: () => 'https://www.curseforge.com/minecraft/mc-mods' },
    { id: 'mcmod', label: 'MCMod', url: () => 'https://www.mcmod.cn' },
  ];

  const instances = state.instances;
  const currentInstance = instances.find(i => i.id === selectedInstanceId);

  const performSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loader = currentInstance?.modLoader?.type;
      const result = await searchMods(searchQuery, {
        gameVersion: selectedInstanceId ? currentInstance?.versionId : undefined,
        modLoader: loader,
        sortBy: 'downloads',
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setSearchResults(result.hits);
      // Reset mcmod list infos
      setListMcmodInfos(new Map());
      mcmodLoadRequested.current.clear();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page, currentInstance, selectedInstanceId]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Async load MC百科 info for visible list items (after mods are loaded)
  useEffect(() => {
    if (searchResults.length === 0) return;
    const visibleProjects = searchResults.slice(0, PAGE_SIZE);
    for (const project of visibleProjects) {
      if (mcmodLoadRequested.current.has(project.project_id)) continue;
      mcmodLoadRequested.current.add(project.project_id);
      getMcmodInfoBySlug(project.slug).then(info => {
        // Only update if this is still the current search (check by project_id in searchResults)
        setListMcmodInfos(prev => {
          const next = new Map(prev);
          next.set(project.project_id, info);
          return next;
        });
      }).catch(() => {});
    }
  }, [searchResults, page]);

  const loadProjectDetails = async (project: ModrinthProject) => {
    setSelectedProject(project);
    setSelectedVersionIdx(0);
    setVersionScrollRow(0);
    setTranslatedDescription('');
    setMcmodInfo(null);
    setLoading(true);
    try {
      const gameVersion = currentInstance?.versionId;
      const loader = currentInstance?.modLoader?.type;
      const versions = await getProjectVersions(project.project_id, {
        gameVersions: gameVersion ? [gameVersion] : undefined,
        loaders: loader ? [loader] : undefined,
      });
      setProjectVersions(versions);

      // 仅非英文语言显示翻译
      if (isNonEnglish && !isLikelyTargetLanguage(project.description, lang)) {
        setIsTranslating(true);
        const targetLang = lang === 'zh-CN' ? 'zh' : lang;
        const result = await translateText(project.description, 'en', targetLang);
        setTranslatedDescription(result.translatedText);
        setIsTranslating(false);
      }

      // 加载MC百科信息
      setLoadingMcmod(true);
      const mcmod = await getMcmodInfoBySlug(project.slug);
      setMcmodInfo(mcmod);
      setLoadingMcmod(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsTranslating(false);
      setLoadingMcmod(false);
    }
  };

  const loadFavoriteProjectDetails = async (favMod: FavoriteMod) => {
    setShowFavorites(false);
    setLoadingFavoriteDetails(true);
    try {
      const project = await getProject(favMod.projectId);
      setSelectedProject(project);
      setSelectedVersionIdx(0);
      setVersionScrollRow(0);
      setTranslatedDescription('');
      setMcmodInfo(null);

      const gameVersion = currentInstance?.versionId;
      const loader = currentInstance?.modLoader?.type;
      const versions = await getProjectVersions(project.project_id, {
        gameVersions: gameVersion ? [gameVersion] : undefined,
        loaders: loader ? [loader] : undefined,
      });
      setProjectVersions(versions);

      if (isNonEnglish && !isLikelyTargetLanguage(project.description, lang)) {
        setIsTranslating(true);
        const targetLang = lang === 'zh-CN' ? 'zh' : lang;
        const result = await translateText(project.description, 'en', targetLang);
        setTranslatedDescription(result.translatedText);
        setIsTranslating(false);
      }

      setLoadingMcmod(true);
      const mcmod = await getMcmodInfoBySlug(project.slug);
      setMcmodInfo(mcmod);
      setLoadingMcmod(false);
    } catch (err: any) {
      setError(err.message);
      setShowFavorites(true);
    } finally {
      setLoadingFavoriteDetails(false);
      setIsTranslating(false);
      setLoadingMcmod(false);
    }
  };

  const downloadMod = async () => {
    if (!selectedProject || !currentInstance || projectVersions.length === 0) return;

    const version = projectVersions[selectedVersionIdx];
    const modsDir = `${currentInstance.gameDir}/mods`;

    setDownloading(true);
    setDownloadSuccess(false);
    try {
      await downloadModFile(version, modsDir);
      setError('');

      // Check and install Fabric API if needed
      if (currentInstance.modLoader?.type === 'fabric') {
        await checkAndInstallFabricApi(currentInstance, modsDir);
      }

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const checkAndInstallFabricApi = async (instance: AppState['instances'][0], modsDir: string) => {
    try {
      const result = await searchModsApi('fabric API', {
        gameVersion: instance.versionId,
        modLoader: 'fabric',
        sortBy: 'downloads',
        limit: 1,
      });

      if (result.hits.length > 0) {
        const fabricApi = result.hits[0];
        const versions = await getProjectVersions(fabricApi.project_id, {
          gameVersions: instance.versionId ? [instance.versionId] : undefined,
          loaders: ['fabric'],
        });

        if (versions.length > 0) {
          await downloadModFile(versions[0], modsDir);
        }
      }
    } catch {
      // Silently fail if Fabric API check fails
    }
  };

  const toggleFavorite = (project: ModrinthProject) => {
    let coll = collections.length > 0 ? collections[0] : null;
    if (!coll) {
      coll = createCollection(t('favorites.defaultName', lang), Date.now());
    }
    const collectionIds = isModInAnyCollection(project.project_id, 'modrinth');
    if (collectionIds.includes(coll.id)) {
      removeModFromCollection(coll.id, project.project_id, 'modrinth');
    } else {
      addModToCollection(coll.id, {
        projectId: project.project_id,
        source: 'modrinth' as const,
        title: project.title,
        description: project.description,
        iconUrl: project.icon_url || undefined,
      });
    }
    setCollections(getFavorites());
  };

  const isFavorited = (projectId: string): boolean => {
    const collectionIds = isModInAnyCollection(projectId, 'modrinth');
    return collectionIds.length > 0;
  };

  useInput((input, key) => {
    // Input mode for search
    if (inputMode) {
      if (key.escape) {
        setInputMode(false);
        setInputBuffer('');
      } else if (key.return) {
        setSearchQuery(inputBuffer);
        setInputMode(false);
        setInputBuffer('');
        setPage(0);
      } else if (key.backspace || key.delete) {
        setInputBuffer(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputBuffer(prev => prev + input);
      }
      return;
    }

    // Favorites sub-view navigation
    if (showFavorites) {
      if (key.escape) {
        setShowFavorites(false);
        return;
      }
      if (key.upArrow) {
        setFavoriteModsSelected(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setFavoriteModsSelected(prev => Math.min(prev + 1, favoriteMods.length - 1));
      }
      if (key.return && favoriteMods.length > 0) {
        const fav = favoriteMods[favoriteModsSelected];
        if (fav) {
          loadFavoriteProjectDetails(fav);
        }
      }
      return;
    }

    if (key.escape) {
      if (showExternalMenu) {
        setShowExternalMenu(false);
      } else if (selectedProject) {
        setSelectedProject(null);
        setProjectVersions([]);
      } else {
        onBack();
      }
      return;
    }

    // External link menu navigation
    if (showExternalMenu) {
      if (key.upArrow) {
        setSelectedExternalIdx(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setSelectedExternalIdx(prev => Math.min(prev + 1, externalPlatforms.length - 1));
      }
      if (key.leftArrow) {
        setSelectedExternalIdx(prev => Math.max(0, prev - VERSIONS_PER_ROW));
      }
      if (key.rightArrow) {
        setSelectedExternalIdx(prev => Math.min(prev + VERSIONS_PER_ROW, externalPlatforms.length - 1));
      }
      if (key.return) {
        const platform = externalPlatforms[selectedExternalIdx];
        if (platform && selectedProject) {
          const url = platform.url(selectedProject.slug);
          const isWindows = process.platform === 'win32';
          const isMac = process.platform === 'darwin';
          const cmd = isWindows ? `start "" "${url}"` : isMac ? `open "${url}"` : `xdg-open "${url}"`;
          exec(cmd, () => {});
        }
        setShowExternalMenu(false);
      }
      return;
    }

    // Project detail page - version navigation
    if (selectedProject && projectVersions.length > 0 && selectedInstanceId) {
      if (key.upArrow) {
        const newIdx = Math.max(0, selectedVersionIdx - VERSIONS_PER_ROW);
        setSelectedVersionIdx(newIdx);
        setVersionScrollRow(Math.floor(newIdx / VERSIONS_PER_ROW));
      }
      if (key.downArrow) {
        const newIdx = Math.min(projectVersions.length - 1, selectedVersionIdx + VERSIONS_PER_ROW);
        setSelectedVersionIdx(newIdx);
        setVersionScrollRow(Math.floor(newIdx / VERSIONS_PER_ROW));
      }
      if (key.leftArrow) {
        const newIdx = Math.max(0, selectedVersionIdx - 1);
        setSelectedVersionIdx(newIdx);
        setVersionScrollRow(Math.floor(newIdx / VERSIONS_PER_ROW));
      }
      if (key.rightArrow) {
        const newIdx = Math.min(projectVersions.length - 1, selectedVersionIdx + 1);
        setSelectedVersionIdx(newIdx);
        setVersionScrollRow(Math.floor(newIdx / VERSIONS_PER_ROW));
      }
      if (key.return && !loading) {
        downloadMod();
      }
      if (input === 'e') {
        setShowExternalMenu(true);
        setSelectedExternalIdx(0);
      }
      if (input === 'm' && !downloading) {
        setSelectedVersionIdx(0);
        setVersionScrollRow(0);
        downloadMod();
      }
      return;
    }

    // Instance selection (when no instance selected)
    if (!selectedInstanceId) {
      if (key.upArrow) {
        setSelected(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setSelected(prev => Math.min(prev + 1, instances.length - 1));
      }
      if (key.return && instances.length > 0) {
        const inst = instances[selected];
        setSelectedInstanceId(inst.id);
        onSetCurrentInstance(inst.id);
        setSelected(0);
      }
      return;
    }

    // Favorite toggle (in list view)
    if (input === 'x' && selectedInstanceId && searchResults.length > 0 && selected < searchResults.length) {
      const project = searchResults[selected];
      if (project) {
        toggleFavorite(project);
      }
      return;
    }

    // View all favorites
    if (input === 'v' && selectedInstanceId && !selectedProject) {
      const allCollections = getFavorites();
      const allMods: FavoriteMod[] = [];
      for (const col of allCollections) {
        allMods.push(...col.mods);
      }
      // Deduplicate by projectId
      const deduped: FavoriteMod[] = [];
      const seen = new Set<string>();
      for (const m of allMods) {
        const key = `${m.source}:${m.projectId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(m);
        }
      }
      setFavoriteMods(deduped);
      setFavoriteModsSelected(0);
      setShowFavorites(true);
      return;
    }

    // List navigation (instance selected, no project detail)
    if (key.upArrow) {
      setSelected(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelected(prev => Math.min(prev + 1, searchResults.length - 1));
    }
    if (key.leftArrow) {
      setPage(prev => Math.max(0, prev - 1));
    }
    if (key.rightArrow) {
      setPage(prev => prev + 1);
    }

    if (key.return && searchResults.length > 0 && selected < searchResults.length) {
      const project = searchResults[selected];
      if (project) {
        loadProjectDetails(project);
      }
    }

    if (input === '/' || input === 'z') {
      setInputMode(true);
      setInputBuffer('');
    }

    // Switch instance (change instance)
    if (input === 'c' && selectedInstanceId) {
      setSelectedInstanceId('');
      setSelected(0);
      setSelectedProject(null);
    }
  });

  const totalPages = Math.ceil(searchResults.length / PAGE_SIZE) || 1;
  const visibleResults = searchResults.slice(0, PAGE_SIZE);

  // Project detail page
  if (selectedProject) {
    // External link selection menu
    if (showExternalMenu) {
      return (
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
            <Text color="magenta" bold>{t('resources.selectPlatform', lang)}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="gray">[e] {t('resources.externalLinks', lang)}</Text>
          </Box>
          <Box flexDirection="column">
            {externalPlatforms.map((platform, idx) => (
              <Box key={platform.id} marginBottom={1}>
                <Text color={idx === selectedExternalIdx ? 'cyan' : 'gray'}>
                  {idx === selectedExternalIdx ? '❯ ' : '  '}
                </Text>
                <Text color={idx === selectedExternalIdx ? 'white' : 'gray'} bold={idx === selectedExternalIdx}>
                  [{idx + 1}] {platform.label}
                </Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color="gray">↑↓←→ {t('resources.navigate', lang)}, </Text>
            <Text color="green">[Enter] {t('resources.openLink', lang)}</Text>
            <Text color="gray">, Esc {t('common.back', lang)}</Text>
          </Box>
        </Box>
      );
    }

    // Group versions into rows
    const versionRows: ModrinthVersion[][] = [];
    for (let i = 0; i < projectVersions.length; i += VERSIONS_PER_ROW) {
      versionRows.push(projectVersions.slice(i, i + VERSIONS_PER_ROW));
    }

    // 动态标题格式：下载到实例
    const detailTitle = currentInstance
      ? `${t('resources.downloadTo', lang)}${selectedProject.title}${t('resources.instanceName', lang)}${currentInstance.name}${t('resources.instanceVersion', lang)}(${currentInstance.versionId})`
      : selectedProject.title;

    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
          <Text color="magenta" bold>{detailTitle}</Text>
        </Box>

        {/* 按键提示 */}
        <Box marginBottom={1} flexDirection="column">
          {selectedInstanceId && projectVersions.length > 0 ? (
            <Box marginBottom={1}>
              <Text color="gray">{lang === 'zh-CN' ? '↑↓←→ 选择版本  ' : '↑↓←→ Select  '}</Text>
              <Text color="green">[Enter] {t('resources.downloadSelected', lang)}</Text>
              <Text color="gray">  [M] {t('resources.downloadLatest', lang)}</Text>
            </Box>
          ) : (
            <Box marginBottom={1}>
              <Text color="gray">{lang === 'zh-CN' ? '↑↓ 导航  ' : '↑↓ Navigate  '}</Text>
              <Text color="green">[Enter] {t('resources.details', lang)}</Text>
            </Box>
          )}
          <Box>
            <Text color="gray">{lang === 'zh-CN' ? '[x] 收藏  [e] 外部链接  Esc 返回' : '[x] Favorite  [e] Links  Esc Back'}</Text>
          </Box>
        </Box>

        {/* 原始描述 */}
        <Box marginBottom={1}>
          <Text color="gray">{selectedProject.description}</Text>
        </Box>

        {/* 翻译后的描述 - 仅非英文语言显示 */}
        {isTranslating && (
          <Box marginBottom={1}>
            <Text color="cyan">{t('resources.translating', lang)}</Text>
          </Box>
        )}
        {translatedDescription && !isTranslating && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="green" bold>{t('resources.translatedDesc', lang)}:</Text>
            <Text color="white" wrap="wrap">{translatedDescription}</Text>
          </Box>
        )}

        {/* MC百科信息 */}
        {loadingMcmod && (
          <Box marginBottom={1}>
            <Text color="cyan">{t('resources.loadingMcmod', lang)}</Text>
          </Box>
        )}
        {mcmodInfo && mcmodInfo.found && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="yellow" bold>{t('resources.mcmodInfo', lang)}:</Text>
            {mcmodInfo.categories && mcmodInfo.categories.length > 0 && (
              <Box marginTop={1}>
                <Text color="gray">{t('resources.categories', lang)}: </Text>
                <Text color="cyan">{mcmodInfo.categories.join(', ')}</Text>
              </Box>
            )}
            {mcmodInfo.tags && mcmodInfo.tags.length > 0 && (
              <Box>
                <Text color="gray">{t('resources.tags', lang)}: </Text>
                <Text color="magenta">{mcmodInfo.tags.join(', ')}</Text>
              </Box>
            )}
            {mcmodInfo.introduction && (
              <Box marginTop={1} flexDirection="column">
                <Text color="gray">{t('resources.introduction', lang)}:</Text>
                <Text color="white" wrap="wrap">{mcmodInfo.introduction}</Text>
              </Box>
            )}
          </Box>
        )}

        <Box marginBottom={1}>
          <Text color="yellow">{selectedProject.downloads.toLocaleString()}</Text>
          <Text color="gray"> {t('resources.downloads', lang)}</Text>
          <Text color="gray"> | </Text>
          <Text color="cyan">[e] {t('resources.externalLinks', lang)}</Text>
        </Box>

        {/* 版本选择器 */}
        {selectedInstanceId && projectVersions.length > 0 && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="white">{t('resources.selectVersion', lang)}:</Text>
            <Box flexDirection="column" marginTop={1}>
              {versionRows.slice(versionScrollRow, versionScrollRow + MAX_VISIBLE_ROWS).map((row, rowIdx) => {
                const actualRowIdx = rowIdx + versionScrollRow;
                return (
                  <Box key={actualRowIdx} marginBottom={1}>
                    {row.map((v, colIdx) => {
                      const versionIdx = actualRowIdx * VERSIONS_PER_ROW + colIdx;
                      const isSelected = versionIdx === selectedVersionIdx;
                      return (
                        <Box key={v.id} marginRight={2}>
                          <Text color={isSelected ? 'cyan' : 'gray'} dimColor={!isSelected}>
                            {isSelected ? '❯ ' : '  '}
                          </Text>
                          <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
                            {v.name}
                          </Text>
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
            {projectVersions.length > VERSIONS_PER_ROW && (
              <Box marginTop={1}>
                <Text color="gray">
                  {t('resources.row', lang)} {versionScrollRow + 1}-{Math.min(versionScrollRow + MAX_VISIBLE_ROWS, versionRows.length)}/{versionRows.length} | {t('resources.version', lang)} {selectedVersionIdx + 1}/{projectVersions.length}
                </Text>
              </Box>
            )}
          </Box>
        )}

        {downloading && (
          <Box marginBottom={1}>
            <Text color="cyan">{t('resources.downloading', lang)}</Text>
          </Box>
        )}

        {downloadSuccess && !downloading && (
          <Box marginBottom={1}>
            <Text color="green" bold>✓ {t('resources.downloadComplete', lang)}</Text>
          </Box>
        )}

        {error && !downloading && (
          <Box marginBottom={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}

      </Box>
    );
  }

  // Favorites view
  if (showFavorites) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
          <Text color="magenta" bold>♥ {lang === 'zh-CN' ? '我的收藏' : 'My Favorites'}</Text>
          <Text color="gray"> ({favoriteMods.length} {lang === 'zh-CN' ? '个模组' : 'mods'})</Text>
        </Box>
        <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">{lang === 'zh-CN' ? '↑↓ 导航  Enter 查看详情  Esc 返回' : '↑↓ Navigate  Enter Details  Esc Back'}</Text>
        </Box>
        {loadingFavoriteDetails ? (
          <Text color="gray">{lang === 'zh-CN' ? '加载中...' : 'Loading...'}</Text>
        ) : favoriteMods.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">{lang === 'zh-CN' ? '还没有收藏任何模组' : 'No favorited mods yet'}</Text>
            <Text color="gray">{lang === 'zh-CN' ? '在搜索结果中按 [x] 收藏模组' : 'Press [x] in search results to favorite mods'}</Text>
          </Box>
        ) : (
          favoriteMods.map((fav, idx) => (
            <Box key={`${fav.source}:${fav.projectId}`} marginBottom={1} flexDirection="column">
              <Box>
                <Text color={idx === favoriteModsSelected ? 'cyan' : 'gray'}>
                  {idx === favoriteModsSelected ? '❯ ' : '  '}
                </Text>
                <Text color="red">♥ </Text>
                <Text color={idx === favoriteModsSelected ? 'white' : 'gray'} bold={idx === favoriteModsSelected}>
                  {fav.title}
                </Text>
                <Text color="gray"> [{fav.source}]</Text>
              </Box>
              {fav.description && (
                <Box marginLeft={4}>
                  <Text color="gray" dimColor>{fav.description}</Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
    );
  }

  // Instance selection (when no instance selected)
  if (!selectedInstanceId) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
          <Text color="magenta" bold>{t('resources.downloadToInstance', lang)}</Text>
        </Box>

        <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">↑↓ {t('resources.select', lang)}, Enter {t('resources.confirm', lang)}, Esc {t('common.back', lang)}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="white">{t('resources.selectTargetInstance', lang)}:</Text>
        </Box>

        {instances.length === 0 ? (
          <Text color="yellow">{t('resources.noInstances', lang)}</Text>
        ) : (
          instances.map((inst, idx) => (
            <Box key={inst.id} marginBottom={1}>
              <Text color={idx === selected ? 'cyan' : 'gray'}>
                {idx === selected ? '> ' : '  '}
              </Text>
              <Text color={idx === selected ? 'white' : 'gray'} bold={idx === selected}>
                {inst.name}
              </Text>
              <Text color="gray"> - {inst.versionId}</Text>
              {inst.modLoader && (
                <Text color="magenta"> ({MOD_LOADER_LABELS[inst.modLoader.type]})</Text>
              )}
            </Box>
          ))
        )}
      </Box>
    );
  }

  // Search list (instance selected)
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
        <Text color="magenta" bold>{t('resources.downloadingTo', lang)}: {currentInstance?.name}</Text>
        <Text color="gray"> ({currentInstance?.versionId} {currentInstance?.modLoader ? `- ${MOD_LOADER_LABELS[currentInstance.modLoader.type]}` : ''})</Text>
      </Box>

      <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          {lang === 'zh-CN'
            ? '↑↓ 选择  Enter 下载  ←→ 翻页  [z]/[/] 搜索  [x] 收藏  [v] 收藏夹  [c] 切换实例  Esc 返回'
            : '↑↓ Select  Enter Download  ←→ Page  [z]/[/] Search  [x] Fav  [v] Favs  [c] Inst  Esc Back'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="white">{t('resources.search', lang)}: </Text>
        <Text color="cyan">/{searchQuery || (inputMode ? inputBuffer + '▎' : t('resources.typeToSearch', lang))}</Text>
      </Box>

      {loading ? (
        <Text color="gray">{t('resources.loading', lang)}</Text>
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : (
        visibleResults.map((project, idx) => {
          const mcmod = listMcmodInfos.get(project.project_id);
          const favorited = isFavorited(project.project_id);
          return (
            <Box key={project.project_id} marginBottom={1} flexDirection="column">
              <Box>
                <Text color={idx === selected ? 'cyan' : 'gray'}>
                  {idx === selected ? '❯ ' : '  '}
                </Text>
                {favorited && (
                  <Text color="red">♥ </Text>
                )}
                {mcmod?.found && mcmod?.chineseName && (
                  <Text color="magenta">{mcmod.chineseName} </Text>
                )}
                <Text color={idx === selected ? 'white' : 'gray'} bold={idx === selected}>
                  {project.title}
                </Text>
                <Text color="gray"> | </Text>
                <Text color="yellow">{project.downloads.toLocaleString()}</Text>
                <Text color="gray"> {t('resources.downloads', lang)}</Text>
              </Box>
              {/* MC百科标签 */}
              {mcmod?.found && mcmod?.tags && mcmod.tags.length > 0 && (
                <Box marginLeft={2}>
                  <Text color="gray" dimColor>
                    {mcmod.tags.slice(0, 3).map((tag, i) => (
                      <Text key={i} color="cyan">[{tag}]{i < Math.min(mcmod.tags!.length, 3) - 1 ? ' ' : ''}</Text>
                    ))}
                  </Text>
                </Box>
              )}
              <Box marginLeft={2}>
                <Text color="gray" dimColor>{project.description}</Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
};

export default ResourcesBrowser;
