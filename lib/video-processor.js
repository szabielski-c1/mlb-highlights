// Video processing helper for creating highlight packages
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Download a video file from URL to temp directory
 * Handles both direct URLs and video-proxy URLs
 * @param {string} url - Video URL (can be direct or /api/video-proxy?url=...)
 * @param {string} filename - Output filename
 * @returns {Promise<string>} - Path to downloaded file
 */
export async function downloadVideo(url, filename) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights');
  await fs.mkdir(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, filename);

  // Extract actual video URL if this is a video-proxy URL
  let actualUrl = url;
  if (url.includes('/api/video-proxy?url=') || url.includes('video-proxy?url=')) {
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
  await fs.writeFile(outputPath, Buffer.from(buffer));

  return outputPath;
}

/**
 * Run ffmpeg command
 * @param {string[]} args - ffmpeg arguments
 * @returns {Promise<void>}
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Simple concatenation using concat demuxer - most reliable for audio
 * No transitions, just joins clips end to end
 * @param {string[]} videoPaths - Array of video file paths
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} - Path to concatenated video
 */
async function concatenateVideosSimple(videoPaths, outputPath) {
  if (videoPaths.length === 1) {
    await fs.copyFile(videoPaths[0], outputPath);
    return outputPath;
  }

  // Create concat list file
  const tempDir = path.dirname(outputPath);
  const listPath = path.join(tempDir, 'concat-list.txt');
  const listContent = videoPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(listPath, listContent);

  await runFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-y',
    outputPath
  ]);

  await fs.unlink(listPath).catch(() => {});
  return outputPath;
}

/**
 * Concatenate multiple video clips with dissolve transitions
 * Uses xfade for video and acrossfade for audio
 * @param {string[]} videoPaths - Array of video file paths
 * @param {string} outputPath - Output file path
 * @param {number} transitionFrames - Number of frames for dissolve (default: 10)
 * @returns {Promise<string>} - Path to concatenated video
 */
export async function concatenateVideos(videoPaths, outputPath, transitionFrames = 10) {
  // If only one video, just copy it
  if (videoPaths.length === 1) {
    await fs.copyFile(videoPaths[0], outputPath);
    return outputPath;
  }

  // 10 frames at ~30fps = 0.333 seconds
  const transitionDuration = transitionFrames / 30;

  // Get durations first
  const durations = [];
  for (const videoPath of videoPaths) {
    const duration = await getVideoDuration(videoPath);
    durations.push(duration);
  }

  // Build filter chain with settb to normalize timebases (required for xfade)
  let filterParts = [];

  // Normalize video timebases
  for (let i = 0; i < videoPaths.length; i++) {
    filterParts.push(`[${i}:v]settb=AVTB,fps=30[v${i}n]`);
  }

  // Build xfade chain for video
  if (videoPaths.length === 2) {
    const offset = durations[0] - transitionDuration;
    filterParts.push(`[v0n][v1n]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(3)}[outv]`);
  } else {
    // Chain multiple xfades
    let cumulativeDuration = durations[0];
    const offset0 = cumulativeDuration - transitionDuration;
    filterParts.push(`[v0n][v1n]xfade=transition=fade:duration=${transitionDuration}:offset=${offset0.toFixed(3)}[vx1]`);

    for (let i = 2; i < videoPaths.length; i++) {
      cumulativeDuration += durations[i - 1] - transitionDuration;
      const offset = cumulativeDuration - transitionDuration;
      const prevLabel = i - 1;

      if (i === videoPaths.length - 1) {
        filterParts.push(`[vx${prevLabel}][v${i}n]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(3)}[outv]`);
      } else {
        filterParts.push(`[vx${prevLabel}][v${i}n]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(3)}[vx${i}]`);
      }
    }
  }

  // For audio: use acrossfade which properly overlaps audio like xfade does for video
  // acrossfade shortens total duration by overlap amount, matching xfade behavior
  for (let i = 0; i < videoPaths.length; i++) {
    filterParts.push(`[${i}:a]aresample=async=1[a${i}n]`);
  }

  if (videoPaths.length === 2) {
    filterParts.push(`[a0n][a1n]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[outa]`);
  } else {
    // Chain multiple acrossfades
    filterParts.push(`[a0n][a1n]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[ax1]`);
    for (let i = 2; i < videoPaths.length; i++) {
      const prevLabel = i - 1;
      if (i === videoPaths.length - 1) {
        filterParts.push(`[ax${prevLabel}][a${i}n]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[outa]`);
      } else {
        filterParts.push(`[ax${prevLabel}][a${i}n]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[ax${i}]`);
      }
    }
  }

  const filterComplex = filterParts.join(';');

  // Build ffmpeg command
  const args = [];
  for (const p of videoPaths) {
    args.push('-i', p);
  }
  args.push(
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    outputPath
  );

  await runFFmpeg(args);
  return outputPath;
}

