'use client';

import { useState, useEffect } from 'react';
import DatePicker from './components/DatePicker';
import TeamFilter from './components/TeamFilter';
import GamesList from './components/GamesList';

export default function Home() {
  // Default to yesterday's date
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/schedule?date=${selectedDate}`);
        const data = await response.json();
        setGames(data.games || []);
      } catch (error) {
        console.error('Error fetching games:', error);
        setGames([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGames();
  }, [selectedDate]);

  const finalGames = games.filter(g => g.status === 'Final');
  const otherGames = games.filter(g => g.status !== 'Final');

  return (
    <div className="space-y-8">
      {/* Date and Filter Section */}
      <section>
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </section>

      {/* Filter bar */}
      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Games
          </h2>
          <p className="text-gray-400 text-sm">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <TeamFilter
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
        />
      </section>

      {/* Final Games */}
      {finalGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-mlb-green" />
            <h3 className="text-lg font-semibold text-gray-300">
              Final ({finalGames.length})
            </h3>
          </div>
          <GamesList
            games={finalGames}
            selectedTeam={selectedTeam}
            isLoading={isLoading}
          />
        </section>
      )}

      {/* Other Games (scheduled, in progress, etc.) */}
      {otherGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h3 className="text-lg font-semibold text-gray-300">
              {otherGames.some(g => g.status?.includes('Progress'))
                ? 'In Progress & Scheduled'
                : 'Scheduled'} ({otherGames.length})
            </h3>
          </div>
          <GamesList
            games={otherGames}
            selectedTeam={selectedTeam}
            isLoading={isLoading}
          />
        </section>
      )}

      {/* Empty state */}
      {!isLoading && games.length === 0 && (
        <GamesList games={[]} selectedTeam={selectedTeam} isLoading={false} />
      )}

      {/* Loading state */}
      {isLoading && games.length === 0 && (
        <GamesList games={[]} selectedTeam={null} isLoading={true} />
      )}
    </div>
  );
}
