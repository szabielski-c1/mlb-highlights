'use client';

import GameCard from './GameCard';

export default function GamesList({ games, selectedTeam, isLoading }) {
  // Filter games by team if selected
  const filteredGames = selectedTeam
    ? games.filter(g => g.away.id === selectedTeam || g.home.id === selectedTeam)
    : games;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-mlb-charcoal rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-1/3 mx-auto mb-4" />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-12" />
                    <div className="h-3 bg-gray-700 rounded w-8" />
                  </div>
                </div>
                <div className="h-8 bg-gray-700 rounded w-8" />
              </div>
              <div className="border-t border-white/10" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-12" />
                    <div className="h-3 bg-gray-700 rounded w-8" />
                  </div>
                </div>
                <div className="h-8 bg-gray-700 rounded w-8" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredGames.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚾</div>
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Games Found</h3>
        <p className="text-gray-500">
          {selectedTeam
            ? 'This team has no games scheduled for this date.'
            : 'No games are scheduled for this date.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredGames.map(game => (
        <GameCard key={game.gamePk} game={game} />
      ))}
    </div>
  );
}
