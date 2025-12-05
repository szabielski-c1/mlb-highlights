/**
 * Gemini Video Analyzer - Analyzes MLB highlight clips to find action timestamps
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Use Gemini 2.5 Pro for video analysis (best multimodal performance)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-06-05' });

/**
 * Download video to temp file for Gemini upload
 * @param {string} videoUrl - URL of the video
 * @param {string} clipId - Unique identifier for the clip
 * @returns {Promise<string>} - Path to downloaded file
 */
async function downloadForAnalysis(videoUrl, clipId) {
  const tempDir = path.join(os.tmpdir(), 'mlb-gemini-analysis');
  await fs.mkdir(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `${clipId}.mp4`);

  // Check if already downloaded
  try {
    await fs.access(outputPath);
    return outputPath;
  } catch {
    // File doesn't exist, download it
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));

  return outputPath;
}

/**
 * Analyze a single video clip with Gemini
 * @param {string} videoPath - Path to the video file
 * @param {string} clipId - Unique identifier
 * @param {object} context - Additional context (headline, event type)
 * @returns {Promise<object>} - Analysis results with timestamps
 */
async function analyzeClip(videoPath, clipId, context = {}) {
  // Read video file as base64
  const videoData = await fs.readFile(videoPath);
  const base64Video = videoData.toString('base64');

  const prompt = `Analyze this MLB baseball highlight video clip.

Context: ${context.headline || 'Baseball highlight'} - ${context.event || 'play'}

Return ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "action_start_seconds": <number - when the pitch/key action begins>,
  "action_peak_seconds": <number - the climax moment (ball hit, catch, crossing plate)>,
  "action_end_seconds": <number - when the play concludes>,
  "total_duration_seconds": <number - total clip length>,
  "description": "<string - brief description of what happens>",
  "crowd_reaction_peak": <number or null - when crowd noise peaks, if notable>
}

Focus on identifying:
1. When the pitcher releases the ball or the key action starts
2. The exact moment of contact/catch/key event
3. When the play result is clear (safe/out, ball lands, etc.)`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'video/mp4',
          data: base64Video,
        },
      },
      { text: prompt },
    ]);

    const responseText = result.response.text();

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText;
    if (responseText.includes('```')) {
      jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const analysis = JSON.parse(jsonStr);

    return {
      clipId,
      ...analysis,
      analyzed: true,
    };
  } catch (error) {
    console.error(`Gemini analysis failed for clip ${clipId}:`, error);

    // Return fallback with estimated timestamps
    return {
      clipId,
      action_start_seconds: 1.0,
      action_peak_seconds: null,
      action_end_seconds: null,
      total_duration_seconds: null,
      description: context.headline || 'Baseball play',
      crowd_reaction_peak: null,
      analyzed: false,
      error: error.message,
    };
  }
}

/**
 * Analyze multiple video clips
 * @param {Array} clips - Array of clip objects with videoUrl, id, headline
 * @returns {Promise<Array>} - Clips with analysis data added
 */
export async function analyzeClips(clips) {
  const results = [];

  for (const clip of clips) {
    try {
      // Download video
      const videoPath = await downloadForAnalysis(clip.videoUrl, clip.id);

      // Analyze with Gemini
      const analysis = await analyzeClip(videoPath, clip.id, {
        headline: clip.headline,
        event: clip.event,
      });

      results.push({
        ...clip,
        analysis,
      });
    } catch (error) {
      console.error(`Failed to analyze clip ${clip.id}:`, error);
      results.push({
        ...clip,
        analysis: {
          clipId: clip.id,
          analyzed: false,
          error: error.message,
        },
      });
    }
  }

  return results;
}

/**
 * Get optimal trim points for a clip based on analysis
 * @param {object} analysis - Gemini analysis results
 * @param {number} targetDuration - Desired clip duration in seconds
 * @returns {object} - { startTime, duration }
 */
export function getTrimPoints(analysis, targetDuration = 10) {
  const { action_start_seconds, action_peak_seconds, action_end_seconds, total_duration_seconds } = analysis;

  // If we don't have good data, return full clip
  if (!action_start_seconds || !total_duration_seconds) {
    return { startTime: 0, duration: total_duration_seconds || targetDuration };
  }

  // Calculate optimal window around the action
  const actionDuration = (action_end_seconds || action_peak_seconds + 2) - action_start_seconds;
  const buffer = Math.max(1, (targetDuration - actionDuration) / 2);

  const startTime = Math.max(0, action_start_seconds - buffer);
  const endTime = Math.min(
    total_duration_seconds,
    (action_end_seconds || action_peak_seconds + 2) + buffer
  );

  return {
    startTime,
    duration: endTime - startTime,
    actionStart: action_start_seconds - startTime, // Relative to trimmed clip
    actionPeak: action_peak_seconds ? action_peak_seconds - startTime : null,
  };
}

/**
 * Clean up downloaded analysis files
 */
export async function cleanupAnalysisFiles() {
  const tempDir = path.join(os.tmpdir(), 'mlb-gemini-analysis');
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup analysis files:', error);
  }
}
