import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getTeam, getRivalry } from '@/lib/teams';

const anthropic = new Anthropic();

/**
 * Generate a segment-based script that syncs with video clips
 * Each segment corresponds to a video clip with timing information
 */
export async function POST(request) {
  try {
    const {
      gameData,
      clipsWithAnalysis, // Video clips with Gemini timing analysis
      playsWithoutClips, // Plays to use as bridge narration
      style = 'excited',
    } = await request.json();

    if (!gameData || !clipsWithAnalysis || clipsWithAnalysis.length === 0) {
      return NextResponse.json(
        { error: 'Missing required data (gameData and clipsWithAnalysis)' },
        { status: 400 }
      );
    }

    // Build context
    const awayTeam = getTeam(gameData.teams?.away?.id);
    const homeTeam = getTeam(gameData.teams?.home?.id);
    const rivalry = getRivalry(gameData.teams?.away?.id, gameData.teams?.home?.id);

    const awayScore = gameData.teams?.away?.score || 0;
    const homeScore = gameData.teams?.home?.score || 0;
    const winner = awayScore > homeScore ? 'away' : 'home';
    const winnerName = winner === 'away' ? awayTeam?.name : homeTeam?.name;

    // Format clips with timing for the prompt
    const clipsInfo = clipsWithAnalysis.map((clip, index) => {
      const analysis = clip.analysis || {};
      const duration = analysis.total_duration_seconds || clip.duration || 10;
      const actionPeak = analysis.action_peak_seconds || duration / 2;

      return `CLIP ${index + 1}:
  - ID: ${clip.id}
  - Event: ${clip.event || 'Play'}
  - Batter: ${clip.batter || 'Unknown'}
  - Batter's Team: ${clip.batterTeam || 'Unknown'}
  - Inning: ${clip.halfInning === 'top' ? 'Top' : 'Bottom'} ${clip.inning}
  - Play Description: ${clip.playDescription || 'N/A'}
  - Duration: ${duration.toFixed(1)} seconds`;
    }).join('\n\n');

    // Format plays without clips (for bridge narration)
    const bridgePlays = playsWithoutClips?.map(play => {
      return `- ${play.result?.description || play.description}`;
    }).join('\n') || 'None';

    const styleInstructions = {
      excited: `EXCITED sports broadcaster style. Dramatic pauses (...), exclamations, build tension. "CAN YOU BELIEVE IT?!", "GONE!", "What a moment!"`,
      analytical: `Analytical commentator style. Reference stats, launch angles, situational baseball. Measured but insightful.`,
      casual: `Casual fan recap style. Conversational, fun, no jargon. Tell the story naturally.`,
    };

    const clipCount = clipsWithAnalysis.length;
    const clipIds = clipsWithAnalysis.map(c => c.id);

    const prompt = `Generate EXACTLY ${clipCount} narration segments for an MLB highlight video. One segment per video clip, no more, no less.

GAME: ${awayTeam?.name || 'Away'} @ ${homeTeam?.name || 'Home'}
FINAL: ${awayScore} - ${homeScore} (${winnerName} wins)
${rivalry ? `RIVALRY: ${rivalry.name}` : ''}

YOU MUST CREATE EXACTLY ${clipCount} SEGMENTS, ONE FOR EACH CLIP:
${clipsInfo}

STYLE: ${styleInstructions[style] || styleInstructions.excited}

RULES:
1. EXACTLY ${clipCount} segments in the output array - one per clip
2. Use the EXACT clipId from each clip (listed above)
3. Each narration is 8-15 words, 2-3 seconds to speak
4. Timing is ALWAYS "after_action" - describe what JUST happened
5. Use the batter's name and their CORRECT team from the clip info
6. NO intro, NO title, NO "welcome to" - just describe the plays

Return ONLY a JSON array with EXACTLY ${clipCount} objects:
[
  {"clipId": "${clipIds[0] || 'first-clip-id'}", "narration": "short description of what happened", "timing": "after_action", "estimatedSeconds": 2.5},
  ...${clipCount > 1 ? ` (${clipCount - 1} more objects, one for each remaining clip)` : ''}
]`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const responseText = message.content[0].text;

    // Parse JSON from response
    let segments;
    try {
      // Handle potential markdown wrapping
      let jsonStr = responseText;
      if (responseText.includes('```')) {
        jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      segments = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse script segments:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse generated script', details: parseError.message },
        { status: 500 }
      );
    }

    // ENFORCE: Only keep segments that match our clip IDs, limit to one per clip
    const validClipIds = new Set(clipsWithAnalysis.map(c => c.id));
    const seenClipIds = new Set();
    const filteredSegments = [];

    for (const segment of segments) {
      // Only keep segments with valid clipIds we haven't seen yet
      if (segment.clipId && validClipIds.has(segment.clipId) && !seenClipIds.has(segment.clipId)) {
        seenClipIds.add(segment.clipId);
        filteredSegments.push(segment);
      }
    }

    // If we have fewer segments than clips, that's fine - some clips won't have narration
    // If we have more (shouldn't happen after filtering), something is wrong
    console.log(`Script generation: ${segments.length} raw segments -> ${filteredSegments.length} filtered (expected ${clipsWithAnalysis.length})`);

    // Validate and enhance segments
    const enhancedSegments = filteredSegments.map((segment, index) => ({
      ...segment,
      index,
      clipInfo: clipsWithAnalysis.find(c => c.id === segment.clipId) || null,
    }));

    return NextResponse.json({
      segments: enhancedSegments,
      totalClips: clipsWithAnalysis.length,
      style,
    });
  } catch (error) {
    console.error('Error generating synced script:', error);
    return NextResponse.json(
      { error: 'Failed to generate script', details: error.message },
      { status: 500 }
    );
  }
}
