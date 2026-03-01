// lib/store/useChatStore.ts
// Chat store with SQLite persistence, non-streaming Gemini, auto-rename

import { create } from 'zustand';
import { db } from '../db/client';
import { conversations, messages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
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

function buildFileTree(nodes: { id: string; parentId: string | null; type: string; name: string }[]): string {
  function renderNode(parentId: string | null, indent: string): string {
    const children = nodes.filter((n) => n.parentId === parentId);
    return children
      .map((n) => {
        const prefix = n.type === 'folder' ? '📁' : '📄';
        const line = `${indent}${prefix} ${n.name}`;
        if (n.type === 'folder') {
          return line + '\n' + renderNode(n.id, indent + '  ');
        }
        return line;
      })
      .join('\n');
  }
  return renderNode(null, '') || 'No files';
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
    } catch (error) {
      console.error('[Chat] Failed to load conversations:', error);
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
          attachedFileIds: JSON.parse(r.attachedFileIds || '[]'),
          createdAt: r.createdAt,
        })),
        currentConversationId: conversationId,
      });
    } catch (error) {
      console.error('[Chat] Failed to load messages:', error);
    }
  },

  createConversation: async (title) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const conv: Conversation = { id, title, createdAt: now, updatedAt: now };

    await db.insert(conversations).values({ id, title, createdAt: now, updatedAt: now });
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
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversationId:
          state.currentConversationId === id ? null : state.currentConversationId,
        messages: state.currentConversationId === id ? [] : state.messages,
      }));
    } catch (error) {
      console.error('[Chat] Failed to delete conversation:', error);
      throw error;
    }
  },

  renameConversation: async (id, title) => {
    try {
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, title } : c
        ),
      }));
    } catch (error) {
      console.error('[Chat] Failed to rename conversation:', error);
      throw error;
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

    // Save user message
    const userMsgId = randomUUID();
    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: userMsgId,
      conversationId: currentConversationId,
      role: 'user',
      content,
      attachedFileIds,
      createdAt: now,
    };

    await db.insert(messages).values({
      id: userMsgId,
      conversationId: currentConversationId,
      role: 'user',
      content,
      attachedFileIds: JSON.stringify(attachedFileIds),
      createdAt: now,
    });

    set((state) => ({ messages: [...state.messages, userMsg] }));

    // Build rich context from all stores
    const fileNodes = useFilesStore.getState().nodes;
    const fileTree = buildFileTree(fileNodes);
    const scheduleClasses = useScheduleStore.getState().classes;
    const { useLmsStore } = await import('./useLmsStore');
    const lmsState = useLmsStore.getState();
    const allAssignments = lmsState.items.filter((i) => i.type === 'assignment');

    const classData = scheduleClasses.map((c) => ({
      name: c.name,
      code: c.code,
      room: c.room,
      instructor: c.instructor,
      daysOfWeek: c.daysOfWeek,
      startTime: c.startTime,
      endTime: c.endTime,
    }));

    const assignmentData = allAssignments.map((a) => ({
      title: a.title,
      courseName: a.courseName,
      dueDate: a.dueDate,
      status: a.status,
      description: a.description,
    }));

    const systemPrompt = buildSystemPrompt(fileTree, classData, assignmentData);

    // Build Gemini messages (sliding window of last 20)
    const allMsgs = [...get().messages];
    const windowMsgs = allMsgs.slice(-20);

    // Prepend user files as inlineData so Gemini can read/OCR them
    // Only send files that have been explicitly attached to the message
    const contextParts: GeminiPart[] = [];
    const attachedNodes = fileNodes.filter((n) => 
      n.type === 'file' && 
      n.localUri && 
      attachedFileIds.includes(n.id)
    );

    // Helper: Uint8Array to base64
    function uint8ToBase64(bytes: Uint8Array): string {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    for (const node of attachedNodes) {
      try {
        const { File: FSFile, Paths } = require('expo-file-system') as typeof import('expo-file-system');

        // Check if file exists
        const pathInfo = Paths.info(node.localUri!);
        if (!pathInfo.exists) {
          console.warn('[Chat] File not found:', node.localUri);
          continue;
        }

        // Read file bytes using SDK 52 File API
        const file = new FSFile(node.localUri!);
        const bytes = await file.bytes();
        const base64 = uint8ToBase64(bytes);

        if (base64.length > 0) {
          let mimeType = node.mimeType!;
          if (mimeType.includes('heic') || mimeType.includes('heif')) {
            mimeType = 'image/jpeg';
          }

          contextParts.push({
            inlineData: { mimeType, data: base64 },
          });
          contextParts.push({ text: `[File: ${node.name}]` });
          console.log('[Chat] Attached file:', node.name, 'bytes:', bytes.length, 'base64:', base64.length);
        }
      } catch (err) {
        console.warn('[Chat] Failed to read file:', node.name, err);
      }
    }

    const geminiMessages: GeminiMessage[] = [];

    // Add file context as first user message if we have files
    if (contextParts.length > 0) {
      geminiMessages.push({
        role: 'user',
        parts: [
          { text: 'Here are all my files for reference. You can read and analyze them when I ask about them.' },
          ...contextParts,
        ],
      });
      geminiMessages.push({
        role: 'model',
        parts: [{ text: 'I can see all your files. I\'ll reference them when you ask about specific documents or images.' }],
      });
    }

    // Add conversation messages
    for (const m of windowMsgs) {
      geminiMessages.push({
        role: m.role,
        parts: [{ text: m.content }],
      });
    }

    // Show loading state
    set({ isStreaming: true, streamingContent: '' });

    try {
      // Non-streaming call (React Native doesn't support ReadableStream)
      const fullResponse = await generateGeminiChat(apiKey, geminiMessages, systemPrompt);

      // Save AI response
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

      await db.insert(messages).values({
        id: aiMsgId,
        conversationId: currentConversationId,
        role: 'model',
        content: fullResponse,
        attachedFileIds: '[]',
        createdAt: aiNow,
      });

      await db
        .update(conversations)
        .set({ updatedAt: aiNow })
        .where(eq(conversations.id, currentConversationId));

      set((state) => ({
        messages: [...state.messages, aiMsg],
        isStreaming: false,
        streamingContent: '',
        conversations: state.conversations.map((c) =>
          c.id === currentConversationId ? { ...c, updatedAt: aiNow } : c
        ),
      }));

      // Auto-rename after 2nd user message if still default title
      const userMsgCount = get().messages.filter((m) => m.role === 'user').length;
      const currentConv = get().conversations.find((c) => c.id === currentConversationId);
      const isDefaultTitle = currentConv?.title === 'New Chat' || currentConv?.title?.endsWith('...');

      if (userMsgCount >= 2 && isDefaultTitle) {
        try {
          const recentText = get().messages
            .slice(-6)
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
    } catch (error) {
      set({ isStreaming: false, streamingContent: '' });
      throw error;
    }
  },
}));
