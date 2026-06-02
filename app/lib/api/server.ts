// lib/api/server.ts
// Client for the UniMate FastAPI backend

import { getMoodleToken, getMoodleDomain } from '../session';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
console.log("BASE_URL",BASE_URL)

export interface JobResponse {
  jobId: string;
  type: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  progress: number;
  progressMessage: string | null;
  createdAt: string;
  updatedAt: string;
  result?: any;
}

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const moodleToken = await getMoodleToken();
  const moodleDomain = await getMoodleDomain();

  if (!moodleToken || !moodleDomain) {
    throw new Error('Missing Moodle credentials for server authentication');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Moodle-Token': moodleToken,
      'X-Moodle-Domain': moodleDomain,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = `Server error: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return response.json();
}

// ── Job Endpoints ─────────────────────────────────────────────────────────

export async function submitAnalyzeAssignmentJob(params: {
  assignmentId: string;
  courseId: string;
  courseName: string;
  assignmentName: string;
  dueDate: string | null;
  assignmentNumber?: string;
  teacherName?: string;
}): Promise<{ jobId: string; message: string }> {
  return apiCall('/jobs/analyze-assignment', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function submitEmbedCourseJob(params: {
  courseId: string;
  courseName: string;
  forceReembed?: boolean;
}): Promise<{ jobId: string; message: string }> {
  return apiCall('/jobs/embed-course', {
    method: 'POST',
    body: JSON.stringify({ ...params, forceReembed: params.forceReembed ?? false }),
  });
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return apiCall(`/jobs/${jobId}`);
}

export async function getJobResult(jobId: string): Promise<any> {
  return apiCall(`/jobs/${jobId}/result`);
}

// ── Embeddings ────────────────────────────────────────────────────────────

export async function getCourseEmbeddingStatus(courseId: string): Promise<{
  courseId: string;
  indexed: boolean;
  chunkCount: number;
}> {
  return apiCall(`/embeddings/status/${courseId}`);
}
