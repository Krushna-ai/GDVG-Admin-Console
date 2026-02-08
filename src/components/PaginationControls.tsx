'use client';

import { useState } from 'react';

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    isLoading?: boolean;
}

export default function PaginationControls({
    currentPage,
    totalPages,
    pageSize,
    totalCount,
    onPageChange,
    onPageSizeChange,
    isLoading = false
}: PaginationControlsProps) {
    const [jumpPage, setJumpPage] = useState('');

    const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalCount);

    const handleJumpToPage = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(jumpPage);
        if (page >= 1 && page <= totalPages) {
            onPageChange(page);
            setJumpPage('');
        }
    };

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const showPages = 5;

        if (totalPages <= showPages + 2) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            pages.push(1);

            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                end = showPages - 1;
            } else if (currentPage >= totalPages - 2) {
                start = totalPages - showPages + 2;
            }

            if (start > 2) pages.push('...');

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < totalPages - 1) pages.push('...');

            pages.push(totalPages);
        }

        return pages;
    };

    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4 bg-slate-800/30 border-t border-slate-700">
            {/* Results Info */}
            <div className="text-sm text-slate-400">
                Showing <span className="text-white font-medium">{startItem}</span> to{' '}
                <span className="text-white font-medium">{endItem}</span> of{' '}
                <span className="text-white font-medium">{totalCount.toLocaleString()}</span> results
            </div>

            {/* Page Controls */}
            <div className="flex items-center gap-2">
                {/* Previous Button */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    ← Previous
                </button>

                {/* Page Numbers */}
                <div className="hidden md:flex items-center gap-1">
                    {getPageNumbers().map((page, idx) => (
                        typeof page === 'number' ? (
                            <button
                                key={idx}
                                onClick={() => onPageChange(page)}
                                disabled={isLoading}
                                className={`px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === page
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium'
                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                    } disabled:opacity-50`}
                            >
                                {page}
                            </button>
                        ) : (
                            <span key={idx} className="px-2 text-slate-500">
                                {page}
                            </span>
                        )
                    ))}
                </div>

                {/* Mobile Page Indicator */}
                <div className="md:hidden px-3 py-2 bg-slate-800 rounded-lg text-sm text-white">
                    Page {currentPage} of {totalPages}
                </div>

                {/* Next Button */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || isLoading}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    Next →
                </button>
            </div>

            {/* Page Size & Jump Controls */}
            <div className="flex items-center gap-3">
                {/* Page Size Selector */}
                <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    disabled={isLoading}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                </select>

                {/* Jump to Page */}
                <form onSubmit={handleJumpToPage} className="hidden md:flex items-center gap-2">
                    <input
                        type="number"
                        min="1"
                        max={totalPages}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        placeholder="Go to..."
                        disabled={isLoading}
                        className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!jumpPage || isLoading}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Go
                    </button>
                </form>
            </div>
        </div>
    );
}
