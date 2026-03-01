// lib/store/useFilesStore.ts
// Files store wired to SQLite for file/folder CRUD

import { create } from 'zustand';
import { db } from '../db/client';
import { fileNodes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

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
  setCurrentFolder: (folderId) => set({ currentFolderId: folderId, selectedIds: new Set(), isSelecting: false }),
  toggleSelection: (id) => {
    const current = new Set(get().selectedIds);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    set({ selectedIds: current, isSelecting: current.size > 0 });
  },
  clearSelection: () => set({ selectedIds: new Set(), isSelecting: false }),
  setSelecting: (selecting) => set({ isSelecting: selecting, selectedIds: selecting ? get().selectedIds : new Set() }),

  loadNodes: async () => {
    try {
      set({ isLoading: true });
      const rows = await db.select().from(fileNodes);
      set({ nodes: rows.map(rowToNode), isLoading: false });
    } catch (error) {
      console.error('[Files] Failed to load nodes:', error);
      set({ isLoading: false, nodes: [] });
    }
  },

  createFolder: async (name, parentId) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const node: FileNode = {
      id, parentId, type: 'folder', name,
      mimeType: null, localUri: null, sizeBytes: null,
      geminiFileUri: null, geminiExpiry: null,
      createdAt: now, updatedAt: now,
    };

    try {
      await db.insert(fileNodes).values({
        id, parentId, type: 'folder', name,
        mimeType: null, localUri: null, sizeBytes: null,
        geminiFileUri: null, geminiExpiry: null,
        createdAt: now, updatedAt: now,
      });
      set((state) => ({ nodes: [...state.nodes, node] }));
      return node;
    } catch (error) {
      console.error('[Files] Failed to create folder:', error);
      throw error;
    }
  },

  uploadFile: async (sourceUri, name, mimeType, size, parentId) => {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Copy file to permanent document directory
    let destUri = sourceUri; // fallback to source if copy fails
    try {
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const ext = name.split('.').pop() || '';
      const destFile = new File(Paths.document, 'unimate-files', `${id}.${ext}`);
      const sourceFile = new File(sourceUri);
      sourceFile.copy(destFile);
      destUri = destFile.uri;
      console.log('[Files] Copied file to:', destUri);
    } catch (copyErr) {
      console.warn('[Files] File copy failed, using source URI:', copyErr);
    }

    const node: FileNode = {
      id, parentId, type: 'file', name, mimeType,
      localUri: destUri, sizeBytes: size,
      geminiFileUri: null, geminiExpiry: null,
      createdAt: now, updatedAt: now,
    };

    try {
      await db.insert(fileNodes).values({
        id, parentId, type: 'file', name, mimeType,
        localUri: destUri, sizeBytes: size,
        geminiFileUri: null, geminiExpiry: null,
        createdAt: now, updatedAt: now,
      });
      set((state) => ({ nodes: [...state.nodes, node] }));
      return node;
    } catch (error) {
      console.error('[Files] Failed to upload file:', error);
      throw error;
    }
  },

  renameNode: async (id, newName) => {
    const now = new Date().toISOString();
    try {
      await db.update(fileNodes).set({ name: newName, updatedAt: now }).where(eq(fileNodes.id, id));
      set((state) => ({
        nodes: state.nodes.map((n) => n.id === id ? { ...n, name: newName, updatedAt: now } : n),
      }));
    } catch (error) {
      console.error('[Files] Failed to rename:', error);
      throw error;
    }
  },

  moveNode: async (id, newParentId) => {
    const now = new Date().toISOString();
    try {
      await db.update(fileNodes).set({ parentId: newParentId, updatedAt: now }).where(eq(fileNodes.id, id));
      set((state) => ({
        nodes: state.nodes.map((n) => n.id === id ? { ...n, parentId: newParentId, updatedAt: now } : n),
      }));
    } catch (error) {
      console.error('[Files] Failed to move:', error);
      throw error;
    }
  },

  deleteNode: async (id) => {
    try {
      const node = get().nodes.find((n) => n.id === id);
      // Delete physical file if it exists
      if (node?.localUri) {
        try {
          const { File } = require('expo-file-system/next');
          const file = new File(node.localUri);
          file.delete();
        } catch {}
      }
      // Recursively delete children if folder
      if (node?.type === 'folder') {
        const children = get().nodes.filter((n) => n.parentId === id);
        for (const child of children) {
          await get().deleteNode(child.id);
        }
      }
      await db.delete(fileNodes).where(eq(fileNodes.id, id));
      set((state) => ({ nodes: state.nodes.filter((n) => n.id !== id) }));
    } catch (error) {
      console.error('[Files] Failed to delete:', error);
      throw error;
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
    const { nodes, currentFolderId } = get();
    const crumbs: FileNode[] = [];
    let current = currentFolderId;
    while (current) {
      const node = nodes.find((n) => n.id === current);
      if (node) {
        crumbs.unshift(node);
        current = node.parentId;
      } else {
        break;
      }
    }
    return crumbs;
  },
}));