/**
 * Get video duration using ffprobe
 * @param {string} videoPath - Path to video file
 * @returns {Promise<number>} - Duration in seconds
 */
async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
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
 * Add audio track to video
 * @param {string} videoPath - Input video path
 * @param {string} audioPath - Audio file path (MP3)
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} - Path to output video
 */
export async function addAudioToVideo(videoPath, audioPath, outputPath) {
  await runFFmpeg([
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    '-y',
    outputPath
  ]);

  return outputPath;
}

/**
 * Create a highlight package from MLB video clips
 * @param {Array} highlights - Array of highlight objects with videoUrl
 * @param {Buffer} audioBuffer - Audio narration buffer (MP3)
 * @param {string} gamePk - Game ID for naming
 * @returns {Promise<string>} - Path to final video
 */
export async function createHighlightPackage(highlights, audioBuffer, gamePk) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', gamePk);
  await fs.mkdir(tempDir, { recursive: true });

  // Download all video clips
  const videoPaths = [];
  for (let i = 0; i < highlights.length; i++) {
    const highlight = highlights[i];
    if (highlight.videoUrl) {
      try {
        const videoPath = await downloadVideo(
          highlight.videoUrl,
          `clip-${i}.mp4`
        );
        videoPaths.push(videoPath);
      } catch (error) {
        console.error(`Failed to download clip ${i}:`, error);
      }
    }
  }

  if (videoPaths.length === 0) {
    throw new Error('No video clips could be downloaded');
  }

  // Concatenate all clips
  const concatenatedPath = path.join(tempDir, 'concatenated.mp4');
  await concatenateVideos(videoPaths, concatenatedPath);

  // Save audio to file
  const audioPath = path.join(tempDir, 'narration.mp3');
  await fs.writeFile(audioPath, audioBuffer);

  // Add audio to video
  const finalPath = path.join(tempDir, `highlight-package-${gamePk}.mp4`);
  await addAudioToVideo(concatenatedPath, audioPath, finalPath);

  // Clean up intermediate files
  for (const videoPath of videoPaths) {
    await fs.unlink(videoPath).catch(() => {});
  }
  await fs.unlink(concatenatedPath).catch(() => {});
  await fs.unlink(audioPath).catch(() => {});

  return finalPath;
}

/**
 * Trim video to specific duration
 * @param {string} inputPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {number} startTime - Start time in seconds
 * @param {number} duration - Duration in seconds
 * @returns {Promise<string>} - Path to trimmed video
 */
export async function trimVideo(inputPath, outputPath, startTime, duration) {
  await runFFmpeg([
    '-i', inputPath,
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-c', 'copy',
    '-y',
    outputPath
  ]);

  return outputPath;
}

/**
 * Clean up temp files for a game
 * @param {string} gamePk - Game ID
 */
export async function cleanupTempFiles(gamePk) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', gamePk);
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to clean up temp files:', error);
  }
}

/**
 * Create a synced highlight package with audio ducking
 * Narration is positioned relative to action timestamps in each clip
 *
 * @param {Array} clipsWithAnalysis - Clips with Gemini timing analysis
 * @param {Array} audioSegments - Array of {audioBuffer, timing, clipId, startOffset}
 * @param {string} gamePk - Game ID for naming
 * @returns {Promise<string>} - Path to final video
 */
