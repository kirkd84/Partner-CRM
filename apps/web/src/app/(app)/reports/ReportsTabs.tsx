'use client';

/**
 * Client-side tab switcher for /reports. URL-driven so each tab is
 * bookmarkable, shareable, and deep-linkable.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, TrendingUp, Trophy, DollarSign } from 'lucide-react';

const TABS = [
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'funnel', label: 'Funnel', icon: TrendingUp },
  { id: 'roi', label: 'ROI leaderboard', icon: Trophy },
  { id: 'expenses', label: 'Expenses', icon: DollarSign },
] as const;

export type ReportTab = (typeof TABS)[number]['id'];

export function ReportsTabs({ current }: { current: ReportTab }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex items-center gap-1 border-b border-card-border bg-white px-6">
      {TABS.map((tab) => {
        const isActive = tab.id === current;
        const nextParams = new URLSearchParams(params?.toString());
        nextParams.set('tab', tab.id);
        const href = `${pathname}?${nextParams.toString()}`;
        return (
          <Link
            key={tab.id}
            href={href}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
