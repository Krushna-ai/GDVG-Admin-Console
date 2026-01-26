'use client';

import { useState } from 'react';

interface PreviewResult {
    totalCount: number;
    filteredCount: number;
    date: string;
}

interface ImportResult {
    queued: number;
    skipped: number;
}

export default function BulkImportPage() {
    const [contentType, setContentType] = useState<'movie' | 'tv'>('tv');
    const [minPopularity, setMinPopularity] = useState(20);
    const [maxItems, setMaxItems] = useState(500);

    const [isLoading, setIsLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'config' | 'preview' | 'importing' | 'done'>('config');

    // Preview export
    const handlePreview = async () => {
        setIsLoading(true);
        setError(null);
        setPreview(null);

        try {
            const response = await fetch(
                `/api/bulk-import/preview?type=${contentType}&minPopularity=${minPopularity}&maxItems=${maxItems}`
            );
            const data = await response.json();

            if (data.error) {
                setError(data.error);
            } else {
                setPreview(data);
                setStep('preview');
            }
        } catch (err) {
            setError('Failed to fetch preview');
        } finally {
            setIsLoading(false);
        }
    };

    // Start import
    const handleImport = async () => {
        setStep('importing');
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/bulk-import/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: contentType,
                    minPopularity,
                    maxItems,
                }),
            });
            const data = await response.json();

            if (data.error) {
                setError(data.error);
                setStep('preview');
            } else {
                setImportResult(data);
                setStep('done');
            }
        } catch (err) {
            setError('Failed to start import');
            setStep('preview');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setStep('config');
        setPreview(null);
        setImportResult(null);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">📦 Bulk Import</h1>
                <p className="text-slate-400">Import content from TMDB daily export files</p>
            </div>

            {/* Configuration Card */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 max-w-2xl">
                {step === 'config' && (
                    <>
                        <h2 className="text-xl font-semibold text-white mb-6">Configure Import</h2>

                        {/* Content Type */}
                        <div className="mb-6">
                            <label className="block text-slate-400 text-sm mb-2">Content Type</label>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setContentType('tv')}
                                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${contentType === 'tv'
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    📺 TV Shows / Dramas
                                </button>
                                <button
                                    onClick={() => setContentType('movie')}
                                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${contentType === 'movie'
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    🎬 Movies
                                </button>
                            </div>
                        </div>

                        {/* Min Popularity */}
                        <div className="mb-6">
                            <label className="block text-slate-400 text-sm mb-2">
                                Minimum Popularity Score: <span className="text-white font-bold">{minPopularity}</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={minPopularity}
                                onChange={(e) => setMinPopularity(Number(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>0 (All)</span>
                                <span>50 (Popular)</span>
                                <span>100 (Very Popular)</span>
                            </div>
                        </div>

                        {/* Max Items */}
                        <div className="mb-6">
                            <label className="block text-slate-400 text-sm mb-2">Max Items to Queue</label>
                            <select
                                value={maxItems}
                                onChange={(e) => setMaxItems(Number(e.target.value))}
                                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white"
                            >
                                <option value={100}>100 items</option>
                                <option value={250}>250 items</option>
                                <option value={500}>500 items</option>
                                <option value={1000}>1,000 items</option>
                                <option value={2500}>2,500 items</option>
                                <option value={5000}>5,000 items</option>
                            </select>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handlePreview}
                            disabled={isLoading}
                            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                                    Loading Export File...
                                </span>
                            ) : (
                                'Preview Available Content'
                            )}
                        </button>
                    </>
                )}

                {step === 'preview' && preview && (
                    <>
                        <h2 className="text-xl font-semibold text-white mb-6">Preview Results</h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-900/50 rounded-xl p-4">
                                <div className="text-3xl font-bold text-white">{preview.totalCount.toLocaleString()}</div>
                                <div className="text-slate-400 text-sm">Total in TMDB</div>
                            </div>
                            <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700/50">
                                <div className="text-3xl font-bold text-blue-400">{preview.filteredCount.toLocaleString()}</div>
                                <div className="text-blue-400/70 text-sm">Will be queued</div>
                            </div>
                        </div>

                        <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
                            <div className="text-sm text-slate-400">
                                <span className="text-white font-medium">{contentType === 'tv' ? 'TV Shows' : 'Movies'}</span>
                                {' '}with popularity ≥ {minPopularity}
                                {' '}(max {maxItems} items)
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Export date: {preview.date}</div>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={resetForm}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={isLoading || preview.filteredCount === 0}
                                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
                            >
                                {isLoading ? 'Queueing...' : `Queue ${preview.filteredCount} Items`}
                            </button>
                        </div>
                    </>
                )}

                {step === 'importing' && (
                    <div className="text-center py-8">
                        <div className="animate-spin h-16 w-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-white text-lg">Queueing items for import...</p>
                        <p className="text-slate-400 text-sm mt-2">This may take a moment</p>
                    </div>
                )}

                {step === 'done' && importResult && (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-6xl mb-4">✅</div>
                            <h2 className="text-2xl font-bold text-white">Import Queued!</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-green-900/30 rounded-xl p-4 border border-green-700/50">
                                <div className="text-3xl font-bold text-green-400">{importResult.queued}</div>
                                <div className="text-green-400/70 text-sm">Queued for import</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-xl p-4">
                                <div className="text-3xl font-bold text-slate-400">{importResult.skipped}</div>
                                <div className="text-slate-500 text-sm">Skipped (already exists)</div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={resetForm}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
                            >
                                Import More
                            </button>
                            <a
                                href="/admin/queue"
                                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all text-center"
                            >
                                View Queue →
                            </a>
                        </div>
                    </>
                )}
            </div>

            {/* Info Card */}
            <div className="mt-6 bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 max-w-2xl">
                <h3 className="text-blue-400 font-medium mb-2">💡 How it works</h3>
                <ul className="text-slate-400 text-sm space-y-1">
                    <li>• TMDB provides daily export files with all content IDs</li>
                    <li>• We filter by popularity to get the most relevant content</li>
                    <li>• Items are queued and processed in the background</li>
                    <li>• Already imported content is automatically skipped</li>
                </ul>
            </div>
        </div>
    );
}