export async function createSyncedPackage(clipsWithAnalysis, audioSegments, gamePk) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', gamePk);
  await fs.mkdir(tempDir, { recursive: true });

  // Step 1: Download and trim all video clips
  const processedClips = [];
  let totalDuration = 0;

  for (let i = 0; i < clipsWithAnalysis.length; i++) {
    const clip = clipsWithAnalysis[i];
    if (!clip.videoUrl) continue;

    try {
      // Download original clip
      const originalPath = await downloadVideo(clip.videoUrl, `original-${i}.mp4`);

      // Get trim points from analysis
      const analysis = clip.analysis || {};
      const clipDuration = await getVideoDuration(originalPath);

      // Calculate trim: keep action with buffer
      const actionStart = analysis.action_start_seconds || 0;
      const actionEnd = analysis.action_end_seconds || clipDuration;
      const buffer = 1.5; // seconds before/after action

      const trimStart = Math.max(0, actionStart - buffer);
      const trimEnd = Math.min(clipDuration, actionEnd + buffer);
      const trimDuration = trimEnd - trimStart;

      // Trim the clip
      const trimmedPath = path.join(tempDir, `trimmed-${i}.mp4`);
      await trimVideo(originalPath, trimmedPath, trimStart, trimDuration);

      processedClips.push({
        clipId: clip.id,
        path: trimmedPath,
        duration: trimDuration,
        startInFinal: totalDuration,
        actionPeakInClip: (analysis.action_peak_seconds || actionStart + 1) - trimStart,
        originalPath,
      });

      totalDuration += trimDuration;
    } catch (error) {
      console.error(`Failed to process clip ${i}:`, error);
    }
  }

  if (processedClips.length === 0) {
    throw new Error('No clips could be processed');
  }

  // Step 2: Concatenate trimmed clips
  const concatenatedPath = path.join(tempDir, 'concatenated.mp4');
  await concatenateVideos(processedClips.map(c => c.path), concatenatedPath);

  // Step 3: Save all audio segments as files
  const audioFiles = [];
  for (let i = 0; i < audioSegments.length; i++) {
    const segment = audioSegments[i];
    const audioPath = path.join(tempDir, `narration-${i}.mp3`);
    await fs.writeFile(audioPath, segment.audioBuffer);

    // Find the clip this audio belongs to
    const clipInfo = processedClips.find(c => c.clipId === segment.clipId);
    if (!clipInfo) continue;

    // Calculate when to start this audio in the final video
    let audioStartTime;
    if (segment.timing === 'before_action') {
      // Start before the action peak
      audioStartTime = clipInfo.startInFinal + clipInfo.actionPeakInClip - segment.duration - 0.5;
    } else if (segment.timing === 'during_action') {
      // Start at action peak
      audioStartTime = clipInfo.startInFinal + clipInfo.actionPeakInClip;
    } else if (segment.timing === 'after_action') {
      // Start after action peak
      audioStartTime = clipInfo.startInFinal + clipInfo.actionPeakInClip + 1;
    } else if (segment.timing === 'bridge') {
      // Bridge plays at the start of the clip
      audioStartTime = clipInfo.startInFinal;
    } else {
      // Default: proportional position
      audioStartTime = clipInfo.startInFinal + (segment.startOffset || 0);
    }

    audioFiles.push({
      path: audioPath,
      startTime: Math.max(0, audioStartTime),
      duration: segment.duration,
    });
  }

  // Step 4: Build complex FFmpeg filter for audio mixing with ducking
  const finalPath = path.join(tempDir, `synced-${gamePk}.mp4`);

  if (audioFiles.length === 0) {
    // No narration, just use video with original audio at reduced volume
    await runFFmpeg([
      '-i', concatenatedPath,
      '-af', 'volume=0.7',
      '-c:v', 'copy',
      '-y',
      finalPath
    ]);
  } else {
    // Complex mix with ducking
    await mixAudioWithDucking(concatenatedPath, audioFiles, finalPath, totalDuration);
  }

  // Cleanup intermediate files
  for (const clip of processedClips) {
    await fs.unlink(clip.originalPath).catch(() => {});
    await fs.unlink(clip.path).catch(() => {});
  }
  await fs.unlink(concatenatedPath).catch(() => {});
  for (const audio of audioFiles) {
    await fs.unlink(audio.path).catch(() => {});
  }

  return finalPath;
}

