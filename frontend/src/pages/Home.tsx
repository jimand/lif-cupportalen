import { useState } from 'react';
import { CupList } from '@/components/CupList';
import { AddCupForm } from '@/components/AddCupForm';
import { Toaster } from '@/components/ui/toaster';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AgeSelect } from '@/components/AgeSelect';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

function SubscribeSection() {
  const [email, setEmail] = useState('');
  const [ageClasses, setAgeClasses] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.subscriptions.subscribe(email, ageClasses || undefined);
      setDone(true);
      setEmail('');
      setAgeClasses('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel', description: err.message || 'Kunde inte prenumerera.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 border-t pt-8 text-center">
      <p className="text-sm font-medium mb-1">Få ett mail när nya cuper godkänns</p>
      <p className="text-xs text-muted-foreground mb-3">Du kan avprenumerera när som helst via länken i mailet.</p>
      {done ? (
        <p className="text-sm text-green-600 font-medium">Kolla din inkorg! Vi har skickat en bekräftelselänk till din e-postadress.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="din@epost.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={loading} className="bg-[#AB2328] hover:bg-[#881C1F] shrink-0">
              {loading ? 'Sparar...' : 'Prenumerera'}
            </Button>
          </div>
          <div className="text-left">
            <p className="text-xs text-muted-foreground mb-1.5">Filtrera notiser per åldersgrupp (valfritt)</p>
            <AgeSelect value={ageClasses} onChange={setAgeClasses} />
          </div>
        </form>
      )}
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Landvetter IF" width={35} height={40} className="h-10 w-auto" />
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
        <SubscribeSection />
      </main>

      <Toaster />
    </div>
  );
}
