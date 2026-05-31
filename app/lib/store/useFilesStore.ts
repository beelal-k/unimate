import { create } from 'zustand';
import { db } from '../db/client';
import { enqueueSync } from '../db/sync';
import { fileNodes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export interface FileNode {
  id: string;
  parentId: string | null;
  type: 'folder' | 'file';
  name: string;
  mimeType: string | null;
  localUri: string | null;
  sizeBytes: number | null;
  geminiFileUri: string | null;
  geminiExpiry: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToNode(row: typeof fileNodes.$inferSelect): FileNode {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    type: row.type as 'folder' | 'file',
    mimeType: row.mimeType,
    localUri: row.localUri,
    sizeBytes: row.sizeBytes,
    geminiFileUri: row.geminiFileUri,
    geminiExpiry: row.geminiExpiry,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface FilesState {
  nodes: FileNode[];
  currentFolderId: string | null;
  isLoading: boolean;
  selectedIds: Set<string>;
  isSelecting: boolean;

  setLoading: (loading: boolean) => void;
  setCurrentFolder: (folderId: string | null) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setSelecting: (selecting: boolean) => void;
  loadNodes: () => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<FileNode>;
  uploadFile: (uri: string, name: string, mimeType: string, size: number, parentId: string | null) => Promise<FileNode>;
  renameNode: (id: string, newName: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  deleteMultiple: (ids: string[]) => Promise<void>;
  getCurrentChildren: () => FileNode[];
  getBreadcrumbs: () => FileNode[];
}

export const useFilesStore = create<FilesState>((set, get) => ({
  nodes: [],
  currentFolderId: null,
  isLoading: false,
  selectedIds: new Set<string>(),
  isSelecting: false,

  setLoading: (loading) => set({ isLoading: loading }),
  setCurrentFolder: (folderId) =>
    set({ currentFolderId: folderId, selectedIds: new Set(), isSelecting: false }),
  toggleSelection: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next, isSelecting: next.size > 0 });
  },
  clearSelection: () => set({ selectedIds: new Set(), isSelecting: false }),
  setSelecting: (selecting) =>
    set({ isSelecting: selecting, selectedIds: selecting ? get().selectedIds : new Set() }),

  loadNodes: async () => {
    try {
      set({ isLoading: true });
      const rows = await db.select().from(fileNodes);
      set({ nodes: rows.map(rowToNode), isLoading: false });
    } catch (err) {
      console.error('[Files] Failed to load nodes:', err);
      set({ isLoading: false, nodes: [] });
    }
  },

  createFolder: async (name, parentId) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const userId = (await SecureStore.getItemAsync('user_id')) || 'unknown';

    const payload = {
      id, userId, parentId, type: 'folder' as const, name,
      mimeType: null, localUri: null, sizeBytes: null,
      geminiFileUri: null, geminiExpiry: null,
      createdAt: now, updatedAt: now,
    };

    try {
      await db.insert(fileNodes).values(payload);
      const node: FileNode = { ...payload };
      set((state) => ({ nodes: [...state.nodes, node] }));
      await enqueueSync('insert', 'fileNodes', id, payload);
      return node;
    } catch (err) {
      console.error('[Files] Failed to create folder:', err);
      throw err;
    }
  },

  uploadFile: async (sourceUri, name, mimeType, size, parentId) => {
    const id = randomUUID();
    const now = new Date().toISOString();

    let destUri = sourceUri;
    try {
      const { File, Directory, Paths } =
        require('expo-file-system') as typeof import('expo-file-system');
      const targetDir = new Directory(Paths.document, 'unimate-files');
      if (!targetDir.exists) targetDir.create();

      const ext = name.split('.').pop() ?? '';
      const destFile = new File(targetDir, `${id}.${ext}`);
      new File(sourceUri).copy(destFile);
      destUri = destFile.uri;
    } catch (err) {
      console.warn('[Files] File copy failed, using source URI:', err);
    }

    try {
      const userId = (await SecureStore.getItemAsync('user_id')) || 'unknown';
      const payload = {
        id, userId, parentId, type: 'file' as const, name, mimeType,
        localUri: destUri, sizeBytes: size,
        geminiFileUri: null, geminiExpiry: null,
        createdAt: now, updatedAt: now,
      };

      await db.insert(fileNodes).values(payload);
      const node: FileNode = { ...payload };
      set((state) => ({ nodes: [...state.nodes, node] }));
      await enqueueSync('insert', 'fileNodes', id, payload);
      return node;
    } catch (err) {
      console.error('[Files] Failed to upload file:', err);
      throw err;
    }
  },

  renameNode: async (id, newName) => {
    const now = new Date().toISOString();
    try {
      await db.update(fileNodes).set({ name: newName, updatedAt: now }).where(eq(fileNodes.id, id));
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? { ...n, name: newName, updatedAt: now } : n)),
      }));
      await enqueueSync('update', 'fileNodes', id, { name: newName, updatedAt: now });
    } catch (err) {
      console.error('[Files] Failed to rename:', err);
      throw err;
    }
  },

  moveNode: async (id, newParentId) => {
    const now = new Date().toISOString();
    try {
      await db.update(fileNodes).set({ parentId: newParentId, updatedAt: now }).where(eq(fileNodes.id, id));
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === id ? { ...n, parentId: newParentId, updatedAt: now } : n)),
      }));
      await enqueueSync('update', 'fileNodes', id, { parentId: newParentId, updatedAt: now });
    } catch (err) {
      console.error('[Files] Failed to move:', err);
      throw err;
    }
  },

  deleteNode: async (id) => {
    try {
      const node = get().nodes.find((n) => n.id === id);

      if (node?.localUri) {
        try {
          const { File } = require('expo-file-system') as typeof import('expo-file-system');
          new File(node.localUri).delete();
        } catch {}
      }

      if (node?.type === 'folder') {
        const children = get().nodes.filter((n) => n.parentId === id);
        for (const child of children) {
          await get().deleteNode(child.id);
        }
      }

      await db.delete(fileNodes).where(eq(fileNodes.id, id));
      set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) }));
      await enqueueSync('delete', 'fileNodes', id, {});
    } catch (err) {
      console.error('[Files] Failed to delete:', err);
      throw err;
    }
  },

  deleteMultiple: async (ids) => {
    for (const id of ids) {
      await get().deleteNode(id);
    }
  },

  getCurrentChildren: () => {
    const { nodes, currentFolderId } = get();
    return nodes
      .filter((n) => n.parentId === currentFolderId)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  },

  getBreadcrumbs: () => {
    const { nodes } = get();
    const crumbs: FileNode[] = [];
    let current: string | null = get().currentFolderId;
    while (current) {
      const node = nodes.find((n) => n.id === current);
      if (!node) break;
      crumbs.unshift(node);
      current = node.parentId;
    }
    return crumbs;
  },
}));