/**
 * Mix multiple audio segments with video, applying ducking to original audio
 * @param {string} videoPath - Path to video with original audio
 * @param {Array} audioFiles - Array of {path, startTime, duration}
 * @param {string} outputPath - Output file path
 * @param {number} totalDuration - Total video duration
 */
async function mixAudioWithDucking(videoPath, audioFiles, outputPath, totalDuration) {
  // Build input arguments
  const inputs = ['-i', videoPath];
  for (const audio of audioFiles) {
    inputs.push('-i', audio.path);
  }

  // Build filter complex
  // 1. Extract video's original audio and apply base ducking
  // 2. Delay each narration audio to its start time
  // 3. Mix all together

  const filterParts = [];

  // Original audio (ducked to 20% during narration)
  // Create a volume envelope that ducks during narration times
  const volumeKeyframes = buildDuckingKeyframes(audioFiles, totalDuration);
  filterParts.push(`[0:a]volume='${volumeKeyframes}':eval=frame[bg]`);

  // Delay each narration to its position and boost volume
  const delayedAudios = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const delayMs = Math.round(audioFiles[i].startTime * 1000);
    // Boost narration to 2x volume so it's prominent over stadium audio
    filterParts.push(`[${i + 1}:a]volume=2.0,adelay=${delayMs}|${delayMs}[a${i}]`);
    delayedAudios.push(`[a${i}]`);
  }

  // Mix all audio together with normalize=0 to prevent volume reduction
  // Then boost the final output to compensate
  const allInputs = ['[bg]', ...delayedAudios].join('');
  filterParts.push(`${allInputs}amix=inputs=${audioFiles.length + 1}:duration=first:dropout_transition=2:normalize=0,volume=1.5[aout]`);

  const filterComplex = filterParts.join(';');

  await runFFmpeg([
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-y',
    outputPath
  ]);
}

/**
 * Build FFmpeg volume keyframes expression for ducking
 * @param {Array} audioFiles - Narration segments with timing
 * @param {number} totalDuration - Total duration
 * @returns {string} - FFmpeg volume expression
 */
function buildDuckingKeyframes(audioFiles, totalDuration) {
  // Simple approach: duck to 20% whenever narration is playing
  // For more precision, would use enable expressions

  // Build a piecewise expression
  // if(between(t,start1,end1),0.2,if(between(t,start2,end2),0.2,...,0.7))

  if (audioFiles.length === 0) {
    return '0.7'; // No ducking needed
  }

  // Sort by start time
  const sorted = [...audioFiles].sort((a, b) => a.startTime - b.startTime);

  // Build nested if expression
  let expr = '0.7'; // Default volume when not ducking
  for (let i = sorted.length - 1; i >= 0; i--) {
    const seg = sorted[i];
    const start = seg.startTime.toFixed(2);
    const end = (seg.startTime + seg.duration + 0.5).toFixed(2); // Extra 0.5s tail
    expr = `if(between(t,${start},${end}),0.2,${expr})`;
  }

  return expr;
}

/**
 * Get audio duration using ffprobe
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<number>} - Duration in seconds
 */
export async function getAudioDuration(audioPath) {
  return getVideoDuration(audioPath); // Same ffprobe command works for audio
}

/**
 * Trim video to include only the segments where specific words are selected
 * Uses word timestamps to create precise cuts with audio crossfades
 *
 * @param {string} inputPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {Array<{start: number, end: number}>} segments - Segments to keep
 * @returns {Promise<string>} - Path to trimmed video
 */
