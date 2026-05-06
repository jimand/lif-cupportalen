import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';

interface FormData {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  age_classes: string;
  url: string;
  description: string;
}

const EMPTY: FormData = {
  name: '', location: '', start_date: '', end_date: '',
  age_classes: '', url: '', description: '',
};

export function AddCupForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<FormData> = {};
    if (!form.name.trim()) e.name = 'Namn krävs';
    if (!form.location.trim()) e.location = 'Ort krävs';
    if (!form.start_date) e.start_date = 'Startdatum krävs';
    if (!form.age_classes.trim()) e.age_classes = 'Åldersklasser krävs';
    if (form.url && !/^https?:\/\//.test(form.url)) e.url = 'Ogiltig URL (måste börja med http:// eller https://)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.cups.create({
        name: form.name.trim(),
        location: form.location.trim(),
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        age_classes: form.age_classes.trim(),
        url: form.url.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      toast({ title: 'Tack!', description: 'Cupen har skickats in och väntar på godkännande.' });
      setForm(EMPTY);
      setOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel', description: err.message || 'Kunde inte skicka in cupen.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#CC0000] hover:bg-[#AA0000] text-white gap-2">
          <Plus className="h-4 w-4" />
          Föreslå en cup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Föreslå en cup</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="name">Cupens namn *</Label>
            <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="t.ex. Gothia Cup" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="location">Ort *</Label>
            <Input id="location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="t.ex. Göteborg" />
            {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="start_date">Startdatum *</Label>
              <Input id="start_date" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">Slutdatum</Label>
              <Input id="end_date" type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="age_classes">Åldersklasser *</Label>
            <Input id="age_classes" value={form.age_classes} onChange={(e) => set('age_classes', e.target.value)} placeholder="t.ex. P10, P12, F10" />
            <p className="text-xs text-muted-foreground">Separera med komma</p>
            {errors.age_classes && <p className="text-xs text-destructive">{errors.age_classes}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="url">Länk till cup</Label>
            <Input id="url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." />
            {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Frivillig information om cupen..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="submit" disabled={submitting} className="bg-[#CC0000] hover:bg-[#AA0000]">
              {submitting ? 'Skickar...' : 'Skicka in'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
