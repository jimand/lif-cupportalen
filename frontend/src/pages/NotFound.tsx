import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.svg" alt="Landvetter IF" width={35} height={40} className="h-10 w-auto" />
          <div>
            <h1 className="font-bold text-lg leading-tight">Landvetter IF</h1>
            <p className="text-xs text-muted-foreground leading-tight">Cupportalen</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p className="text-6xl font-bold text-[#AB2328]">404</p>
        <h2 className="mt-4 text-xl font-semibold">Sidan hittades inte</h2>
        <p className="mt-2 text-muted-foreground">
          Länken kan vara felstavad, eller så har sidan tagits bort.
        </p>
        <Button asChild className="mt-6 bg-[#AB2328] hover:bg-[#881C1F] gap-1.5">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Till cuplistan
          </Link>
        </Button>
      </main>
    </div>
  );
}