export async function trimToSegments(inputPath, outputPath, segments) {
  if (!segments || segments.length === 0) {
    throw new Error('No segments to trim');
  }

  // If single segment, simple trim
  if (segments.length === 1) {
    const { start, end } = segments[0];
    await runFFmpeg([
      '-i', inputPath,
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-af', 'afade=t=in:st=0:d=0.1,afade=t=out:st=' + (end - start - 0.1).toFixed(3) + ':d=0.1',
      '-y',
      outputPath
    ]);
    return outputPath;
  }

  // Multiple segments - need to extract each and concat
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', 'segments');
  await fs.mkdir(tempDir, { recursive: true });

  const segmentPaths = [];

  for (let i = 0; i < segments.length; i++) {
    const { start, end } = segments[i];
    const segmentPath = path.join(tempDir, `segment-${i}.mp4`);
    const duration = end - start;

    await runFFmpeg([
      '-i', inputPath,
      '-ss', start.toFixed(3),
      '-to', end.toFixed(3),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      // Add audio fades at segment boundaries
      '-af', `afade=t=in:st=0:d=0.05,afade=t=out:st=${(duration - 0.05).toFixed(3)}:d=0.05`,
      '-y',
      segmentPath
    ]);

    segmentPaths.push(segmentPath);
  }

  // Concatenate all segments using simple concat (no transitions within a clip)
  await concatenateVideosSimple(segmentPaths, outputPath);

  // Cleanup segment files
  for (const segPath of segmentPaths) {
    await fs.unlink(segPath).catch(() => {});
  }

  return outputPath;
}

/**
 * Create a highlight video from multiple clips with selected word segments
 *
 * @param {Array} clipsWithSelections - Array of {videoUrl, segments} or {isTransition, transitionPath}
 * @param {string} gamePk - Game ID for naming
 * @param {string} titleCardUrl - Optional URL to highlight video with title card intro
 * @returns {Promise<string>} - Path to final video
 */
export async function createRundownVideo(clipsWithSelections, gamePk, titleCardUrl = null) {
  const tempDir = path.join(os.tmpdir(), 'mlb-highlights', gamePk);
  await fs.mkdir(tempDir, { recursive: true });

  const trimmedPaths = [];
  const filesToCleanup = [];

  // If we have a title card URL, extract first 1.2 seconds
  if (titleCardUrl) {
    try {
      console.log('Adding title card from highlights video...');
      const titleCardDownload = await downloadVideo(titleCardUrl, 'title-card-source.mp4');
      const titleCardPath = path.join(tempDir, 'title-card.mp4');

      // Extract first 1.5 seconds with audio fade out
      await runFFmpeg([
        '-i', titleCardDownload,
        '-t', '1.5',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-af', 'afade=t=out:st=1.2:d=0.3',
        '-y',
        titleCardPath
      ]);

      trimmedPaths.push(titleCardPath);
      filesToCleanup.push(titleCardPath);
      await fs.unlink(titleCardDownload).catch(() => {});
    } catch (error) {
      console.error('Failed to extract title card:', error);
      // Continue without title card
    }
  }

  for (let i = 0; i < clipsWithSelections.length; i++) {
    const clip = clipsWithSelections[i];

    // Handle inning transition clips (local files, no processing needed)
    if (clip.isTransition && clip.transitionPath) {
      try {
        // Verify file exists
        await fs.access(clip.transitionPath);
        // Add the transition path directly - no need to copy/process
        trimmedPaths.push(clip.transitionPath);
        // Don't add to cleanup - these are source files, not temp files
        console.log(`Added transition: ${path.basename(clip.transitionPath)}`);
      } catch (error) {
        console.error(`Transition file not accessible: ${clip.transitionPath}`, error);
      }
      continue;
    }

    // Handle regular play clips with segments
    const { videoUrl, segments } = clip;

    if (!segments || segments.length === 0) continue;

    try {
      // Download video
      const downloadedPath = await downloadVideo(videoUrl, `clip-${i}.mp4`);

      // Trim to selected segments
      const trimmedPath = path.join(tempDir, `trimmed-${i}.mp4`);
      await trimToSegments(downloadedPath, trimmedPath, segments);

      trimmedPaths.push(trimmedPath);
      filesToCleanup.push(trimmedPath);

      // Cleanup downloaded file
      await fs.unlink(downloadedPath).catch(() => {});
    } catch (error) {
      console.error(`Failed to process clip ${i}:`, error);
    }
  }

  if (trimmedPaths.length === 0) {
    throw new Error('No clips could be processed');
  }

  // Concatenate all trimmed clips (title card + transitions + clips with dissolve transitions)
  const finalPath = path.join(tempDir, `rundown-${gamePk}.mp4`);
  await concatenateVideos(trimmedPaths, finalPath);

  // Cleanup temp files only (not transition source files)
  for (const filePath of filesToCleanup) {
    await fs.unlink(filePath).catch(() => {});
  }

  return finalPath;
}
