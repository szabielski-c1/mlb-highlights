#!/usr/bin/env node

/**
 * Script to extract inning transition graphics from MLB highlight videos
 * Frame-accurate extraction using Gemini for detection and ffmpeg scene detection
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const OUTPUT_DIR = '/Users/scott/Documents/Business/mlb-highlights/inning-transitions';
const LOG_FILE = path.join(OUTPUT_DIR, 'transitions-log.json');
const TEMP_DIR = path.join(os.tmpdir(), 'mlb-transitions');

// Log of all found transitions with source URLs
const transitionLog = [];

// Track found transitions by style -> inning
// e.g., { 'bat-rack': Set(['top-1', 'bot-1']), 'grass-field': Set(['top-2']) }
const foundByStyle = {};

// All innings we need to find
const INNINGS_NEEDED = [
  'top-1', 'bot-1',
  'top-2', 'bot-2',
  'top-3', 'bot-3',
  'top-4', 'bot-4',
  'top-5', 'bot-5',
  'top-6', 'bot-6',
  'top-7', 'bot-7',
  'top-8', 'bot-8',
  'top-9', 'bot-9',
];

// Track what we've found
const found = new Set();

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
    proc.on('error', (err) => reject(err));
  });
}

async function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
    ffmpeg.on('error', (err) => reject(err));
  });
}

async function downloadVideo(url, filename) {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  const outputPath = path.join(TEMP_DIR, filename);

  // Check if already downloaded
  try {
    await fs.access(outputPath);
    console.log('  Using cached video');
    return outputPath;
  } catch (e) {}

  // Extract actual URL if proxied
  let actualUrl = url;
  if (url.includes('video-proxy?url=')) {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) actualUrl = decodeURIComponent(match[1]);
  }

  const response = await fetch(actualUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:92.0) Gecko/20100101 Firefox/92.0',
      'Origin': 'https://www.mlb.com',
      'Referer': 'https://www.mlb.com/',
    },
  });

  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  return outputPath;
}

async function getVideoInfo(videoPath) {
  const output = await runCommand('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,nb_frames,duration',
    '-of', 'json',
    videoPath
  ]);

  const info = JSON.parse(output);
  const stream = info.streams[0];

  // Parse frame rate (e.g., "30000/1001" or "30/1")
  const [num, den] = stream.r_frame_rate.split('/').map(Number);
  const fps = num / den;

  return {
    fps,
    duration: parseFloat(stream.duration),
    frameCount: parseInt(stream.nb_frames) || Math.floor(parseFloat(stream.duration) * fps)
  };
}

async function extractFramesForAnalysis(videoPath, outputDir, fps) {
  // Extract 1 frame per second for initial analysis
  await fs.mkdir(outputDir, { recursive: true });

  await runFFmpeg([
    '-i', videoPath,
    '-vf', `fps=1`,
    '-frame_pts', '1',
    path.join(outputDir, 'frame_%04d.jpg')
  ]);

  const files = await fs.readdir(outputDir);
  return files.filter(f => f.endsWith('.jpg')).sort();
}

async function compressVideoForAnalysis(videoPath) {
  // Compress video to ~15MB for Gemini analysis
  // Use low resolution (480p) and high compression for API upload
  const compressedPath = videoPath.replace('.mp4', '-analysis.mp4');

  // Check if already compressed
  try {
    await fs.access(compressedPath);
    const stats = await fs.stat(compressedPath);
    if (stats.size > 0) {
      console.log('  Using cached compressed video for analysis');
      return compressedPath;
    }
  } catch (e) {}

  console.log('  Compressing video for Gemini analysis...');

  await runFFmpeg([
    '-i', videoPath,
    '-vf', 'scale=640:-2',  // 640px width, maintain aspect ratio
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '28',  // Higher CRF = smaller file
    '-c:a', 'aac',
    '-b:a', '64k',  // Low audio bitrate
    '-y',
    compressedPath
  ]);

  // Check resulting file size
  const stats = await fs.stat(compressedPath);
  console.log(`  Compressed video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return compressedPath;
}

async function uploadVideoToGemini(videoPath, apiKey) {
  // Upload video to Gemini File API for processing
  const stats = await fs.stat(videoPath);
  const numBytes = stats.size;
  const mimeType = 'video/mp4';
  const displayName = path.basename(videoPath);

  console.log(`  Uploading ${(numBytes / 1024 / 1024).toFixed(2)} MB to Gemini File API...`);

  // Step 1: Start resumable upload
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': numBytes.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { display_name: displayName }
      })
    }
  );

  if (!startResponse.ok) {
    const error = await startResponse.text();
    throw new Error(`Failed to start upload: ${error}`);
  }

  const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('No upload URL returned');
  }

  // Step 2: Upload the file data
  const videoData = await fs.readFile(videoPath);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': numBytes.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoData
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  const fileInfo = await uploadResponse.json();
  console.log(`  Uploaded file: ${fileInfo.file.name}`);

  // Step 3: Wait for processing
  let file = fileInfo.file;
  while (file.state === 'PROCESSING') {
    console.log('  Waiting for video processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`
    );
    if (statusResponse.ok) {
      file = await statusResponse.json();
    }
  }

  if (file.state === 'FAILED') {
    throw new Error('Video processing failed');
  }

  return file;
}

async function analyzeVideoForTransitions(videoPath, apiKey) {
  console.log('  Analyzing video with Gemini 3 Pro...');

  // First compress the video for API upload
  const compressedPath = await compressVideoForAnalysis(videoPath);

  // Upload video to File API
  const file = await uploadVideoToGemini(compressedPath, apiKey);

  const prompt = `Analyze this MLB highlight video and find ALL inning transition graphics, regardless of style.

MLB uses MULTIPLE different transition graphic styles. Find them ALL and classify each by style:

KNOWN STYLES (you may find others):
1. "bat-rack" - Blue/gray wooden bat rack with vertical slats, bat handles in foreground, "TOP"/"BOTTOM" in distressed white text, inning number branded/burned into a bat end
2. "grass-field" - Green grass or baseball field aesthetic, different color scheme

DO NOT confuse these with:
- Score graphics or scoreboards during gameplay
- Player stat overlays
- Lineup graphics
- Regular broadcast graphics showing game status

INNING TRANSITIONS are full-screen graphics that appear between half-innings, showing:
- "TOP" or "BOTTOM" (or similar text indicating which half)
- The inning NUMBER (1st, 2nd, 3rd, etc.)
- Usually have an MLB logo
- Are stylized/designed graphics, not just plain text

For EACH transition you find:
1. Note the EXACT time when the graphic FIRST starts to appear
2. Note the EXACT time when the graphic is COMPLETELY gone
3. Identify which half-inning it shows (top-1, bot-1, top-2, etc.)
4. Classify the visual style with a short descriptive name (e.g., "bat-rack", "grass-field", "wood-plank", etc.)

Be very precise with timestamps - use format SS.SS (seconds with decimals).

Return ONLY a JSON array, nothing else:
[
  {"inning": "top-1", "start_sec": 5.2, "end_sec": 6.8, "style": "bat-rack"},
  {"inning": "bot-1", "start_sec": 45.1, "end_sec": 46.7, "style": "grass-field"}
]

If no transitions found, return: []`;

  try {
    // Call Gemini with the uploaded file reference
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                file_data: {
                  mime_type: file.mimeType,
                  file_uri: file.uri
                }
              }
            ]
          }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('  Gemini response:', text.substring(0, 500));

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const transitions = JSON.parse(jsonMatch[0]);
      return transitions;
    }
    return [];
  } catch (error) {
    console.error('  Error analyzing video:', error.message);
    return [];
  }
}

async function refineTransitionBoundaries(videoPath, approxStart, approxEnd, fps) {
  // Use scene detection around the approximate timestamps to find exact boundaries
  const searchStart = Math.max(0, approxStart - 1);
  const searchEnd = approxEnd + 1;
  const searchDuration = searchEnd - searchStart;

  // Detect scene changes in this window
  try {
    const output = await runCommand('ffprobe', [
      '-v', 'error',
      '-ss', searchStart.toFixed(3),
      '-t', searchDuration.toFixed(3),
      '-i', videoPath,
      '-vf', 'select=\'gt(scene,0.3)\',showinfo',
      '-f', 'null',
      '-'
    ]);

    // This doesn't give us scene changes directly, let's use a different approach
  } catch (e) {}

  // For frame-accurate extraction, we'll trust Gemini but round to frame boundaries
  const frameStart = Math.floor(approxStart * fps);
  const frameEnd = Math.ceil(approxEnd * fps);

  return {
    startFrame: frameStart,
    endFrame: frameEnd,
    startSec: frameStart / fps,
    endSec: frameEnd / fps
  };
}

async function extractTransitionFrameAccurate(videoPath, transition, outputDir, fps, gameInfo, videoDuration) {
  const { inning, start_sec, end_sec, style = 'unknown' } = transition;

  // Normalize style name to a valid folder name
  const styleName = style.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  // Create style-specific subdirectories for tight cuts and with-handles versions
  const styleDir = path.join(outputDir, styleName);
  const tightDir = path.join(styleDir, 'tight');
  const handlesDir = path.join(styleDir, 'with-handles');
  await fs.mkdir(tightDir, { recursive: true });
  await fs.mkdir(handlesDir, { recursive: true });

  const tightPath = path.join(tightDir, `${inning}.mp4`);
  const handlesPath = path.join(handlesDir, `${inning}.mp4`);

  // Calculate frame-accurate boundaries for tight cut
  const startFrame = Math.floor(start_sec * fps);
  const endFrame = Math.ceil(end_sec * fps);
  const startSec = startFrame / fps;
  const endSec = endFrame / fps;
  const duration = endSec - startSec;

  if (duration <= 0 || duration > 10) {
    console.log(`  Skipping ${inning}: invalid duration ${duration.toFixed(3)}s`);
    return false;
  }

  console.log(`  Extracting ${inning}: frames ${startFrame}-${endFrame} (${startSec.toFixed(3)}s - ${endSec.toFixed(3)}s, ${duration.toFixed(3)}s)`);

  try {
    // Extract TIGHT version (frame-accurate)
    await runFFmpeg([
      '-ss', startSec.toFixed(6),
      '-i', videoPath,
      '-t', duration.toFixed(6),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',  // High quality
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      tightPath
    ]);
    console.log(`  Saved tight: ${tightPath}`);

    // Extract WITH-HANDLES version (~1 second on each side)
    const handleDuration = 1.0; // 1 second handles
    const handlesStartSec = Math.max(0, startSec - handleDuration);
    const handlesEndSec = Math.min(videoDuration, endSec + handleDuration);
    const handlesTotalDuration = handlesEndSec - handlesStartSec;

    await runFFmpeg([
      '-ss', handlesStartSec.toFixed(6),
      '-i', videoPath,
      '-t', handlesTotalDuration.toFixed(6),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      handlesPath
    ]);
    console.log(`  Saved with handles: ${handlesPath} (${handlesTotalDuration.toFixed(2)}s total)`);

    // Track this style/inning combination
    if (!foundByStyle[styleName]) {
      foundByStyle[styleName] = new Set();
    }
    foundByStyle[styleName].add(inning);

    // Log the extraction details
    transitionLog.push({
      inning,
      style: styleName,
      videoUrl: gameInfo.videoUrl,
      gameTitle: gameInfo.headline,
      gameDate: gameInfo.date,
      gamePk: gameInfo.gamePk,
      tightCut: {
        startSec: startSec.toFixed(3),
        endSec: endSec.toFixed(3),
        duration: duration.toFixed(3)
      },
      withHandles: {
        startSec: handlesStartSec.toFixed(3),
        endSec: handlesEndSec.toFixed(3),
        duration: handlesTotalDuration.toFixed(3)
      },
      startFrame,
      endFrame,
      fps: fps.toFixed(2),
      extractedAt: new Date().toISOString()
    });

    // Save log after each extraction
    await fs.writeFile(LOG_FILE, JSON.stringify(transitionLog, null, 2));
    console.log(`  Logged to: ${LOG_FILE}`);
    return true;
  } catch (error) {
    console.error(`  Failed to extract ${inning}:`, error.message);
    return false;
  }
}

async function getRecentGames() {
  // Fetch games from MLB API - use 2024 season since we're in offseason
  // Use September/October 2024 games for highlights
  const dates = [
    '2024-09-29', '2024-09-28', '2024-09-27', '2024-09-26', '2024-09-25',
    '2024-09-24', '2024-09-23', '2024-09-22', '2024-09-21', '2024-09-20',
    '2024-09-19', '2024-09-18', '2024-09-17', '2024-09-16', '2024-09-15',
    '2024-08-15', '2024-08-14', '2024-08-13', '2024-08-12', '2024-08-11',
    '2024-07-15', '2024-07-14', '2024-07-13', '2024-07-12', '2024-07-11',
  ];

  const games = [];

  for (const date of dates) {
    try {
      const response = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=game(content(highlights(highlights)))`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );

      if (!response.ok) continue;

      const data = await response.json();

      for (const dateObj of data.dates || []) {
        for (const game of dateObj.games || []) {
          const highlights = game.content?.highlights?.highlights?.items || [];

          // Find the main highlights video (usually titled "X vs. Y Highlights")
          const mainHighlight = highlights.find(h =>
            h.headline?.includes('Highlights') &&
            h.playbacks?.some(p => p.name === 'mp4Avc')
          );

          if (mainHighlight) {
            const playback = mainHighlight.playbacks.find(p => p.name === 'mp4Avc');
            if (playback) {
              games.push({
                gamePk: game.gamePk,
                date: date,
                headline: mainHighlight.headline,
                videoUrl: playback.url
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching games for ${date}:`, error.message);
    }
  }

  return games;
}

function normalizeInning(inning) {
  // Normalize various formats to our standard format
  const str = String(inning).toLowerCase().trim();

  // Match patterns like "top-1", "top1", "t1", "top 1", "top-3rd", "top 4th", etc.
  // Allow optional ordinal suffixes (st, nd, rd, th)
  const topMatch = str.match(/^(?:top|t)[\s\-_]?(\d)(?:st|nd|rd|th)?$/);
  if (topMatch) return `top-${topMatch[1]}`;

  const botMatch = str.match(/^(?:bot|bottom|b)[\s\-_]?(\d)(?:st|nd|rd|th)?$/);
  if (botMatch) return `bot-${botMatch[1]}`;

  return null;
}

async function main() {
  console.log('MLB Inning Transition Extractor (Frame-Accurate)\n');
  console.log('Using Gemini 3 Pro via Google AI Studio File API\n');

  // Requires GOOGLE_AI_API_KEY environment variable
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is required');
  }

  console.log('API key configured:', apiKey.substring(0, 10) + '...');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Check what we already have - scan all style subdirectories
  try {
    const styleDirs = await fs.readdir(OUTPUT_DIR);
    for (const styleDir of styleDirs) {
      const stylePath = path.join(OUTPUT_DIR, styleDir);
      const stat = await fs.stat(stylePath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const tightPath = path.join(stylePath, 'tight');
      try {
        const existing = await fs.readdir(tightPath);
        for (const file of existing) {
          if (file.endsWith('.mp4')) {
            const inning = file.replace('.mp4', '');
            if (!foundByStyle[styleDir]) {
              foundByStyle[styleDir] = new Set();
            }
            foundByStyle[styleDir].add(inning);
            console.log(`Already have: ${styleDir}/${inning}`);
          }
        }
      } catch (e) {
        // tight/ directory doesn't exist for this style
      }
    }
  } catch (e) {
    // output directory doesn't exist yet
  }

  // Show summary of what we have
  console.log('\n--- Current inventory by style ---');
  for (const [style, innings] of Object.entries(foundByStyle)) {
    console.log(`  ${style}: ${Array.from(innings).sort().join(', ')}`);
  }
  console.log('----------------------------------\n');

  console.log('Looking for ALL transition styles across ALL innings...\n');

  // Get recent highlight videos
  console.log('Fetching recent games...');
  const games = await getRecentGames();
  console.log(`Found ${games.length} highlight videos to analyze\n`);

  // Shuffle games to get variety
  games.sort(() => Math.random() - 0.5);

  for (const game of games) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${game.headline} (${game.date})`);
    console.log(`Video URL: ${game.videoUrl}`);

    try {
      // Download video
      console.log('  Downloading video...');
      const videoPath = await downloadVideo(game.videoUrl, `highlight-${game.gamePk}.mp4`);

      // Get video info
      const videoInfo = await getVideoInfo(videoPath);
      console.log(`  Video: ${videoInfo.duration.toFixed(2)}s, ${videoInfo.fps.toFixed(2)} fps, ~${videoInfo.frameCount} frames`);

      // Analyze with Gemini
      const transitions = await analyzeVideoForTransitions(videoPath, apiKey);

      if (transitions.length === 0) {
        console.log('  No transitions found in this video');
        continue;
      }

      console.log(`  Found ${transitions.length} transitions: ${transitions.map(t => `${t.style}/${t.inning}`).join(', ')}`);

      // Extract all unique style/inning combinations
      for (const transition of transitions) {
        const normalizedInning = normalizeInning(transition.inning);
        if (!normalizedInning) {
          console.log(`  Skipping invalid inning format: ${transition.inning}`);
          continue;
        }

        const styleName = (transition.style || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

        // Check if we already have this style/inning combo
        if (foundByStyle[styleName] && foundByStyle[styleName].has(normalizedInning)) {
          console.log(`  Skipping ${styleName}/${normalizedInning} (already have it)`);
          continue;
        }

        transition.inning = normalizedInning;
        await extractTransitionFrameAccurate(videoPath, transition, OUTPUT_DIR, videoInfo.fps, game, videoInfo.duration);
      }

    } catch (error) {
      console.error(`  Error processing ${game.headline}:`, error.message);
    }
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));

  console.log('\n--- Collected transitions by style ---');
  let totalFound = 0;
  for (const [style, innings] of Object.entries(foundByStyle).sort()) {
    const sortedInnings = Array.from(innings).sort();
    console.log(`\n${style}/`);
    console.log(`  Found (${sortedInnings.length}/18): ${sortedInnings.join(', ')}`);
    const missing = INNINGS_NEEDED.filter(i => !innings.has(i));
    if (missing.length > 0) {
      console.log(`  Missing (${missing.length}): ${missing.join(', ')}`);
    }
    totalFound += sortedInnings.length;
  }

  console.log('\n----------------------------------');
  console.log(`Total styles found: ${Object.keys(foundByStyle).length}`);
  console.log(`Total transitions extracted: ${totalFound}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log('\nRun the script again to find more transitions from other games.');
}

main().catch(console.error);
