import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from './paths.js';

export interface FavoriteCollection {
  id: number;
  name: string;
  mods: FavoriteMod[];
}

export interface FavoriteMod {
  projectId: string;
  source: 'modrinth' | 'curseforge';
  title: string;
  description?: string;
  iconUrl?: string;
  addedAt: number;
}

interface FavoritesData {
  collections: FavoriteCollection[];
}

const FAVORITES_FILE = 'favorites.json';

function getFavoritesPath(): string {
  return path.join(PATHS.base, FAVORITES_FILE);
}

function loadFavorites(): FavoritesData {
  const filePath = getFavoritesPath();
  if (!fs.existsSync(filePath)) {
    return { collections: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { collections: [] };
  }
}

function saveFavorites(data: FavoritesData): void {
  const filePath = getFavoritesPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function getFavorites(): FavoriteCollection[] {
  return loadFavorites().collections;
}

export function addModToCollection(
  collectionId: number,
  mod: Omit<FavoriteMod, 'addedAt'>
): boolean {
  const data = loadFavorites();
  const collection = data.collections.find(c => c.id === collectionId);
  if (!collection) return false;

  // Check if already in collection
  if (collection.mods.find(m => m.projectId === mod.projectId && m.source === mod.source)) {
    return false;
  }

  collection.mods.push({ ...mod, addedAt: Date.now() });
  saveFavorites(data);
  return true;
}

export function removeModFromCollection(
  collectionId: number,
  projectId: string,
  source: 'modrinth' | 'curseforge'
): boolean {
  const data = loadFavorites();
  const collection = data.collections.find(c => c.id === collectionId);
  if (!collection) return false;

  const idx = collection.mods.findIndex(m => m.projectId === projectId && m.source === source);
  if (idx === -1) return false;

  collection.mods.splice(idx, 1);
  saveFavorites(data);
  return true;
}

export function createCollection(name: string, id: number): FavoriteCollection {
  const data = loadFavorites();
  const collection: FavoriteCollection = { id, name, mods: [] };
  data.collections.push(collection);
  saveFavorites(data);
  return collection;
}

export function deleteCollection(collectionId: number): boolean {
  const data = loadFavorites();
  const idx = data.collections.findIndex(c => c.id === collectionId);
  if (idx === -1) return false;

  data.collections.splice(idx, 1);
  saveFavorites(data);
  return true;
}

export function renameCollection(collectionId: number, newName: string): boolean {
  const data = loadFavorites();
  const collection = data.collections.find(c => c.id === collectionId);
  if (!collection) return false;

  collection.name = newName;
  saveFavorites(data);
  return true;
}

export function isModInAnyCollection(projectId: string, source: 'modrinth' | 'curseforge'): number[] {
  const data = loadFavorites();
  const collectionIds: number[] = [];
  for (const collection of data.collections) {
    if (collection.mods.find(m => m.projectId === projectId && m.source === source)) {
      collectionIds.push(collection.id);
    }
  }
  return collectionIds;
}
