'use client';

import { useState } from 'react';
import { getAllTeams, getTeamLogo } from '@/lib/teams';

export default function TeamFilter({ selectedTeam, onTeamChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const teams = getAllTeams();

  const selectedTeamData = selectedTeam ? teams.find(t => t.id === selectedTeam) : null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-mlb-charcoal rounded-lg hover:bg-gray-700 transition-colors"
      >
        {selectedTeamData ? (
          <>
            <img
              src={getTeamLogo(selectedTeamData.id)}
              alt={selectedTeamData.name}
              className="w-6 h-6 object-contain"
            />
            <span className="text-white font-medium">{selectedTeamData.abbr}</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-gray-300">All Teams</span>
          </>
        )}
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-mlb-charcoal rounded-xl shadow-xl border border-white/10 z-20">
            {/* Clear filter option */}
            <button
              onClick={() => {
                onTeamChange(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors ${
                !selectedTeam ? 'bg-mlb-red/20 text-mlb-red' : 'text-gray-300'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <span className="font-medium">All Teams</span>
            </button>

            <div className="border-t border-white/10" />

            {/* Team list grouped by division */}
            {['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West'].map(division => (
              <div key={division}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-black/20">
                  {division}
                </div>
                {teams.filter(t => t.division === division).map(team => (
                  <button
                    key={team.id}
                    onClick={() => {
                      onTeamChange(team.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-700 transition-colors ${
                      selectedTeam === team.id ? 'bg-mlb-red/20 text-mlb-red' : 'text-white'
                    }`}
                  >
                    <img
                      src={getTeamLogo(team.id)}
                      alt={team.name}
                      className="w-8 h-8 object-contain"
                    />
                    <div className="text-left">
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-gray-400">{team.abbr}</p>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
