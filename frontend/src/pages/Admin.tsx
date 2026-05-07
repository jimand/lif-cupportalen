import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPanel } from '@/components/AdminPanel';
import { api } from '@/lib/api';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';

export default function Admin() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.auth.me().then((res) => {
      if (res.admin) {
        setIsAdmin(true);
      } else {
        navigate('/admin/login');
      }
    }).catch(() => {
      navigate('/admin/login');
    }).finally(() => {
      setChecking(false);
    });
  }, [navigate]);

  async function handleLogout() {
    await api.auth.logout().catch(() => {});
    navigate('/admin/login');
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.png" alt="Landvetter IF" className="h-10 w-auto" />
          <div>
            <h1 className="font-bold text-lg leading-tight">Landvetter IF</h1>
            <p className="text-xs text-muted-foreground leading-tight">Cupportalen – Admin</p>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <AdminPanel onLogout={handleLogout} />
      </main>
      <Toaster />
    </div>
  );
}
