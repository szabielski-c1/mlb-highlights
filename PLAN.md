# MLB Highlight Package Generator - Implementation Plan

## Overview
Build a Next.js app that generates professional announcer scripts for MLB game highlights by analyzing play-by-play data from the MLB Stats API, with future capability to create video highlight packages with AI voice narration.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS + MLB-inspired dark theme design
- **AI Script Generation**: Claude API (Anthropic)
- **Future Voice**: ElevenLabs
- **Data Source**: MLB Stats API (free, no auth required)

## MLB API Endpoints (Confirmed Working)
- Schedule: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD`
- Live Game Feed: `https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live`
- Highlights/Clips: `https://statsapi.mlb.com/api/v1/game/{gamePk}/content`

## Key Data Available Per Play
- Event type (Home Run, Strikeout, Double, etc.)
- Batter/Pitcher names
- Inning and half-inning
- isScoringPlay flag
- Hit data: launch speed, launch angle, distance
- RBI count
- Full play description

## Phase 1: MVP (Script Generator)

### MVP Features
1. **Date picker** - Browse games by date, shortcuts for today/yesterday
2. **Games grid** - All games for selected date with scores, team logos
3. **Team filter** - Filter games by favorite team
4. **Key plays detection** - Automatic identification of highlight-worthy moments
5. **Win probability swings** - Identify biggest momentum shifts in game
6. **Script generation options**:
   - Style: Excited broadcaster / Analytical / Casual fan recap
   - Length: 30 sec / 60 sec / 2 min
7. **Player context** - Include season stats in narration
8. **Series/rivalry context** - Playoff implications, historic rivalries
9. **Share functionality** - Copy link to specific game's script
10. **Timestamp mapping** - Link each key play to its video clip URL

### Files to Create

```
mlb-highlights/
├── app/
│   ├── layout.js              # Root layout with metadata
│   ├── page.js                # Date picker + games list
│   ├── game/[gamePk]/page.js  # Game detail + script generation
│   ├── globals.css            # Tailwind imports
│   ├── api/
│   │   ├── schedule/route.js  # Proxy to MLB schedule API
│   │   ├── game/[gamePk]/route.js      # Fetch game feed data
│   │   └── generate-script/route.js    # Claude API for script gen
│   └── components/
│       ├── DatePicker.js      # Horizontal scrollable date bar
│       ├── GameCard.js        # Game summary card (teams, score, logos)
│       ├── GamesList.js       # Grid of GameCards with team filter
│       ├── TeamFilter.js      # Dropdown/pills to filter by team
│       ├── KeyPlays.js        # Timeline of key plays with badges
│       ├── ScriptOptions.js   # Style + length selectors
│       ├── ScriptDisplay.js   # Generated script with copy/share
│       └── ShareButton.js     # Copy link functionality
├── lib/
│   ├── mlb-api.js             # MLB API helper functions
│   ├── play-analyzer.js       # Logic to identify key plays
│   ├── win-probability.js     # Calculate win prob swings
│   └── teams.js               # Team metadata (logos, colors, rivalries)
├── package.json
├── tailwind.config.js
├── next.config.js
└── .env.local                 # ANTHROPIC_API_KEY
```

### Implementation Steps

#### Step 1: Project Setup
- Initialize Next.js with Tailwind
- Configure environment for Anthropic API key

#### Step 2: MLB API Integration (`lib/mlb-api.js`)
- `getSchedule(date)` - Fetch games for a date
- `getGameFeed(gamePk)` - Fetch full play-by-play data
- `getHighlights(gamePk)` - Fetch available video clips

#### Step 3: Play Analysis (`lib/play-analyzer.js`)
- Identify key plays based on:
  - Scoring plays (isScoringPlay: true)
  - Home runs, triples
  - High exit velocity hits (>100 mph)
  - Strikeouts in key situations (bases loaded, 2 outs)
  - Game-changing moments (lead changes, tie-breaking runs)
  - Defensive gems (double plays with runners on)
- Score each play by "highlight-worthiness"
- Return top N plays ranked by importance

