import { TopNav } from '@/components/TopNav';
import { CommandPalette } from '@/components/CommandPalette';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <TopNav />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <CommandPalette />
    </div>
  );
}
