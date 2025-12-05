import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getTeam, getRivalry } from '@/lib/teams';
import { SCRIPT_STYLES, SCRIPT_LENGTHS } from '@/lib/script-config';

const anthropic = new Anthropic();

export async function POST(request) {
  try {
    const { gameData, keyPlays, biggestSwings, gameSummary, style, length, highlights } = await request.json();

    if (!gameData || !keyPlays) {
      return NextResponse.json(
        { error: 'Missing required data' },
        { status: 400 }
      );
    }

    const styleConfig = SCRIPT_STYLES.find(s => s.id === style) || SCRIPT_STYLES[0];
    const lengthConfig = SCRIPT_LENGTHS.find(l => l.id === length) || SCRIPT_LENGTHS[1];

    // Build context
    const awayTeam = getTeam(gameData.teams?.away?.id);
    const homeTeam = getTeam(gameData.teams?.home?.id);
    const rivalry = getRivalry(gameData.teams?.away?.id, gameData.teams?.home?.id);

    const awayScore = gameData.teams?.away?.score || 0;
    const homeScore = gameData.teams?.home?.score || 0;
    const winner = awayScore > homeScore ? 'away' : 'home';
    const winnerName = winner === 'away' ? awayTeam?.name : homeTeam?.name;
    const loserName = winner === 'away' ? homeTeam?.name : awayTeam?.name;

    // Format key plays for the prompt
    const playsDescription = keyPlays.map(play => {
      const inningLabel = `${play.about?.halfInning === 'top' ? 'Top' : 'Bottom'} ${play.about?.inning}`;
      const wpInfo = play.wpChange >= 0.15 ? ` (${Math.round(play.wpChange * 100)}% win probability swing)` : '';
      return `- ${inningLabel}: ${play.result?.description}${wpInfo}`;
    }).join('\n');

    // Format biggest swings
    const swingsDescription = biggestSwings?.slice(0, 3).map(swing => {
      return `- ${swing.event} by ${swing.batter}: ${Math.round(swing.wpChange * 100)}% WP swing`;
    }).join('\n') || 'No major momentum swings';

    // Build the prompt
    const styleInstructions = {
      excited: `You are an EXCITED sports broadcaster delivering highlights! Use dramatic pauses (indicated by "..."), exclamations, and build tension. Channel your inner Joe Buck or Matty V. Be enthusiastic and make every big play feel ELECTRIC. Use phrases like "CAN YOU BELIEVE IT?!", "GONE!", "What a moment!"`,
      analytical: `You are an analytical sports commentator. Focus on the strategic elements, key statistics, and what the numbers tell us. Reference launch angles, exit velocities, and situational baseball. Be measured but insightful. Think Jon Miller meets Baseball Savant.`,
      casual: `You're a fan recapping the game to a friend. Keep it conversational, accessible, and fun. No jargon needed - just tell the story of the game in a way anyone could enjoy. Throw in some personality and maybe a joke or two.`,
    };

    const prompt = `Generate a ${lengthConfig.name} (approximately ${lengthConfig.words} words) highlight script for an MLB game.

STYLE INSTRUCTIONS:
${styleInstructions[style] || styleInstructions.excited}

GAME INFORMATION:
- ${awayTeam?.name || 'Away'} @ ${homeTeam?.name || 'Home'}
- Final Score: ${awayScore} - ${homeScore}
- Winner: ${winnerName}
- Venue: ${gameData.venue?.name || 'Unknown'}
${rivalry ? `- RIVALRY GAME: ${rivalry.name} (${rivalry.intensity} intensity)` : ''}

GAME STATS:
- Home Runs: ${gameSummary?.homeRuns || 0}
- Strikeouts: ${gameSummary?.strikeouts || 0}
- Total Scoring Plays: ${gameSummary?.scoringPlays || 0}

KEY PLAYS (in chronological order):
${playsDescription}

BIGGEST MOMENTUM SWINGS:
${swingsDescription}

INSTRUCTIONS:
1. Write a cohesive narrative that covers the key moments of the game
2. Build from early action to the climax and conclusion
3. Include player names and key stats when relevant
4. Keep it to approximately ${lengthConfig.words} words
5. Make it feel like a real broadcast highlight package
6. If this is a rivalry game, acknowledge the significance
7. End with a memorable closing line about the winner

Write the script now:`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const script = message.content[0].text;

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error generating script:', error);
    return NextResponse.json(
      { error: 'Failed to generate script', details: error.message },
      { status: 500 }
    );
  }
}
