import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { analyzeClips, cleanupAnalysisFiles } from '@/lib/gemini-video';
import { createSyncedPackage, cleanupTempFiles, getAudioDuration } from '@/lib/video-processor';
import { generateSpeech, DEFAULT_VOICE_ID } from '@/lib/elevenlabs';

/**
 * Generate a synchronized video package with:
 * 1. Gemini video analysis for action timestamps
 * 2. Segment-based script generation
 * 3. Per-segment voice generation
 * 4. Audio ducking and sync
 */
export async function POST(request) {
  let gamePk = null;

  try {
    const {
      gameData,
      keyPlays, // Plays with matched highlights
      style = 'excited',
      voiceId,
      gamePk: gPk,
    } = await request.json();

    gamePk = gPk;

    // Step 1: Filter to plays with matched video clips
    const playsWithVideos = keyPlays.filter(p => p.matchedHighlight?.videoUrl);
    const playsWithoutVideos = keyPlays.filter(p => !p.matchedHighlight?.videoUrl);

    if (playsWithVideos.length === 0) {
      return NextResponse.json(
        { error: 'No video clips available for this game' },
        { status: 400 }
      );
    }

    // Limit to top 5 clips to keep video reasonable length
    const clipsToUse = playsWithVideos.slice(0, 5).map(play => {
      // Determine batter's team from the half inning
      // Top of inning = away team batting, Bottom = home team batting
      const isTopInning = play.about?.halfInning === 'top';
      const batterTeamId = isTopInning ? gameData.teams?.away?.id : gameData.teams?.home?.id;
      const batterTeamName = isTopInning ? gameData.teams?.away?.name : gameData.teams?.home?.name;

      return {
        id: play.matchedHighlight.id,
        videoUrl: play.matchedHighlight.videoUrl,
        headline: play.matchedHighlight.headline,
        event: play.result?.event,
        batter: play.matchup?.batter?.fullName,
        batterTeam: batterTeamName,
        playDescription: play.result?.description,
        inning: play.about?.inning,
        halfInning: play.about?.halfInning,
      };
    });

    console.log(`Analyzing ${clipsToUse.length} video clips with Gemini...`);

    // Step 2: Analyze clips with Gemini
    const clipsWithAnalysis = await analyzeClips(clipsToUse);

    console.log('Gemini analysis complete, generating synced script...');

    // Step 3: Generate segment-based script
    const scriptResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/generate-synced-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameData,
        clipsWithAnalysis,
        playsWithoutClips: playsWithoutVideos.slice(0, 3), // Use up to 3 as bridges
        style,
      }),
    });

    if (!scriptResponse.ok) {
      const err = await scriptResponse.json();
      throw new Error(`Script generation failed: ${err.error}`);
    }

    const { segments } = await scriptResponse.json();

    console.log(`Generated ${segments.length} narration segments, creating audio...`);

    // Step 4: Generate audio for each segment
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
    const audioSegments = [];

    for (const segment of segments) {
      if (!segment.narration) continue;

      try {
        const audioBuffer = await generateSpeech(
          segment.narration,
          selectedVoiceId,
          style
        );

        // Get actual audio duration
        const tempPath = `/tmp/temp-audio-${Date.now()}.mp3`;
        await fs.writeFile(tempPath, audioBuffer);
        const duration = await getAudioDuration(tempPath);
        await fs.unlink(tempPath);

        audioSegments.push({
          clipId: segment.clipId,
          audioBuffer,
          timing: segment.timing || 'before_action',
          duration,
          narration: segment.narration,
        });
      } catch (error) {
        console.error(`Failed to generate audio for segment:`, error);
      }
    }

    console.log(`Created ${audioSegments.length} audio segments, assembling video...`);

    // Step 5: Create synced video package
    const videoPath = await createSyncedPackage(clipsWithAnalysis, audioSegments, gamePk);

    // Step 6: Read and return final video
    const videoBuffer = await fs.readFile(videoPath);
    const base64Video = videoBuffer.toString('base64');

    // Cleanup
    await cleanupTempFiles(gamePk);
    await cleanupAnalysisFiles();

    return NextResponse.json({
      video: base64Video,
      format: 'mp4',
      clipsUsed: clipsWithAnalysis.length,
      segmentsGenerated: audioSegments.length,
      synced: true,
    });
  } catch (error) {
    console.error('Error generating synced video:', error);

    // Cleanup on error
    if (gamePk) {
      await cleanupTempFiles(gamePk);
    }
    await cleanupAnalysisFiles();

    return NextResponse.json(
      { error: 'Failed to generate video', details: error.message },
      { status: 500 }
    );
  }
}
