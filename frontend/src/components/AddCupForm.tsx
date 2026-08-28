import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { AgeSelect } from '@/components/AgeSelect';
import { CupTypeSelect } from '@/components/CupTypeSelect';
import { normalizeUrl } from '@/lib/utils';
import { Plus } from 'lucide-react';

interface FormData {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  age_classes: string;
  cup_type: string;
  url: string;
  description: string;
  registration_deadline: string;
}

const EMPTY: FormData = {
  name: '', location: '', start_date: '', end_date: '',
  age_classes: '', cup_type: '', url: '', description: '',
  registration_deadline: '',
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
    if (!form.age_classes) e.age_classes = 'Välj minst en ålder';

    // Datumlogik – backend accepterar vad som helst som matchar formatet,
    // så en cup som slutar före den börjar gick tidigare rakt igenom.
    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      e.end_date = 'Slutdatum kan inte vara före startdatum';
    }
    if (form.registration_deadline && form.start_date && form.registration_deadline > form.start_date) {
      e.registration_deadline = 'Sista anmälningsdag kan inte vara efter cupens start';
    }

    // errors.url renderades men sattes aldrig – fältet validerades inte alls.
    if (form.url.trim()) {
      const candidate = normalizeUrl(form.url.trim());
      try {
        const u = new URL(candidate);
        if (u.hostname.indexOf('.') === -1) throw new Error('saknar domän');
      } catch {
        e.url = 'Ogiltig länk. Skriv t.ex. ulvacupen.se';
      }
    }

    if (form.description.length > 2000) {
      e.description = `Beskrivningen är ${form.description.length} tecken – max är 2000`;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleCancel() {
    setForm(EMPTY);
    setErrors({});
    setOpen(false);
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
        cup_type: form.cup_type || undefined,
        url: normalizeUrl(form.url) || undefined,
        description: form.description.trim() || undefined,
        registration_deadline: form.registration_deadline || undefined,
      });
      toast({ title: 'Tack!', description: 'Cupen har skickats in och väntar på godkännande.' });
      setForm(EMPTY);
      setOpen(false);
    } catch (err: any) {
      if (err instanceof ApiError && err.details) {
        const fieldErrors: Partial<FormData> = {};
        for (const [field, messages] of Object.entries(err.details)) {
          if (field in EMPTY && messages?.length) {
            (fieldErrors as Record<string, string>)[field] = messages[0];
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          toast({ variant: 'destructive', title: 'Kontrollera formuläret', description: 'Något fält behöver rättas.' });
          return;
        }
      }
      toast({
        variant: 'destructive',
        title: 'Fel',
        description: err instanceof ApiError && err.isNetworkError
          ? 'Ingen kontakt med servern. Kontrollera din uppkoppling.'
          : err.message || 'Kunde inte skicka in cupen.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#AB2328] hover:bg-[#881C1F] text-white gap-2">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="start_date">Startdatum *</Label>
              <Input id="start_date" type="date" value={form.start_date} onChange={(e) => {
                const newStart = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  start_date: newStart,
                  end_date: (!prev.end_date || prev.end_date === prev.start_date) ? newStart : prev.end_date,
                }));
                setErrors((prev) => ({ ...prev, start_date: undefined }));
              }} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">Slutdatum</Label>
              <Input id="end_date" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="registration_deadline">Sista anmälningsdatum</Label>
              <Input id="registration_deadline" type="date" max={form.start_date || undefined} value={form.registration_deadline} onChange={(e) => set('registration_deadline', e.target.value)} />
              {errors.registration_deadline && <p className="text-xs text-destructive">{errors.registration_deadline}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ålder *</Label>
            <AgeSelect value={form.age_classes} onChange={(v) => set('age_classes', v)} />
            {errors.age_classes && <p className="text-xs text-destructive">{errors.age_classes}</p>}
          </div>

          <div className="space-y-2">
            <Label>Spelformat</Label>
            <CupTypeSelect value={form.cup_type} onChange={(v) => set('cup_type', v)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="url">Länk till cup</Label>
            <Input id="url" type="text" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="t.ex. ulvacupen.se" />
            {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Frivillig information om cupen..." rows={3} />
            <div className="flex justify-between gap-2">
              {errors.description
                ? <p className="text-xs text-destructive">{errors.description}</p>
                : <span />}
              <p className={`text-xs shrink-0 ${form.description.length > 2000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {form.description.length} / 2000
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCancel}>Avbryt</Button>
            <Button type="submit" disabled={submitting} className="bg-[#AB2328] hover:bg-[#881C1F]">
              {submitting ? 'Skickar...' : 'Skicka in'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
