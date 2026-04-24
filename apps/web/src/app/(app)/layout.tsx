import { TopNav } from '@/components/TopNav';
import { CommandPalette } from '@/components/CommandPalette';
import { ToneTrainingGate } from './tone-training/ToneTrainingGate';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <TopNav />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <CommandPalette />
      {/* Async server component — returns null unless the rep still needs training */}
      <ToneTrainingGate />
    </div>
  );
}
