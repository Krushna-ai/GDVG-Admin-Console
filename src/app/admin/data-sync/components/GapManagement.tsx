'use client';

import { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, XCircle, Sparkles, Play } from 'lucide-react';

interface Gap {
    id: string;
    gap_type: 'metadata' | 'popularity' | 'temporal';
    tmdb_id: number;
    content_type: 'movie' | 'tv';
    priority_score: number;
    status: 'unresolved' | 'resolved' | 'failed';
    details?: any;
    detected_at: string;
    attempts: number;
}

export default function GapManagement() {
    const [gaps, setGaps] = useState<Gap[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority');
    const [searchTmdbId, setSearchTmdbId] = useState('');
    const [detecting, setDetecting] = useState(false);

    const fetchGaps = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                resolved: 'false',
            });
            if (searchTmdbId) params.append('tmdb_id', searchTmdbId);

            const response = await fetch(`/api/gaps?${params}`);
            if (response.ok) {
                const result = await response.json();
                setGaps(result.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch gaps:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGaps();
    }, [sortBy, searchTmdbId]);

    const handleRunDetection = async () => {
        if (!confirm('Run gap detection? This may take a few minutes.')) return;

        setDetecting(true);
        try {
            const response = await fetch('/api/gaps/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'all' }),
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Detection complete!\nFound ${result.summary.total} metadata gaps`);
                fetchGaps();
            } else {
                throw new Error('Detection failed');
            }
        } catch (error) {
            console.error('Detection error:', error);
            alert('Gap detection failed. Please try again.');
        } finally {
            setDetecting(false);
        }
    };

    const handleFillGap = async (gapId: string, tmdbId: number) => {
        try {
            const response = await fetch('/api/gaps/fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gap_ids: [gapId] }),
            });

            if (response.ok) {
                alert(`Filling gap for TMDB ID: ${tmdbId}`);
                fetchGaps();
            }
        } catch (error) {
            console.error('Fill error:', error);
            alert('Failed to fill gap. Please try again.');
        }
    };



    // Calculate summary stats
    const stats = {
        total: gaps.length,
        metadata: gaps.filter(g => g.gap_type === 'metadata').length,
    };

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Gap Management</h2>
                <button
                    onClick={handleRunDetection}
                    disabled={detecting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                    {detecting ? (
                        <>
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Detecting...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4" />
                            Run Detection
                        </>
                    )}
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Total Gaps</div>
                    <div className="text-2xl font-bold text-white">{stats.total}</div>
                    <div className="text-xs text-zinc-500 mt-1">Missing posters/descriptions</div>
                </div>
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                    <div className="text-sm text-blue-400 mb-1">Metadata Issues</div>
                    <div className="text-2xl font-bold text-blue-400">{stats.metadata}</div>
                    <div className="text-xs text-blue-400/70 mt-1">Existing content needs fixing</div>
                </div>
            </div>

            {/* Info Message */}
            <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-400">
                    💡 <strong>Metadata gaps only:</strong> This shows existing content with missing posters or descriptions.
                    Use "Fill" to fetch complete data from TMDB. For importing new content, use the Bulk Import Center above.
                </p>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by TMDB ID..."
                        value={searchTmdbId}
                        onChange={(e) => setSearchTmdbId(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                </div>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                    <option value="priority">Priority Score</option>
                    <option value="date">Detection Date</option>
                </select>
            </div>

            {/* Gap List */}
            {loading ? (
                <div className="text-center py-12 text-zinc-500">
                    <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                    <p className="text-sm">Loading gaps...</p>
                </div>
            ) : gaps.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
                    <p className="text-sm">No gaps found! Everything looks good.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-zinc-700">
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">TMDB ID</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Type</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Content Type</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Priority</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Details</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Detected</th>
                                <th className="text-left text-sm font-medium text-zinc-400 pb-3 px-4">Attempts</th>
                                <th className="text-right text-sm font-medium text-zinc-400 pb-3 px-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gaps.map((gap) => (
                                <tr key={gap.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                                    <td className="py-3 px-4 text-white font-mono text-sm">{gap.tmdb_id}</td>
                                    <td className="py-3 px-4">
                                        <GapTypeBadge type={gap.gap_type} />
                                    </td>
                                    <td className="py-3 px-4 text-zinc-300 text-sm capitalize">{gap.content_type}</td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-20 bg-zinc-700 rounded-full h-2">
                                                <div
                                                    className="bg-gradient-to-r from-yellow-500 to-green-500 h-full rounded-full"
                                                    style={{ width: `${gap.priority_score}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-sm text-zinc-400">{gap.priority_score}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-zinc-400 text-sm max-w-xs truncate">
                                        {gap.details?.title || gap.details?.missing_fields?.join(', ') || '-'}
                                    </td>
                                    <td className="py-3 px-4 text-zinc-500 text-xs">
                                        {new Date(gap.detected_at).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 px-4 text-zinc-400 text-sm">{gap.attempts || 0}</td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => handleFillGap(gap.id, gap.tmdb_id)}
                                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs transition-colors"
                                        >
                                            Fill
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function GapTypeBadge({ type }: { type: 'metadata' | 'popularity' | 'temporal' }) {
    const badges = {
        metadata: { bg: 'bg-blue-900/20 border-blue-500/30', text: 'text-blue-400', label: 'Metadata' },
        popularity: { bg: 'bg-purple-900/20 border-purple-500/30', text: 'text-purple-400', label: 'Popularity' },
        temporal: { bg: 'bg-green-900/20 border-green-500/30', text: 'text-green-400', label: 'Temporal' },
    };

    const badge = badges[type];

    return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
        </span>
    );
}
