import { create } from 'zustand';
import { db } from '../db/client';
import { enqueueSync } from '../db/sync';
import { conversations, messages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  generateGeminiChat,
  buildSystemPrompt,
  getGeminiApiKey,
  generateChatTitle,
  type GeminiMessage,
  type GeminiPart,
} from '../api/gemini';
import { useFilesStore, type FileNode } from './useFilesStore';
import { useScheduleStore } from './useScheduleStore';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'model';
  content: string;
  attachedFileIds: string[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: (title: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (content: string, attachedFileIds?: string[]) => Promise<void>;
}

function buildFileTree(
  nodes: Pick<FileNode, 'id' | 'parentId' | 'type' | 'name'>[],
): string {
  function renderNode(parentId: string | null, indent: string): string {
    return nodes
      .filter((n) => n.parentId === parentId)
      .map((n) => {
        const prefix = n.type === 'folder' ? '📁' : '📄';
        const line = `${indent}${prefix} ${n.name}`;
        return n.type === 'folder' ? line + '\n' + renderNode(n.id, indent + '  ') : line;
      })
      .join('\n');
  }
  return renderNode(null, '') || 'No files';
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',

  loadConversations: async () => {
    try {
      set({ isLoading: true });
      const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
      set({
        conversations: rows.map((r) => ({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        isLoading: false,
      });
    } catch (err) {
      console.error('[Chat] Failed to load conversations:', err);
      set({ isLoading: false });
    }
  },

  loadMessages: async (conversationId) => {
    try {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      set({
        messages: rows.map((r) => ({
          id: r.id,
          conversationId: r.conversationId,
          role: r.role as 'user' | 'model',
          content: r.content,
          attachedFileIds: JSON.parse(r.attachedFileIds || '[]') as string[],
          createdAt: r.createdAt,
        })),
        currentConversationId: conversationId,
      });
    } catch (err) {
      console.error('[Chat] Failed to load messages:', err);
    }
  },

  createConversation: async (title) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conv: Conversation = { id, title, createdAt: now, updatedAt: now };
    const userId = (await SecureStore.getItemAsync('user_id')) || 'unknown';

    const payload = { id, userId, title, createdAt: now, updatedAt: now };
    await db.insert(conversations).values(payload);
    await enqueueSync('insert', 'conversations', id, payload);

    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConversationId: id,
      messages: [],
    }));
    return conv;
  },

  deleteConversation: async (id) => {
    try {
      await db.delete(messages).where(eq(messages.conversationId, id));
      await db.delete(conversations).where(eq(conversations.id, id));
      await enqueueSync('delete', 'conversations', id, {});
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
        messages: state.currentConversationId === id ? [] : state.messages,
      }));
    } catch (err) {
      console.error('[Chat] Failed to delete conversation:', err);
      throw err;
    }
  },

  renameConversation: async (id, title) => {
    try {
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
      await enqueueSync('update', 'conversations', id, { title });
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
    } catch (err) {
      console.error('[Chat] Failed to rename conversation:', err);
      throw err;
    }
  },

  setCurrentConversation: (id) => set({ currentConversationId: id }),

  sendMessage: async (content, attachedFileIds = []) => {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error('No Gemini API key set. Go to Settings to add one.');

    let { currentConversationId } = get();

    if (!currentConversationId) {
      const title = content.slice(0, 40) + (content.length > 40 ? '...' : '');
      const conv = await get().createConversation(title);
      currentConversationId = conv.id;
    }

    const userMsgId = randomUUID();
    const now = new Date().toISOString();
    const userId = (await SecureStore.getItemAsync('user_id')) ?? 'unknown';

    const userMsg: ChatMessage = {
      id: userMsgId,
      conversationId: currentConversationId,
      role: 'user',
      content,
      attachedFileIds,
      createdAt: now,
    };
    const userPayload = {
      id: userMsgId,
      userId,
      conversationId: currentConversationId,
      role: 'user' as const,
      content,
      attachedFileIds: JSON.stringify(attachedFileIds),
      createdAt: now,
    };

    await db.insert(messages).values(userPayload);
    await enqueueSync('insert', 'messages', userMsgId, userPayload);
    set((state) => ({ messages: [...state.messages, userMsg] }));

    // Build context from other stores
    const fileNodes = useFilesStore.getState().nodes;
    const fileTree = buildFileTree(fileNodes);
    const scheduleClasses = useScheduleStore.getState().classes;
    const { useLmsStore } = await import('./useLmsStore');
    const allAssignments = useLmsStore.getState().items.filter((i) => i.type === 'assignment');

    const systemPrompt = buildSystemPrompt(
      fileTree,
      scheduleClasses.map((c) => ({
        name: c.name,
        code: c.code,
        room: c.room,
        instructor: c.instructor,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
      })),
      allAssignments.map((a) => ({
        title: a.title,
        courseName: a.courseName,
        dueDate: a.dueDate,
        status: a.status,
        description: a.description,
      })),
    );

    const windowMsgs = [...get().messages].slice(-20);

    // Build inline file parts for explicitly attached files
    const contextParts: GeminiPart[] = [];
    const attachedNodes = fileNodes.filter(
      (n) => n.type === 'file' && n.localUri && attachedFileIds.includes(n.id),
    );

    for (const node of attachedNodes) {
      try {
        const { File: FSFile, Paths } =
          require('expo-file-system/next') as typeof import('expo-file-system/next');

        if (!Paths.info(node.localUri!).exists) {
          console.warn('[Chat] File not found:', node.localUri);
          continue;
        }

        const file = new FSFile(node.localUri!);
        const bytes = await file.bytes();
        const base64 = uint8ToBase64(bytes);

        if (base64.length > 0) {
          const mimeType =
            node.mimeType?.includes('heic') || node.mimeType?.includes('heif')
              ? 'image/jpeg'
              : node.mimeType!;
          contextParts.push({ inlineData: { mimeType, data: base64 } });
          contextParts.push({ text: `[File: ${node.name}]` });
        }
      } catch (err) {
        console.warn('[Chat] Failed to read file:', node.name, err);
      }
    }

    const geminiMessages: GeminiMessage[] = [];

    if (contextParts.length > 0) {
      geminiMessages.push({
        role: 'user',
        parts: [
          { text: 'Here are my files for reference. Analyze them when I ask about specific documents or images.' },
          ...contextParts,
        ],
      });
      geminiMessages.push({
        role: 'model',
        parts: [{ text: "I can see your files. I'll reference them when relevant." }],
      });
    }

    for (const m of windowMsgs) {
      geminiMessages.push({ role: m.role, parts: [{ text: m.content }] });
    }

    set({ isStreaming: true, streamingContent: '' });

    try {
      const fullResponse = await generateGeminiChat(apiKey, geminiMessages, systemPrompt);

      const aiMsgId = randomUUID();
      const aiNow = new Date().toISOString();
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        conversationId: currentConversationId,
        role: 'model',
        content: fullResponse,
        attachedFileIds: [],
        createdAt: aiNow,
      };
      const aiPayload = {
        id: aiMsgId,
        userId,
        conversationId: currentConversationId,
        role: 'model' as const,
        content: fullResponse,
        attachedFileIds: '[]',
        createdAt: aiNow,
      };

      await db.insert(messages).values(aiPayload);
      await enqueueSync('insert', 'messages', aiMsgId, aiPayload);
      await db.update(conversations).set({ updatedAt: aiNow }).where(eq(conversations.id, currentConversationId));
      await enqueueSync('update', 'conversations', currentConversationId, { updatedAt: aiNow });

      set((state) => ({
        messages: [...state.messages, aiMsg],
        isStreaming: false,
        streamingContent: '',
        conversations: state.conversations.map((c) =>
          c.id === currentConversationId ? { ...c, updatedAt: aiNow } : c,
        ),
      }));

      // Auto-rename after the 2nd user message if the title is still a truncated preview
      const userMsgCount = get().messages.filter((m) => m.role === 'user').length;
      const currentConv = get().conversations.find((c) => c.id === currentConversationId);
      const isDefaultTitle = currentConv?.title === 'New Chat' || currentConv?.title?.endsWith('...');

      if (userMsgCount >= 2 && isDefaultTitle) {
        try {
          const recentText = get()
            .messages.slice(-6)
            .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 100)}`)
            .join('\n');
          const newTitle = await generateChatTitle(apiKey, recentText);
          if (newTitle && newTitle !== 'Chat') {
            await get().renameConversation(currentConversationId, newTitle);
          }
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      set({ isStreaming: false, streamingContent: '' });
      throw err;
    }
  },
}));
