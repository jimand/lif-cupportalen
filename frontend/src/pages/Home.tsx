import { CupList } from '@/components/CupList';
import { AddCupForm } from '@/components/AddCupForm';
import { Toaster } from '@/components/ui/toaster';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Landvetter IF" className="h-10 w-auto" />
            <div>
              <h1 className="font-bold text-lg leading-tight">Landvetter IF</h1>
              <p className="text-xs text-muted-foreground leading-tight">Cupportalen</p>
            </div>
          </div>
          <AddCupForm />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-1">Hitta en cup</h2>
          <p className="text-muted-foreground">Bläddra bland cuper och rösta på dina favoriter</p>
        </div>
        <CupList />
      </main>

      <Toaster />
    </div>
  );
}
