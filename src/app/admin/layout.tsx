import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// Navigation links configuration
const navLinks = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/tmdb-import', label: 'TMDB Import', icon: '📥' },
  { href: '/admin/bulk-import', label: 'Bulk Import', icon: '📦' },
  { href: '/admin/content', label: 'Content Manager', icon: '🎬' },
  { href: '/admin/people', label: 'People Manager', icon: '👥' },
  { href: '/admin/queue', label: 'Queue Status', icon: '📋' },
  { href: '/admin/data-sync', label: 'Data Sync', icon: '🔄' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is admin
  const { data: isAdmin } = await supabase.rpc('is_admin');

  if (!isAdmin) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold">GDVG Admin</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info & Logout */}
        <div className="p-4 border-t border-gray-800">
          <div className="text-sm text-gray-400 mb-3 truncate">
            {user.email}
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