#### Step 3b: Win Probability Analysis (`lib/win-probability.js`)
- Track win probability changes throughout game
- Identify biggest swings (plays that shifted WP by >15%)
- Flag "turning point" moments for script emphasis

#### Step 3c: Context Enrichment (`lib/teams.js`)
- Team metadata: logos, primary/secondary colors
- Rivalry mappings (NYY/BOS, LAD/SFG, CHC/STL, etc.)
- Division standings integration for playoff context
- Player season stats lookup for narrative

#### Step 4: Home Page (`app/page.js`)
- Horizontal scrollable date picker with today/yesterday shortcuts
- Team filter dropdown/pills
- Fetch and display games for selected date
- Show team logos, names, final scores
- Click game → navigate to game detail

#### Step 5: Game Detail Page (`app/game/[gamePk]/page.js`)
- Show game summary (teams, final score, venue)
- Display rivalry/playoff context if applicable
- Timeline of key plays with:
  - Play type badges (HR, K, 2B, etc.)
  - Win probability impact indicator
  - Link to video clip (from content API)
- Script options panel:
  - Style selector (Excited / Analytical / Casual)
  - Length selector (30s / 60s / 2min)
- "Generate Script" button
- Display generated script with copy/share functionality

#### Step 6: Script Generation (`app/api/generate-script/route.js`)
- Send key plays data to Claude API
- Accept style and length parameters
- Prompt engineered for each style:
  - **Excited**: High energy, exclamations, dramatic pauses
  - **Analytical**: Stats-focused, strategic insights, measured tone
  - **Casual**: Conversational, fan perspective, accessible
- Include in prompt:
  - Player names with season stats
  - Win probability swings for drama
  - Rivalry/playoff context
  - Build narrative arc (early action → turning points → conclusion)
- Length targeting: 30s (~75 words) / 60s (~150 words) / 2min (~300 words)

## Phase 2: Future Enhancements (Not in MVP)

### Video Integration
- Fetch individual play clips from MLB content API
- Stitch clips together using ffmpeg or cloud video service
- Sync with generated script timing

### AI Voice Narration
- ElevenLabs API integration
- Sports announcer voice selection
- Generate audio from script
- Merge audio with video clips

### Additional Features
- Save/share generated packages
- Customize script style (excited, analytical, casual)
- Team-specific focus option
- Season highlight compilations

## Environment Variables Required
```
ANTHROPIC_API_KEY=sk-ant-...
```

## UI/UX Design - MLB-Inspired Dark Theme

### Design Language
- **Color Palette**:
  - Primary background: Deep navy (#041E42 - MLB blue)
  - Secondary: Dark charcoal (#1a1a2e)
  - Accent: MLB red (#BF0D3E) for highlights/CTAs
  - Text: White/light gray
  - Success states: Green (#00A651)
- **Typography**: Clean sans-serif (Inter or similar), bold headlines
- **Cards**: Subtle gradients, rounded corners, soft shadows
- **Animations**: Smooth transitions, skeleton loaders while fetching

### Component Styling
- **Date Picker**: Sleek horizontal scrollable date bar (like MLB app)
- **Game Cards**:
  - Team logos prominently displayed
  - Live score styling with inning indicator
  - Gradient backgrounds per team colors (optional)
  - Hover effects with subtle scale/glow
- **Key Plays List**:
  - Timeline-style layout
  - Play type badges (HR, K, 2B, etc.)
  - Expandable details
- **Script Display**:
  - Clean reading panel
  - Copy button with toast notification
  - Play/preview voice option (future)

### Layout
- Mobile-first responsive design
- Sticky header with app branding
- Bottom navigation on mobile
- Full-width game grid on desktop

## Key Design Decisions
1. **No video processing in MVP** - Focus on script quality first
2. **Client-side date picker** - Simple, no server state needed
3. **Server-side API calls** - Hide any API keys, handle CORS
4. **Play ranking algorithm** - Weighted scoring system for highlight importance
5. **Premium dark UI** - Match MLB's professional broadcast aesthetic
