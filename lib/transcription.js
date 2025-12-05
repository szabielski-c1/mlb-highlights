// Transcription service using Google Cloud Speech-to-Text
// Falls back to Gemini if STT credentials not configured
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Check if Google Cloud STT credentials are available
const hasSTTCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Initialize Gemini as fallback
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * Extract audio from video file using ffmpeg
 * For STT: outputs LINEAR16 WAV at 16kHz mono
 * For Gemini: outputs MP3
 * @param {string} videoPath - Path to video file
 * @param {boolean} forSTT - If true, output WAV for STT, else MP3 for Gemini
 * @returns {Promise<string>} - Path to extracted audio file
 */
export async function extractAudio(videoPath, forSTT = hasSTTCredentials) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', 'audio');
  await fs.mkdir(tempDir, { recursive: true });

  const ext = forSTT ? 'wav' : 'mp3';
  const audioPath = path.join(tempDir, `audio-${Date.now()}.${ext}`);

  const ffmpegArgs = forSTT
    ? [
        '-i', videoPath,
        '-vn',             // no video
        '-acodec', 'pcm_s16le',  // LINEAR16 for STT
        '-ar', '16000',    // 16kHz sample rate
        '-ac', '1',        // mono
        '-y',              // overwrite
        audioPath
      ]
    : [
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
 * Transcribe audio using Google Cloud Speech-to-Text
 * Returns word-level timestamps
 * @param {string} audioPath - Path to WAV audio file
 * @returns {Promise<{words: Array, duration: number}>}
 */
async function transcribeWithSTT(audioPath) {
  // Dynamic import to avoid errors when credentials not set
  const { SpeechClient } = await import('@google-cloud/speech');
  const client = new SpeechClient();

  // Read audio file
  const audioBuffer = await fs.readFile(audioPath);
  const audioBytes = audioBuffer.toString('base64');

  // Get duration
  const duration = await getAudioDuration(audioPath);

  const request = {
    audio: {
      content: audioBytes,
    },
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US',
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'video', // optimized for video audio
      useEnhanced: true, // better accuracy
    },
  };

  console.log('Transcribing with Google Cloud STT...');
  const [response] = await client.recognize(request);

  const words = [];
  for (const result of response.results || []) {
    const alternative = result.alternatives?.[0];
    if (!alternative?.words) continue;

    for (const wordInfo of alternative.words) {
      // Convert protobuf Duration to seconds
      const startTime = Number(wordInfo.startTime?.seconds || 0) +
        Number(wordInfo.startTime?.nanos || 0) / 1e9;
      const endTime = Number(wordInfo.endTime?.seconds || 0) +
        Number(wordInfo.endTime?.nanos || 0) / 1e9;

      words.push({
        word: wordInfo.word,
        start: Math.round(startTime * 100) / 100,
        end: Math.round(endTime * 100) / 100,
        confidence: alternative.confidence || 0.95,
        index: words.length
      });
    }
  }

  console.log(`STT transcription complete: ${words.length} words`);
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

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

  console.log('Transcribing with Gemini 2.0 Flash...');
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
 * Transcribe audio - uses STT if credentials available, else Gemini
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<{words: Array, duration: number}>}
 */
export async function transcribeAudio(audioPath) {
  if (hasSTTCredentials) {
    return transcribeWithSTT(audioPath);
  } else {
    console.log('No GOOGLE_APPLICATION_CREDENTIALS set, using Gemini fallback');
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

  // Extract audio (format depends on STT availability)
  const audioPath = await extractAudio(videoPath, hasSTTCredentials);

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
