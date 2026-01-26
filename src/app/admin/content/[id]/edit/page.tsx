'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

interface Content {
    id: string;
    tmdb_id: number;
    title: string;
    original_title?: string;
    content_type: string;
    status: string;
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    tagline?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    origin_country?: string[];
    original_language?: string;
    genres?: any[];
    number_of_seasons?: number;
    number_of_episodes?: number;
    homepage?: string;
    imdb_id?: string;
    content_rating?: string;
    keywords?: any[];
    videos?: any[];
    watch_providers?: any;
}

interface WatchLink {
    id?: string;
    platform_name: string;
    region: string;
    link_url: string;
    is_affiliate: boolean;
}

interface CastMember {
    id: string;
    person_id: string;
    character_name: string;
    order_index: number;
    role_type: string;
    person: { id: string; name: string; profile_path?: string };
}

// Collapsible section with edit mode
function EditSection({ title, icon, children, defaultOpen = true }: {
    title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <h3 className="text-white font-medium">{title}</h3>
                </div>
                <span className="text-slate-400">{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && <div className="px-5 pb-5 border-t border-slate-700/30">{children}</div>}
        </div>
    );
}

// Tag input component for genres/keywords
function TagEditor({
    tags,
    onChange,
    placeholder,
    color = 'purple'
}: {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder: string;
    color?: 'purple' | 'blue' | 'green';
}) {
    const [inputValue, setInputValue] = useState('');
    const colors = {
        purple: 'bg-purple-600/30 text-purple-300 hover:bg-purple-600/50',
        blue: 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/50',
        green: 'bg-green-600/30 text-green-300 hover:bg-green-600/50',
    };

    const addTag = () => {
        const value = inputValue.trim();
        if (value && !tags.includes(value)) {
            onChange([...tags, value]);
            setInputValue('');
        }
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter(t => t !== tag));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag, idx) => (
                    <span key={idx} className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${colors[color]}`}>
                        {tag}
                        <button onClick={() => removeTag(tag)} className="ml-1 hover:text-white">×</button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
                <button onClick={addTag} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
                    + Add
                </button>
            </div>
        </div>
    );
}

// Watch link editor
function WatchLinkEditor({ links, onChange }: { links: WatchLink[]; onChange: (links: WatchLink[]) => void }) {
    const addLink = () => {
        onChange([...links, { platform_name: '', region: 'ALL', link_url: '', is_affiliate: false }]);
    };

    const updateLink = (idx: number, field: keyof WatchLink, value: any) => {
        const updated = [...links];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const removeLink = (idx: number) => {
        onChange(links.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            {links.map((link, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-3 rounded-lg">
                    <input
                        type="text"
                        value={link.platform_name}
                        onChange={(e) => updateLink(idx, 'platform_name', e.target.value)}
                        placeholder="Platform (e.g., Netflix)"
                        className="col-span-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <select
                        value={link.region}
                        onChange={(e) => updateLink(idx, 'region', e.target.value)}
                        className="col-span-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    >
                        <option value="ALL">All Regions</option>
                        <option value="IN">India</option>
                        <option value="US">US</option>
                        <option value="KR">Korea</option>
                        <option value="GB">UK</option>
                    </select>
                    <input
                        type="url"
                        value={link.link_url}
                        onChange={(e) => updateLink(idx, 'link_url', e.target.value)}
                        placeholder="https://affiliate.link/..."
                        className="col-span-5 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <label className="col-span-1 flex items-center gap-1 text-xs text-slate-400">
                        <input
                            type="checkbox"
                            checked={link.is_affiliate}
                            onChange={(e) => updateLink(idx, 'is_affiliate', e.target.checked)}
                            className="w-4 h-4"
                        />
                        Aff
                    </label>
                    <button onClick={() => removeLink(idx)} className="col-span-1 text-red-400 hover:text-red-300">
                        🗑️
                    </button>
                </div>
            ))}
            <button onClick={addLink} className="w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm transition-colors">
                + Add Streaming Platform
            </button>
        </div>
    );
}

// Video editor
function VideoEditor({ videos, onChange }: { videos: any[]; onChange: (videos: any[]) => void }) {
    const addVideo = () => {
        onChange([...videos, { key: '', name: '', type: 'Trailer', site: 'YouTube' }]);
    };

    const updateVideo = (idx: number, field: string, value: any) => {
        const updated = [...videos];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const removeVideo = (idx: number) => {
        onChange(videos.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            {videos.map((video, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-3 rounded-lg">
                    <input
                        type="text"
                        value={video.name}
                        onChange={(e) => updateVideo(idx, 'name', e.target.value)}
                        placeholder="Video Title"
                        className="col-span-4 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <input
                        type="text"
                        value={video.key}
                        onChange={(e) => updateVideo(idx, 'key', e.target.value)}
                        placeholder="YouTube ID (e.g., dQw4w9WgXcQ)"
                        className="col-span-4 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <select
                        value={video.type}
                        onChange={(e) => updateVideo(idx, 'type', e.target.value)}
                        className="col-span-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    >
                        <option value="Trailer">Trailer</option>
                        <option value="Teaser">Teaser</option>
                        <option value="Clip">Clip</option>
                        <option value="Behind the Scenes">Behind the Scenes</option>
                    </select>
                    <button onClick={() => removeVideo(idx)} className="col-span-1 text-red-400 hover:text-red-300">
                        🗑️
                    </button>
                </div>
            ))}
            <button onClick={addVideo} className="w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm transition-colors">
                + Add Video
            </button>
        </div>
    );
}

export default function ContentEditPage() {
    const router = useRouter();
    const params = useParams();
    const contentId = params.id as string;

    const [content, setContent] = useState<Content | null>(null);
    const [cast, setCast] = useState<CastMember[]>([]);
    const [watchLinks, setWatchLinks] = useState<WatchLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Parse genres/keywords to string arrays for editing
    const [genreNames, setGenreNames] = useState<string[]>([]);
    const [keywordNames, setKeywordNames] = useState<string[]>([]);
    const [videos, setVideos] = useState<any[]>([]);

    // Fetch content details
    useEffect(() => {
        async function fetchData() {
            try {
                const contentRes = await fetch(`/api/content/${contentId}`);
                if (!contentRes.ok) throw new Error('Failed to fetch content');
                const contentData = await contentRes.json();
                const c = contentData.content || contentData;
                setContent(c);

                // Parse genres
                setGenreNames(c.genres?.map((g: any) => g.name || g) || []);
                setKeywordNames(c.keywords?.map((k: any) => k.name || k) || []);
                setVideos(c.videos || []);

                // 1. Try to fetch saved watch links from DB
                let initialLinks: WatchLink[] = [];
                try {
                    const linksRes = await fetch(`/api/content/${contentId}/watch-links`);
                    if (linksRes.ok) {
                        const linksData = await linksRes.json();
                        if (linksData.links && linksData.links.length > 0) {
                            initialLinks = linksData.links;
                        }
                    }
                } catch { }

                // 2. If no saved links, parse from TMDB metadata
                if (initialLinks.length === 0 && c.watch_providers) {
                    Object.entries(c.watch_providers).forEach(([region, data]: [string, any]) => {
                        if (data?.flatrate) {
                            data.flatrate.forEach((p: any) => {
                                initialLinks.push({
                                    platform_name: p.provider_name,
                                    region: region,
                                    link_url: data.link || '',
                                    is_affiliate: false,
                                });
                            });
                        }
                    });
                }
                setWatchLinks(initialLinks);

                // Fetch cast
                try {
                    const castRes = await fetch(`/api/content/${contentId}/cast`);
                    if (castRes.ok) {
                        const castData = await castRes.json();
                        setCast(castData.cast || []);
                    }
                } catch { }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load content');
            } finally {
                setLoading(false);
            }
        }
        if (contentId) fetchData();
    }, [contentId]);

    // Handle save
    const handleSave = async () => {
        if (!content) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            // Convert genre/keyword names back to objects
            const updatedContent = {
                ...content,
                genres: genreNames.map((name, i) => ({ id: i, name })),
                keywords: keywordNames.map((name, i) => ({ id: i, name })),
                videos: videos,
            };

            const response = await fetch(`/api/content/${contentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedContent),
            });
            if (!response.ok) throw new Error('Failed to save content');

            // Save watch links
            await fetch(`/api/content/${contentId}/watch-links`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: watchLinks }),
            });

            setSaveMessage('✓ Changes saved successfully!');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof Content, value: any) => {
        if (!content) return;
        setContent({ ...content, [field]: value });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8 flex items-center justify-center">
                <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (error || !content) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
                    <p className="text-red-400 text-lg">{error || 'Content not found'}</p>
                    <Link href="/admin/content" className="text-blue-400 hover:underline mt-4 inline-block">
                        ← Back to Content Manager
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-sm -mx-8 px-8 py-4 z-10 border-b border-slate-700/50">
                <div className="flex items-center gap-4">
                    <Link href="/admin/content" className="text-slate-400 hover:text-white">← Back</Link>
                    <div>
                        <h1 className="text-xl font-bold text-white">Edit: {content.title}</h1>
                        <p className="text-slate-400 text-sm">TMDB: {content.tmdb_id} • {content.content_type?.toUpperCase()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {saveMessage && <span className="text-green-400 text-sm">{saveMessage}</span>}
                    <button
                        onClick={() => router.push('/admin/content')}
                        className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : '💾 Save All Changes'}
                    </button>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Media */}
                <div className="space-y-4">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <h3 className="text-white font-medium mb-3">Poster</h3>
                        {content.poster_path ? (
                            <img src={`${TMDB_IMAGE_BASE}${content.poster_path}`} alt="" className="w-full rounded-lg" />
                        ) : (
                            <div className="w-full aspect-[2/3] bg-slate-700 rounded-lg flex items-center justify-center text-slate-500">No Poster</div>
                        )}
                        <input
                            type="text"
                            value={content.poster_path || ''}
                            onChange={(e) => updateField('poster_path', e.target.value)}
                            placeholder="/path/to/poster.jpg"
                            className="w-full mt-3 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <h3 className="text-white font-medium mb-3">Statistics</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Rating</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="10"
                                    value={content.vote_average || ''}
                                    onChange={(e) => updateField('vote_average', parseFloat(e.target.value) || null)}
                                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-yellow-400 text-right"
                                />
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Votes</span>
                                <input
                                    type="number"
                                    value={content.vote_count || ''}
                                    onChange={(e) => updateField('vote_count', parseInt(e.target.value) || null)}
                                    className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                />
                            </div>
                            {content.content_type === 'tv' && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Seasons</span>
                                        <input
                                            type="number"
                                            value={content.number_of_seasons || ''}
                                            onChange={(e) => updateField('number_of_seasons', parseInt(e.target.value) || null)}
                                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                        />
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Episodes</span>
                                        <input
                                            type="number"
                                            value={content.number_of_episodes || ''}
                                            onChange={(e) => updateField('number_of_episodes', parseInt(e.target.value) || null)}
                                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - Form */}
                <div className="lg:col-span-2">
                    {/* Basic Info */}
                    <EditSection title="Basic Information" icon="📝">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={content.title || ''}
                                    onChange={(e) => updateField('title', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Original Title</label>
                                <input
                                    type="text"
                                    value={content.original_title || ''}
                                    onChange={(e) => updateField('original_title', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Tagline</label>
                                <input
                                    type="text"
                                    value={content.tagline || ''}
                                    onChange={(e) => updateField('tagline', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Overview</label>
                                <textarea
                                    value={content.overview || ''}
                                    onChange={(e) => updateField('overview', e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-none"
                                />
                            </div>
                        </div>
                    </EditSection>

                    {/* Status */}
                    <EditSection title="Status & Classification" icon="⚙️">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Status</label>
                                <select
                                    value={content.status || 'draft'}
                                    onChange={(e) => updateField('status', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Content Type</label>
                                <select
                                    value={content.content_type || 'tv'}
                                    onChange={(e) => updateField('content_type', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="tv">TV</option>
                                    <option value="movie">Movie</option>
                                    <option value="drama">Drama</option>
                                    <option value="anime">Anime</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Content Rating</label>
                                <input
                                    type="text"
                                    value={content.content_rating || ''}
                                    onChange={(e) => updateField('content_rating', e.target.value)}
                                    placeholder="TV-MA, 15+"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Language</label>
                                <input
                                    type="text"
                                    value={content.original_language || ''}
                                    onChange={(e) => updateField('original_language', e.target.value)}
                                    placeholder="en, ko, ja"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                        </div>
                    </EditSection>

                    {/* Genres */}
                    <EditSection title="Genres" icon="🎭">
                        <div className="pt-4">
                            <TagEditor
                                tags={genreNames}
                                onChange={setGenreNames}
                                placeholder="Add genre (e.g., Drama, Action)..."
                                color="purple"
                            />
                        </div>
                    </EditSection>

                    {/* Keywords */}
                    <EditSection title="Keywords / Tags" icon="🏷️">
                        <div className="pt-4">
                            <TagEditor
                                tags={keywordNames}
                                onChange={setKeywordNames}
                                placeholder="Add keyword (e.g., revenge, time travel)..."
                                color="blue"
                            />
                        </div>
                    </EditSection>

                    {/* Cast */}
                    <EditSection title="Cast & Crew" icon="👥" defaultOpen={false}>
                        <div className="pt-4">
                            {cast.length > 0 ? (
                                <div className="space-y-2">
                                    {cast.map((member) => (
                                        <div key={member.id} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg">
                                            <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden">
                                                {member.person?.profile_path ? (
                                                    <img src={`https://image.tmdb.org/t/p/w92${member.person.profile_path}`} alt="" className="w-full h-full object-cover" />
                                                ) : <div className="w-full h-full flex items-center justify-center">👤</div>}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-white text-sm">{member.person?.name}</p>
                                                <p className="text-slate-500 text-xs">{member.character_name}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded ${member.role_type === 'main' ? 'bg-green-600/30 text-green-300' :
                                                member.role_type === 'support' ? 'bg-blue-600/30 text-blue-300' :
                                                    'bg-slate-600/30 text-slate-300'
                                                }`}>
                                                {member.role_type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No cast members. Import from TMDB to populate.</p>
                            )}
                        </div>
                    </EditSection>

                    {/* Videos */}
                    <EditSection title="Videos & Trailers" icon="🎬" defaultOpen={false}>
                        <div className="pt-4">
                            <VideoEditor videos={videos} onChange={setVideos} />
                        </div>
                    </EditSection>

                    {/* Watch Links */}
                    <EditSection title="Where to Watch (Streaming Links)" icon="📺">
                        <div className="pt-4">
                            <p className="text-slate-400 text-sm mb-3">Add streaming platforms with affiliate links for monetization</p>
                            <WatchLinkEditor links={watchLinks} onChange={setWatchLinks} />
                        </div>
                    </EditSection>

                    {/* Metadata */}
                    <EditSection title="Metadata & External IDs" icon="📊" defaultOpen={false}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">
                                    {content.content_type === 'movie' ? 'Release Date' : 'First Air Date'}
                                </label>
                                <input
                                    type="date"
                                    value={content.content_type === 'movie' ? content.release_date || '' : content.first_air_date || ''}
                                    onChange={(e) => updateField(content.content_type === 'movie' ? 'release_date' : 'first_air_date', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Homepage URL</label>
                                <input
                                    type="url"
                                    value={content.homepage || ''}
                                    onChange={(e) => updateField('homepage', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">IMDB ID</label>
                                <input
                                    type="text"
                                    value={content.imdb_id || ''}
                                    onChange={(e) => updateField('imdb_id', e.target.value)}
                                    placeholder="tt1234567"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">TMDB ID (read-only)</label>
                                <input
                                    type="text"
                                    value={content.tmdb_id || ''}
                                    readOnly
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400"
                                />
                            </div>
                        </div>
                    </EditSection>
                </div>
            </div>
        </div>
    );
}
