'use client';

import Link from 'next/link';
import { getTeam, getTeamLogo, getRivalry } from '@/lib/teams';

export default function GameCard({ game }) {
  const awayTeam = getTeam(game.away.id);
  const homeTeam = getTeam(game.home.id);
  const rivalry = getRivalry(game.away.id, game.home.id);

  const isFinal = game.status === 'Final';
  const isLive = game.status?.includes('In Progress') || game.status?.includes('Top') || game.status?.includes('Bottom');

  return (
    <Link href={`/game/${game.gamePk}`}>
      <div className="bg-mlb-charcoal rounded-xl p-4 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20 transition-all cursor-pointer border border-white/5 hover:border-white/10">
        {/* Rivalry badge */}
        {rivalry && (
          <div className="flex justify-center mb-2">
            <span className="px-2 py-0.5 bg-mlb-red/20 text-mlb-red text-xs font-semibold rounded-full">
              {rivalry.name}
            </span>
          </div>
        )}

        {/* Status */}
        <div className="flex justify-center mb-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isLive
              ? 'bg-green-500/20 text-green-400 animate-pulse'
              : isFinal
              ? 'bg-gray-600/50 text-gray-300'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {game.status}
          </span>
        </div>

        {/* Teams */}
        <div className="space-y-3">
          {/* Away team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={getTeamLogo(game.away.id)}
                alt={awayTeam?.name}
                className="w-10 h-10 object-contain"
              />
              <div>
                <p className="font-semibold text-white">{awayTeam?.abbr || game.away.abbreviation}</p>
                <p className="text-xs text-gray-400">
                  {game.away.wins}-{game.away.losses}
                </p>
              </div>
            </div>
            <span className={`text-2xl font-bold ${
              isFinal && game.away.score > game.home.score ? 'text-white' : 'text-gray-400'
            }`}>
              {game.away.score ?? '-'}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Home team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={getTeamLogo(game.home.id)}
                alt={homeTeam?.name}
                className="w-10 h-10 object-contain"
              />
              <div>
                <p className="font-semibold text-white">{homeTeam?.abbr || game.home.abbreviation}</p>
                <p className="text-xs text-gray-400">
                  {game.home.wins}-{game.home.losses}
                </p>
              </div>
            </div>
            <span className={`text-2xl font-bold ${
              isFinal && game.home.score > game.away.score ? 'text-white' : 'text-gray-400'
            }`}>
              {game.home.score ?? '-'}
            </span>
          </div>
        </div>

        {/* Venue */}
        {game.venue && (
          <p className="text-center text-xs text-gray-500 mt-3 truncate">
            {game.venue}
          </p>
        )}
      </div>
    </Link>
  );
}
