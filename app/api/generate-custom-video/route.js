import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createSyncedPackage, cleanupTempFiles } from '@/lib/video-processor';
import { generateSpeech, DEFAULT_VOICE_ID } from '@/lib/elevenlabs';
import Anthropic from '@anthropic-ai/sdk';
import { getTeam } from '@/lib/teams';

const anthropic = new Anthropic();

/**
 * Generate a custom highlight video from user-selected clips
 * Uses Film Room clips selected by the user
 */
export async function POST(request) {
  let gamePk = null;

  try {
    const {
      gameData,
      clips, // User-selected clips from Film Room
      style = 'excited',
      voiceId,
      gamePk: gPk,
    } = await request.json();

    gamePk = gPk;

    if (!clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'No clips provided' },
        { status: 400 }
      );
    }

    console.log(`Generating custom video with ${clips.length} user-selected clips...`);

    // Build context for script generation
    const awayTeam = getTeam(gameData?.teams?.away?.id);
    const homeTeam = getTeam(gameData?.teams?.home?.id);
    const awayScore = gameData?.teams?.away?.score || 0;
    const homeScore = gameData?.teams?.home?.score || 0;

    // Format clips for the script prompt
    const clipsInfo = clips.map((clip, index) => {
      const isTopInning = clip.halfInning === 'top';
      const batterTeam = isTopInning ? awayTeam?.name : homeTeam?.name;

      return `CLIP ${index + 1}:
  - ID: ${clip.id}
  - Event: ${clip.event || 'Play'}
  - Batter: ${clip.batter || 'Unknown'}
  - Batter's Team: ${batterTeam || 'Unknown'}
  - Inning: ${clip.halfInning === 'top' ? 'Top' : 'Bottom'} ${clip.inning}
  - Play Description: ${clip.playDescription || clip.headline || 'N/A'}`;
    }).join('\n\n');

    const styleInstructions = {
      excited: `EXCITED sports broadcaster style. Dramatic pauses (...), exclamations, build tension.`,
      analytical: `Analytical commentator style. Reference stats, situational baseball. Measured but insightful.`,
      casual: `Casual fan recap style. Conversational, fun, no jargon.`,
    };

    // Generate narration for each clip
    const clipCount = clips.length;
    const clipIds = clips.map(c => c.id);

    const prompt = `Generate EXACTLY ${clipCount} narration segments for an MLB highlight video.

GAME: ${awayTeam?.name || 'Away'} @ ${homeTeam?.name || 'Home'}
FINAL: ${awayScore} - ${homeScore}

YOU MUST CREATE EXACTLY ${clipCount} SEGMENTS:
${clipsInfo}

STYLE: ${styleInstructions[style] || styleInstructions.excited}

RULES:
1. EXACTLY ${clipCount} segments - one per clip
2. Use the EXACT clipId from each clip
3. Each narration is 8-15 words, 2-3 seconds to speak
4. Timing is ALWAYS "after_action" - describe what JUST happened
5. Use the batter's name and their CORRECT team
6. NO intro, NO title - just describe the plays

Return ONLY a JSON array:
[
  {"clipId": "${clipIds[0]}", "narration": "short description", "timing": "after_action", "estimatedSeconds": 2.5},
  ...
]`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let segments;
    try {
      let jsonStr = message.content[0].text;
      if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      segments = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse script:', parseError);
      // Create simple fallback narration
      segments = clips.map(clip => ({
        clipId: clip.id,
        narration: `${clip.batter} with a ${clip.event?.toLowerCase() || 'play'}!`,
        timing: 'after_action',
        estimatedSeconds: 2,
      }));
    }

    // Filter to valid segments
    const validClipIds = new Set(clips.map(c => c.id));
    const seenClipIds = new Set();
    const filteredSegments = segments.filter(seg => {
      if (seg.clipId && validClipIds.has(seg.clipId) && !seenClipIds.has(seg.clipId)) {
        seenClipIds.add(seg.clipId);
        return true;
      }
      return false;
    });

    console.log(`Generated ${filteredSegments.length} narration segments, creating audio...`);

    // Generate audio for each segment
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
    const audioSegments = [];

    for (const segment of filteredSegments) {
      if (!segment.narration) continue;

      try {
        const audioBuffer = await generateSpeech(
          segment.narration,
          selectedVoiceId,
          style
        );

        // Get duration (estimate based on text length)
        const duration = segment.estimatedSeconds || (segment.narration.length / 15);

        audioSegments.push({
          clipId: segment.clipId,
          audioBuffer,
          timing: 'after_action',
          duration,
          narration: segment.narration,
        });
      } catch (error) {
        console.error('Failed to generate audio for segment:', error);
      }
    }

    // Prepare clips with analysis format (for video processor)
    const clipsWithAnalysis = clips.map(clip => ({
      id: clip.id,
      videoUrl: clip.videoUrl,
      headline: clip.headline,
      event: clip.event,
      batter: clip.batter,
      playDescription: clip.playDescription,
      inning: clip.inning,
      halfInning: clip.halfInning,
      analysis: {
        // Default timing - assumes action is in middle of clip
        action_start_seconds: 1,
        action_peak_seconds: 3,
        action_end_seconds: 5,
        total_duration_seconds: 10,
      },
    }));

    console.log(`Assembling video with ${audioSegments.length} audio segments...`);

    // Create the video package
    const videoPath = await createSyncedPackage(clipsWithAnalysis, audioSegments, gamePk || 'custom');

    // Read and return final video
    const videoBuffer = await fs.readFile(videoPath);
    const base64Video = videoBuffer.toString('base64');

    // Cleanup
    await cleanupTempFiles(gamePk || 'custom');

    return NextResponse.json({
      video: base64Video,
      format: 'mp4',
      clipsUsed: clips.length,
      segmentsGenerated: audioSegments.length,
    });
  } catch (error) {
    console.error('Error generating custom video:', error);

    if (gamePk) {
      await cleanupTempFiles(gamePk);
    }

    return NextResponse.json(
      { error: 'Failed to generate video', details: error.message },
      { status: 500 }
    );
  }
}
