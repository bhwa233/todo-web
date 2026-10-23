'use server';
import { requireAdmin } from '../../lib/auth';
import { callDataService } from '../../data/client';
import { z } from 'zod';
import { bookmarkPrompt, taskPrompt, polishPrompt } from './prompts';
export interface RobotResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
export interface OpenAICompletion {
  tags: string[];
  summary: string;
  title: string;
}
export async function generateResponse<T>(
  prompt: string,
): Promise<RobotResponse<T>> {
  await requireAdmin();
  return {
    success: true,
    data: await callDataService<T>('ai/generate', { prompt, json: true }),
  };
}
export async function getSummarizeBookmarkByContent(
  content: string,
  existedTags: string[],
): Promise<OpenAICompletion> {
  await requireAdmin();
  return z
    .object({
      tags: z.array(z.string()),
      summary: z.string(),
      title: z.string(),
    })
    .parse(
      await callDataService('ai/generate', {
        prompt: bookmarkPrompt(content.slice(0, 60000), existedTags),
        json: true,
      }),
    );
}
export async function getTaskTags(
  content: string,
  existedTags: string[],
): Promise<string[]> {
  await requireAdmin();
  const result = z
    .object({ tagNames: z.array(z.string()).max(50) })
    .parse(
      await callDataService('ai/generate', {
        prompt: taskPrompt(content, existedTags),
        json: true,
      }),
    );
  return result.tagNames;
}
export async function polishContent(content: string): Promise<string> {
  await requireAdmin();
  return callDataService<string>('ai/generate', {
    prompt: polishPrompt(content),
    json: false,
  });
}
