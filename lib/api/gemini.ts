// lib/api/gemini.ts
// Gemini REST API wrapper — non-streaming for React Native compatibility

import * as SecureStore from 'expo-secure-store';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash-lite';

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Get the stored Gemini API key
 */
export async function getGeminiApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('gemini_api_key');
  } catch {
    return null;
  }
}

/**
 * Save the Gemini API key
 */
export async function setGeminiApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync('gemini_api_key', key);
}

/**
 * Test if an API key is valid by listing models
 */
export async function testGeminiApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models?key=${apiKey}`,
      { method: 'GET' }
    );
    if (res.ok) return true;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      const msg = (data?.error?.message || '').toLowerCase();
      if (msg.includes('api key') || msg.includes('invalid') || msg.includes('unauthorized') || msg.includes('forbidden')) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Build the system prompt with file tree and course context
 */
interface ClassContext {
  name: string;
  code: string | null;
  room: string | null;
  instructor: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

interface AssignmentContext {
  title: string;
  courseName: string;
  dueDate: string | null;
  status: string;
  description: string | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildSystemPrompt(
  fileTree: string,
  classData: ClassContext[],
  assignmentData: AssignmentContext[],
): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Format classes
  let classesSection = '';
  if (classData.length > 0) {
    classesSection = '\n\nSTUDENT\'S CLASS SCHEDULE:\n' + classData.map((c) => {
      const days = c.daysOfWeek.map((d) => DAY_NAMES[d] || `Day ${d}`).join(', ');
      let line = `- ${c.name}`;
      if (c.code) line += ` (${c.code})`;
      line += ` | ${days} ${c.startTime}–${c.endTime}`;
      if (c.room) line += ` | Room: ${c.room}`;
      if (c.instructor) line += ` | ${c.instructor}`;
      return line;
    }).join('\n');
  }

  // Format assignments
  let assignmentsSection = '';
  if (assignmentData.length > 0) {
    assignmentsSection = '\n\nSTUDENT\'S ASSIGNMENTS:\n' + assignmentData.map((a) => {
      let line = `- [${a.status.toUpperCase()}] ${a.title} (${a.courseName})`;
      if (a.dueDate) {
        const due = new Date(a.dueDate);
        line += ` | Due: ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      }
      if (a.description) {
        line += `\n  Description: ${a.description.slice(0, 200)}`;
      }
      return line;
    }).join('\n');
  }

  return `You are UniMate AI, a concise academic assistant. Today is ${date}, ${time}.

CRITICAL RULES:
- Answer questions DIRECTLY. Do NOT ask follow-up questions.
- Do NOT ask "what would you like to know?" or "would you like me to elaborate?" — just answer fully.
- When the student sends files/images, you CAN see them. Read, OCR, and analyze any images or documents sent in the conversation.
- Be concise. Use markdown formatting. No filler text.
- You have full access to the student's schedule, assignments, and file library below.

FILE LIBRARY:
${fileTree || 'No files uploaded yet.'}
${classesSection}
${assignmentsSection}

You can help with:
- Reading and analyzing files/images/screenshots sent in the conversation
- Answering questions about assignments, due dates, and course materials
- Explaining concepts, exam prep, and study planning
- Schedule and time management advice`;
}

/**
 * Generate a short chat title from conversation messages
 */
export async function generateChatTitle(
  apiKey: string,
  messagesText: string,
): Promise<string> {
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `Based on this conversation, generate a very short title (3-6 words max, no quotes, no punctuation at end). Just respond with the title and nothing else.\n\nConversation:\n${messagesText}` }],
          }],
        }),
      }
    );
    if (!res.ok) return 'Chat';
    const data = await res.json();
    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Chat';
    return title.replace(/^["']|["']$/g, '').slice(0, 50);
  } catch {
    return 'Chat';
  }
}

/**
 * Non-streaming Gemini chat
 * React Native's fetch doesn't support ReadableStream, so we use non-streaming.
 */
export async function generateGeminiChat(
  apiKey: string,
  messages: GeminiMessage[],
  systemPrompt: string,
): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages,
      }),
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Gemini API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
