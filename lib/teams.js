// MLB Team metadata with logos, colors, and rivalries
export const TEAMS = {
  108: { abbr: 'LAA', name: 'Los Angeles Angels', city: 'Los Angeles', primary: '#BA0021', secondary: '#003263', division: 'AL West' },
  109: { abbr: 'AZ', name: 'Arizona Diamondbacks', city: 'Arizona', primary: '#A71930', secondary: '#E3D4AD', division: 'NL West' },
  110: { abbr: 'BAL', name: 'Baltimore Orioles', city: 'Baltimore', primary: '#DF4601', secondary: '#000000', division: 'AL East' },
  111: { abbr: 'BOS', name: 'Boston Red Sox', city: 'Boston', primary: '#BD3039', secondary: '#0D2B56', division: 'AL East' },
  112: { abbr: 'CHC', name: 'Chicago Cubs', city: 'Chicago', primary: '#0E3386', secondary: '#CC3433', division: 'NL Central' },
  113: { abbr: 'CIN', name: 'Cincinnati Reds', city: 'Cincinnati', primary: '#C6011F', secondary: '#000000', division: 'NL Central' },
  114: { abbr: 'CLE', name: 'Cleveland Guardians', city: 'Cleveland', primary: '#00385D', secondary: '#E50022', division: 'AL Central' },
  115: { abbr: 'COL', name: 'Colorado Rockies', city: 'Colorado', primary: '#333366', secondary: '#131413', division: 'NL West' },
  116: { abbr: 'DET', name: 'Detroit Tigers', city: 'Detroit', primary: '#0C2340', secondary: '#FA4616', division: 'AL Central' },
  117: { abbr: 'HOU', name: 'Houston Astros', city: 'Houston', primary: '#002D62', secondary: '#EB6E1F', division: 'AL West' },
  118: { abbr: 'KC', name: 'Kansas City Royals', city: 'Kansas City', primary: '#004687', secondary: '#BD9B60', division: 'AL Central' },
  119: { abbr: 'LAD', name: 'Los Angeles Dodgers', city: 'Los Angeles', primary: '#005A9C', secondary: '#EF3E42', division: 'NL West' },
  120: { abbr: 'WSH', name: 'Washington Nationals', city: 'Washington', primary: '#AB0003', secondary: '#14225A', division: 'NL East' },
  121: { abbr: 'NYM', name: 'New York Mets', city: 'New York', primary: '#002D72', secondary: '#FF5910', division: 'NL East' },
  133: { abbr: 'OAK', name: 'Oakland Athletics', city: 'Oakland', primary: '#003831', secondary: '#EFB21E', division: 'AL West' },
  134: { abbr: 'PIT', name: 'Pittsburgh Pirates', city: 'Pittsburgh', primary: '#27251F', secondary: '#FDB827', division: 'NL Central' },
  135: { abbr: 'SD', name: 'San Diego Padres', city: 'San Diego', primary: '#2F241D', secondary: '#FFC425', division: 'NL West' },
  136: { abbr: 'SEA', name: 'Seattle Mariners', city: 'Seattle', primary: '#0C2C56', secondary: '#005C5C', division: 'AL West' },
  137: { abbr: 'SF', name: 'San Francisco Giants', city: 'San Francisco', primary: '#FD5A1E', secondary: '#27251F', division: 'NL West' },
  138: { abbr: 'STL', name: 'St. Louis Cardinals', city: 'St. Louis', primary: '#C41E3A', secondary: '#0C2340', division: 'NL Central' },
  139: { abbr: 'TB', name: 'Tampa Bay Rays', city: 'Tampa Bay', primary: '#092C5C', secondary: '#8FBCE6', division: 'AL East' },
  140: { abbr: 'TEX', name: 'Texas Rangers', city: 'Texas', primary: '#003278', secondary: '#C0111F', division: 'AL West' },
  141: { abbr: 'TOR', name: 'Toronto Blue Jays', city: 'Toronto', primary: '#134A8E', secondary: '#1D2D5C', division: 'AL East' },
  142: { abbr: 'MIN', name: 'Minnesota Twins', city: 'Minnesota', primary: '#002B5C', secondary: '#D31145', division: 'AL Central' },
  143: { abbr: 'PHI', name: 'Philadelphia Phillies', city: 'Philadelphia', primary: '#E81828', secondary: '#002D72', division: 'NL East' },
  144: { abbr: 'ATL', name: 'Atlanta Braves', city: 'Atlanta', primary: '#CE1141', secondary: '#13274F', division: 'NL East' },
  145: { abbr: 'CWS', name: 'Chicago White Sox', city: 'Chicago', primary: '#27251F', secondary: '#C4CED4', division: 'AL Central' },
  146: { abbr: 'MIA', name: 'Miami Marlins', city: 'Miami', primary: '#00A3E0', secondary: '#EF3340', division: 'NL East' },
  147: { abbr: 'NYY', name: 'New York Yankees', city: 'New York', primary: '#003087', secondary: '#E4002C', division: 'AL East' },
  158: { abbr: 'MIL', name: 'Milwaukee Brewers', city: 'Milwaukee', primary: '#12284B', secondary: '#B6922E', division: 'NL Central' },
};

// Historic rivalries
export const RIVALRIES = [
  { teams: [147, 111], name: 'Yankees-Red Sox', intensity: 'legendary' },
  { teams: [119, 137], name: 'Dodgers-Giants', intensity: 'legendary' },
  { teams: [112, 138], name: 'Cubs-Cardinals', intensity: 'legendary' },
  { teams: [121, 143], name: 'Mets-Phillies', intensity: 'high' },
  { teams: [144, 121], name: 'Braves-Mets', intensity: 'high' },
  { teams: [119, 135], name: 'Dodgers-Padres', intensity: 'high' },
  { teams: [147, 141], name: 'Yankees-Blue Jays', intensity: 'moderate' },
  { teams: [111, 139], name: 'Red Sox-Rays', intensity: 'moderate' },
  { teams: [145, 142], name: 'White Sox-Twins', intensity: 'moderate' },
  { teams: [117, 140], name: 'Astros-Rangers', intensity: 'high' },
];

/**
 * Get team info by ID
 */
export function getTeam(teamId) {
  return TEAMS[teamId] || null;
}

/**
 * Get team logo URL
 */
export function getTeamLogo(teamId, size = 100) {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

/**
 * Check if two teams have a rivalry
 */
export function getRivalry(teamId1, teamId2) {
  return RIVALRIES.find(r =>
    r.teams.includes(teamId1) && r.teams.includes(teamId2)
  );
}

/**
 * Get all teams as array for filtering
 */
export function getAllTeams() {
  return Object.entries(TEAMS).map(([id, team]) => ({
    id: parseInt(id),
    ...team,
  })).sort((a, b) => a.name.localeCompare(b.name));
}
