import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function DashboardPage() {
    const supabase = await createClient();

    // Get counts
    const { count: contentCount } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true });

    const { count: peopleCount } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true });

    const { count: publishedCount } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');

    const { count: draftCount } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft');

    // Get recent imports
    const { data: recentContent } = await supabase
        .from('content')
        .select('id, title, content_type, poster_path, created_at')
        .order('created_at', { ascending: false })
        .limit(6);

    const stats = [
        { label: 'Total Content', value: contentCount || 0, icon: '🎬', color: 'from-blue-600 to-purple-600' },
        { label: 'People', value: peopleCount || 0, icon: '👥', color: 'from-emerald-600 to-teal-600' },
        { label: 'Published', value: publishedCount || 0, icon: '✅', color: 'from-green-600 to-emerald-600' },
        { label: 'Draft', value: draftCount || 0, icon: '📝', color: 'from-amber-600 to-orange-600' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">📊 Dashboard</h1>
                <p className="text-slate-400">Overview of your content database</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className={`bg-gradient-to-br ${stat.color} rounded-2xl p-6 shadow-lg`}
                    >
                        <div className="text-4xl mb-2">{stat.icon}</div>
                        <div className="text-3xl font-bold text-white">{stat.value}</div>
                        <div className="text-white/80 text-sm">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/admin/tmdb-import"
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all"
                    >
                        📥 Import from TMDB
                    </Link>
                    <Link
                        href="/admin/content"
                        className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
                    >
                        🎬 View Content
                    </Link>
                    <Link
                        href="/admin/queue"
                        className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
                    >
                        📋 Queue Status
                    </Link>
                </div>
            </div>

            {/* Recent Imports */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Recent Imports</h2>
                    <Link href="/admin/content" className="text-blue-400 hover:text-blue-300 text-sm">
                        View all →
                    </Link>
                </div>

                {recentContent && recentContent.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                        {recentContent.map((content) => (
                            <div key={content.id} className="group">
                                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-slate-700 mb-2">
                                    {content.poster_path ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w185${content.poster_path}`}
                                            alt={content.title}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                                            🎬
                                        </div>
                                    )}
                                </div>
                                <p className="text-white text-xs font-medium line-clamp-1">{content.title}</p>
                                <p className="text-slate-500 text-xs uppercase">{content.content_type}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-slate-400">
                        <p className="text-4xl mb-2">📭</p>
                        <p>No content imported yet</p>
                        <Link href="/admin/tmdb-import" className="text-blue-400 hover:text-blue-300 text-sm">
                            Start importing →
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
