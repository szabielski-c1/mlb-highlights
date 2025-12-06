// Transcription service using ElevenLabs Scribe
// Falls back to Gemini if ElevenLabs API key not configured
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Check if ElevenLabs API key is available
const hasElevenLabsKey = !!process.env.ELEVENLABS_API_KEY;

// Initialize Gemini as fallback
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * Extract audio from video file using ffmpeg
 * Outputs MP3 for both ElevenLabs and Gemini
 * @param {string} videoPath - Path to video file
 * @returns {Promise<string>} - Path to extracted audio file
 */
export async function extractAudio(videoPath) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', 'audio');
  await fs.mkdir(tempDir, { recursive: true });

  const audioPath = path.join(tempDir, `audio-${Date.now()}.mp3`);

  const ffmpegArgs = [
    '-i', videoPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ar', '16000',
    '-ac', '1',
    '-y',
    audioPath
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(audioPath);
      } else {
        reject(new Error(`ffmpeg audio extraction failed: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Download video from URL to temp file
 * Handles both direct URLs and video-proxy URLs
 * @param {string} url - Video URL (can be direct or /api/video-proxy?url=...)
 * @returns {Promise<string>} - Path to downloaded file
 */
export async function downloadVideo(url) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', 'videos');
  await fs.mkdir(tempDir, { recursive: true });

  const videoPath = path.join(tempDir, `video-${Date.now()}.mp4`);

  // Extract actual video URL if this is a video-proxy URL
  let actualUrl = url;
  if (url.includes('/api/video-proxy?url=') || url.includes('video-proxy?url=')) {
    // Extract the encoded URL parameter
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      actualUrl = decodeURIComponent(match[1]);
      console.log('Extracted actual video URL:', actualUrl.substring(0, 80) + '...');
    }
  }

  // MLB URLs require proper headers (especially Origin/Referer for fastball-clips.mlb.com)
  const response = await fetch(actualUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:92.0) Gecko/20100101 Firefox/92.0',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Origin': 'https://www.mlb.com',
      'Referer': 'https://www.mlb.com/',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(videoPath, Buffer.from(buffer));

  return videoPath;
}

/**
 * Transcribe audio using ElevenLabs Scribe
 * Returns word-level timestamps
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<{words: Array, duration: number}>}
 */
async function transcribeWithElevenLabs(audioPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }

  // Read audio file
  const audioBuffer = await fs.readFile(audioPath);

  // Get duration
  const duration = await getAudioDuration(audioPath);

  // Create form data
  const formData = new FormData();
  formData.append('model_id', 'scribe_v1');
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
  formData.append('timestamps_granularity', 'word');
  formData.append('language_code', 'en');

  console.log('Transcribing with ElevenLabs Scribe...');
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  // Convert ElevenLabs response to our format
  const words = (result.words || [])
    .filter(w => w.type === 'word')
    .map((w, i) => ({
      word: w.text,
      start: Math.round(w.start * 100) / 100,
      end: Math.round(w.end * 100) / 100,
      confidence: w.logprob ? Math.exp(w.logprob) : 0.95,
      index: i
    }));

  console.log(`ElevenLabs transcription complete: ${words.length} words`);
  return { words, duration };
}

/**
 * Transcribe audio using Gemini 2.0 Flash (fallback)
 * Returns word-level timestamps
 * @param {string} audioPath - Path to MP3 audio file
 * @returns {Promise<{words: Array, duration: number}>}
 */
async function transcribeWithGemini(audioPath) {
  // Read audio file
  const audioBuffer = await fs.readFile(audioPath);
  const audioBase64 = audioBuffer.toString('base64');

  // Get duration
  const duration = await getAudioDuration(audioPath);

  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

  const prompt = `Transcribe this audio with precise word-level timestamps.

IMPORTANT: Return ONLY a valid JSON array, no markdown, no explanation. Each word must have:
- "word": the spoken word (including any punctuation attached)
- "start": start time in seconds (decimal)
- "end": end time in seconds (decimal)

Example format:
[{"word":"And","start":0.0,"end":0.15},{"word":"here's","start":0.16,"end":0.35}]

Rules:
1. Include ALL words spoken by the announcers
2. Timestamps must be accurate and sequential
3. Round timestamps to 2 decimal places
4. If multiple speakers, transcribe all of them
5. Include natural speech pauses in the timing gaps

Return ONLY the JSON array:`;

  console.log('Transcribing with Gemini 3 Pro...');
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'audio/mp3',
        data: audioBase64
      }
    }
  ]);

  const responseText = result.response.text();

  // Parse JSON from response
  let words;
  try {
    words = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      words = JSON.parse(jsonMatch[1].trim());
    } else {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        words = JSON.parse(arrayMatch[0]);
      } else {
        throw new Error('Could not parse transcription response');
      }
    }
  }

  // Normalize
  const normalizedWords = words.map((w, i) => ({
    word: String(w.word || ''),
    start: Number(w.start) || 0,
    end: Number(w.end) || (Number(w.start) + 0.2),
    confidence: Number(w.confidence) || 0.95,
    index: i
  }));

  console.log(`Gemini transcription complete: ${normalizedWords.length} words`);
  return { words: normalizedWords, duration };
}

/**
 * Transcribe audio - uses ElevenLabs if API key available, else Gemini
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<{words: Array, duration: number}>}
 */
export async function transcribeAudio(audioPath) {
  if (hasElevenLabsKey) {
    return transcribeWithElevenLabs(audioPath);
  } else {
    console.log('No ELEVENLABS_API_KEY set, using Gemini fallback');
    return transcribeWithGemini(audioPath);
  }
}

/**
 * Transcribe video directly from URL
 * Downloads, extracts audio, and transcribes
 * @param {string} videoUrl - Video URL
 * @returns {Promise<{words: Array, duration: number, videoPath: string, audioPath: string}>}
 */
export async function transcribeVideo(videoUrl) {
  // Download video
  const videoPath = await downloadVideo(videoUrl);

  // Extract audio as MP3
  const audioPath = await extractAudio(videoPath);

  // Transcribe
  const result = await transcribeAudio(audioPath);

  return {
    ...result,
    videoPath,
    audioPath
  };
}

/**
 * Get audio duration using ffprobe
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<number>} - Duration in seconds
 */
function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()));
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to start ffprobe: ${err.message}`));
    });
  });
}

