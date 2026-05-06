import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/components/ui/use-toast';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.auth.login(password);
      navigate('/admin');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Inloggning misslyckades', description: err.message || 'Fel lösenord' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-[#CC0000] flex items-center justify-center mx-auto mb-2">
            <span className="text-white font-bold">LIF</span>
          </div>
          <CardTitle>Admin-inloggning</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">Lösenord</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full bg-[#CC0000] hover:bg-[#AA0000]" disabled={loading}>
              {loading ? 'Loggar in...' : 'Logga in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Toaster />
    </div>
  );
}