/**
 * Clean up temporary transcription files
 * @param {string} videoPath - Path to temp video
 * @param {string} audioPath - Path to temp audio
 */
export async function cleanupTranscriptionFiles(videoPath, audioPath) {
  if (videoPath) {
    await fs.unlink(videoPath).catch(() => {});
  }
  if (audioPath) {
    await fs.unlink(audioPath).catch(() => {});
  }
}

/**
 * Calculate total duration of selected words
 * @param {Array} words - All words with timestamps
 * @param {Array<number>} selectedIndices - Indices of selected words
 * @returns {number} - Total duration in seconds
 */
export function calculateSelectedDuration(words, selectedIndices) {
  if (!selectedIndices || selectedIndices.length === 0) {
    return 0;
  }

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  let totalDuration = 0;
  let currentStart = null;
  let currentEnd = null;

  for (const idx of sorted) {
    const word = words[idx];
    if (!word) continue;

    if (currentStart === null) {
      currentStart = word.start;
      currentEnd = word.end;
    } else if (idx === sorted[sorted.indexOf(idx) - 1] + 1) {
      currentEnd = word.end;
    } else {
      totalDuration += currentEnd - currentStart;
      currentStart = word.start;
      currentEnd = word.end;
    }
  }

  if (currentStart !== null) {
    totalDuration += currentEnd - currentStart;
  }

  return totalDuration;
}

/**
 * Get trim points for a video based on selected words
 * Returns segments to keep with small buffers
 * @param {Array} words - All words with timestamps
 * @param {Array<number>} selectedIndices - Indices of selected words
 * @param {number} buffer - Buffer time in seconds to add around selections
 * @returns {Array<{start: number, end: number}>} - Segments to keep
 */
export function getSelectionSegments(words, selectedIndices, buffer = 0.1) {
  if (!selectedIndices || selectedIndices.length === 0) {
    return [];
  }

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const segments = [];
  let currentStart = null;
  let currentEnd = null;
  let prevIdx = null;

  for (const idx of sorted) {
    const word = words[idx];
    if (!word) continue;

    if (currentStart === null) {
      currentStart = Math.max(0, word.start - buffer);
      currentEnd = word.end + buffer;
      prevIdx = idx;
    } else if (idx === prevIdx + 1) {
      currentEnd = word.end + buffer;
      prevIdx = idx;
    } else {
      if (word.start - currentEnd < 0.5) {
        currentEnd = word.end + buffer;
      } else {
        segments.push({ start: currentStart, end: currentEnd });
        currentStart = Math.max(0, word.start - buffer);
        currentEnd = word.end + buffer;
      }
      prevIdx = idx;
    }
  }

  if (currentStart !== null) {
    segments.push({ start: currentStart, end: currentEnd });
  }

  return segments;
}
