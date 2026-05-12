import { useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, type Cup, type EmailJob, type Attachment, type Stats, type Subscription } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Check, Pencil, Trash2, Mail, Loader2, RefreshCw, Paperclip, Download, UserPlus, Send, X } from 'lucide-react';
import { StatsTab } from '@/components/StatsTab';
import { formatDateRange, normalizeUrl } from '@/lib/utils';
import { AgeSelect } from '@/components/AgeSelect';
import { CupTypeSelect } from '@/components/CupTypeSelect';

function AttachmentManager({ cupId }: { cupId: number }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadAttachments() {
    try { setAttachments(await api.attachments.listForCup(cupId)); } catch {}
  }

  useEffect(() => { loadAttachments(); }, [cupId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await api.attachments.upload(cupId, file);
      setAttachments((prev) => [...prev, att]);
      toast({ title: 'Uppladdad', description: file.name });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel', description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.attachments.delete(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte radera bilagan.' });
    }
  }

  return (
    <div className="space-y-2">
      <Label>Bilagor</Label>
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between gap-2 text-sm bg-muted rounded px-2 py-1.5">
              <a
                href={`/api/attachments/${att.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 truncate text-[#CC0000] hover:text-[#AA0000]"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{att.original_name}</span>
              </a>
              <button
                type="button"
                onClick={() => handleDelete(att.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                title="Radera bilaga"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? 'Laddar upp...' : 'Bifoga fil'}
        </Button>
      </div>
    </div>
  );
}

function CupForm({
  cup,
  onSave,
  onCancel,
}: {
  cup: Partial<Cup>;
  onSave: (data: Partial<Cup>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: cup.name || '',
    location: cup.location || '',
    start_date: cup.start_date || '',
    end_date: cup.end_date || '',
    age_classes: cup.age_classes || '',
    cup_type: cup.cup_type || '',
    url: cup.url || '',
    description: cup.description || '',
    notes: cup.notes || '',
    recommended: !!cup.recommended,
    registration_deadline: cup.registration_deadline || '',
  });
  const [saving, setSaving] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label>Namn</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Ort</Label>
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} required />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Ålder</Label>
          <AgeSelect value={form.age_classes} onChange={(v) => set('age_classes', v)} />
        </div>
        <div className="space-y-1">
          <Label>Startdatum</Label>
          <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Slutdatum</Label>
          <Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Spelformat</Label>
          <CupTypeSelect value={form.cup_type} onChange={(v) => set('cup_type', v)} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Länk</Label>
          <Input type="text" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="t.ex. ulvacupen.se" />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Beskrivning</Label>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Interna anteckningar</Label>
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Visas bara för admin..." />
        </div>
        <div className="space-y-1">
          <Label>Sista anmälningsdatum</Label>
          <Input type="date" value={form.registration_deadline} onChange={(e) => set('registration_deadline', e.target.value)} />
        </div>
        <div className="flex items-center gap-2 col-span-2 pt-1">
          <input
            type="checkbox"
            id="recommended"
            checked={form.recommended}
            onChange={(e) => setForm((prev) => ({ ...prev, recommended: e.target.checked }))}
            className="h-4 w-4"
          />
          <Label htmlFor="recommended">Rekommenderas av Landvetter IF</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button type="submit" disabled={saving} className="bg-[#CC0000] hover:bg-[#AA0000]">
          {saving ? 'Sparar...' : 'Spara'}
        </Button>
      </div>
    </form>
  );
}

function PendingReviewDialog({
  cup,
  onClose,
  onRefresh,
}: {
  cup: Cup;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({
    name: cup.name,
    location: cup.location,
    start_date: cup.start_date,
    end_date: cup.end_date || '',
    registration_deadline: cup.registration_deadline || '',
    age_classes: cup.age_classes,
    cup_type: cup.cup_type || '',
    url: cup.url || '',
    description: cup.description || '',
    notes: cup.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function normalizedForm() {
    return { ...form, url: normalizeUrl(form.url) };
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.admin.updateCup(cup.id, normalizedForm());
      toast({ title: 'Sparad', description: 'Ändringarna är sparade.' });
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte spara.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await api.admin.updateCup(cup.id, normalizedForm());
      await api.admin.approveCup(cup.id);
      toast({ title: 'Godkänd', description: 'Cupen är nu synlig för alla.' });
      onClose();
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte godkänna cupen.' });
    } finally {
      setApproving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Är du säker på att du vill radera cupen?')) return;
    try {
      await api.admin.deleteCup(cup.id);
      toast({ title: 'Raderad' });
      onClose();
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte radera.' });
    }
  }

  async function handleReject() {
    setSubmittingReject(true);
    try {
      await api.admin.rejectCup(cup.id, rejectReason || undefined);
      toast({ title: 'Nekad', description: 'Cupen har nekats.' });
      onClose();
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte neka cupen.' });
    } finally {
      setSubmittingReject(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Granska förslag</DialogTitle>
        </DialogHeader>

        {cup.source_email && (
          <div className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
            Inskickat av: {cup.source_email}
          </div>
        )}

        <div className="space-y-3 mt-1">
          <div className="space-y-1">
            <Label>Namn</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ålder</Label>
            <AgeSelect value={form.age_classes} onChange={(v) => set('age_classes', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ort</Label>
              <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div className="space-y-1" />
            <div className="space-y-1">
              <Label>Startdatum</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Slutdatum</Label>
              <Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Sista anmälningsdatum</Label>
              <Input type="date" value={form.registration_deadline} onChange={(e) => set('registration_deadline', e.target.value)} />
            </div>
            <div className="space-y-1" />
          </div>
          <div className="space-y-2">
            <Label>Spelformat</Label>
            <CupTypeSelect value={form.cup_type} onChange={(v) => set('cup_type', v)} />
          </div>
          <div className="space-y-1">
            <Label>Länk</Label>
            <Input type="text" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="t.ex. ulvacupen.se" />
          </div>
          <div className="space-y-1">
            <Label>Beskrivning</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} />
          </div>
          <div className="space-y-1">
            <Label>Interna anteckningar</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Visas bara för admin..." />
          </div>
          <AttachmentManager cupId={cup.id} />
        </div>

        {rejecting && (
          <div className="space-y-2 pt-2 border-t">
            <Label>Anledning till nekande (valfritt)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="T.ex. för gammal information, dubblett..."
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(false)}>Avbryt</Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={submittingReject}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                {submittingReject ? 'Nekar...' : 'Bekräfta nekande'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Radera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejecting((r) => !r)}
              className="gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              <X className="h-3.5 w-3.5" /> Neka
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving || approving}>
              {saving ? 'Sparar...' : 'Spara ändringar'}
            </Button>
            <Button onClick={handleApprove} disabled={saving || approving} className="bg-green-600 hover:bg-green-700 gap-1">
              <Check className="h-4 w-4" />
              {approving ? 'Godkänner...' : 'Godkänn'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PendingTab({ cups, onRefresh }: { cups: Cup[]; onRefresh: () => void }) {
  const pending = cups.filter((c) => c.status === 'pending');
  const [reviewCup, setReviewCup] = useState<Cup | null>(null);

  if (pending.length === 0) {
    return <p className="text-muted-foreground text-center py-8">Inga väntande cuper.</p>;
  }

  return (
    <div className="space-y-3">
      {pending.map((cup) => (
        <div key={cup.id} className="border rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{cup.name}</p>
                {!!cup.potential_duplicate && (
                  <Badge variant="outline" className="text-orange-600 border-orange-400 shrink-0">Möjlig dubblett</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {cup.location} · {formatDateRange(cup.start_date, cup.end_date)}
              </p>
              <p className="text-sm text-muted-foreground">{cup.age_classes}</p>
              {cup.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{cup.description}</p>
              )}
              {cup.source_email && (
                <p className="text-xs text-muted-foreground mt-1">Källa: {cup.source_email}</p>
              )}
            </div>
            <Button size="sm" onClick={() => setReviewCup(cup)} className="bg-[#CC0000] hover:bg-[#AA0000] shrink-0 gap-1">
              <Pencil className="h-3.5 w-3.5" /> Granska
            </Button>
          </div>
        </div>
      ))}

      {reviewCup && (
        <PendingReviewDialog
          cup={reviewCup}
          onClose={() => setReviewCup(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function AllCupsTab({ cups, onRefresh }: { cups: Cup[]; onRefresh: () => void }) {
  const [search, setSearch] = useState('');
  const [editCup, setEditCup] = useState<Cup | null>(null);

  const filtered = cups.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.location.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(id: number, data: Partial<Cup>) {
    try {
      await api.admin.updateCup(id, data);
      toast({ title: 'Sparad', description: 'Cupen har uppdaterats.' });
      setEditCup(null);
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte spara cupen.' });
    }
  }

  async function remove(id: number) {
    if (!confirm('Är du säker på att du vill radera cupen?')) return;
    try {
      await api.admin.deleteCup(id);
      toast({ title: 'Raderad' });
      onRefresh();
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte radera.' });
    }
  }

  async function handleExportCsv() {
    try { await api.admin.exportCsv(); }
    catch { toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte exportera.' }); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Sök cuper..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1 shrink-0">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="space-y-2">
        {filtered.map((cup) => (
          <div key={cup.id} className="border rounded-lg p-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{cup.name}</p>
                <Badge variant={cup.status === 'approved' ? 'default' : cup.status === 'rejected' ? 'destructive' : 'secondary'}>
                  {cup.status === 'approved' ? 'Godkänd' : cup.status === 'rejected' ? 'Nekad' : 'Väntande'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{cup.location} · {formatDateRange(cup.start_date, cup.end_date)}</p>
              {cup.status === 'rejected' && cup.rejected_reason && (
                <p className="text-xs text-red-500 mt-0.5 truncate" title={cup.rejected_reason}>
                  Anledning: {cup.rejected_reason}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setEditCup(cup)} className="gap-1">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(cup.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-6">Inga cuper.</p>}
      </div>

      <Dialog open={!!editCup} onOpenChange={(o) => !o && setEditCup(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redigera cup</DialogTitle>
          </DialogHeader>
          {editCup && (
            <>
              <CupForm
                cup={editCup}
                onSave={(data) => handleSave(editCup.id, data)}
                onCancel={() => setEditCup(null)}
              />
              <div className="pt-2 border-t">
                <AttachmentManager cupId={editCup.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailJobsTab() {
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<EmailJob | null>(null);
  const [createForm, setCreateForm] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  async function loadJobs() {
    setLoading(true);
    try {
      const data = await api.admin.listEmailJobs();
      setJobs(data);
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte ladda e-postjobb.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadJobs(); }, []);

  function openCreate(job: EmailJob) {
    setSelectedJob(job);
    setCreateForm({
      name: job.subject || '',
      location: '',
      start_date: '',
      end_date: '',
      age_classes: '',
      url: '',
      description: '',
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    setCreating(true);
    try {
      await api.admin.createCupFromEmail(selectedJob.id, createForm);
      toast({ title: 'Cup skapad', description: 'Cupen väntar på godkännande.' });
      setSelectedJob(null);
      loadJobs();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel', description: err.message });
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={loadJobs} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Uppdatera lista
        </Button>
        <Button
          size="sm"
          className="bg-[#CC0000] hover:bg-[#AA0000] gap-1"
          onClick={async () => {
            try {
              await api.admin.pollNow();
              toast({ title: 'Klar', description: 'Mailhämtning genomförd.' });
              loadJobs();
            } catch {
              toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte hämta mail.' });
            }
          }}
        >
          <Mail className="h-3.5 w-3.5" /> Hämta mail nu
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Inga e-postjobb.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{job.subject || '(inget ämne)'}</p>
                  <p className="text-sm text-muted-foreground">{job.sender}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={job.status === 'processed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                      {job.status === 'processed' ? 'Bearbetad' : job.status === 'failed' ? 'Misslyckad' : 'Väntande'}
                    </Badge>
                    {job.cup_name && <span className="text-xs text-muted-foreground">→ {job.cup_name}</span>}
                  </div>
                </div>
                {job.status !== 'processed' && (
                  <Button size="sm" variant="outline" onClick={() => openCreate(job)} className="gap-1 shrink-0">
                    <Mail className="h-3.5 w-3.5" /> Skapa cup
                  </Button>
                )}
              </div>
              {job.raw_body && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Visa e-postinnehåll</summary>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">{job.raw_body.slice(0, 500)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selectedJob} onOpenChange={(o) => !o && setSelectedJob(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Skapa cup från e-post</DialogTitle>
          </DialogHeader>
          {createForm && (
            <form onSubmit={handleCreate} className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>Namn *</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm((p: any) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Ålder</Label>
                <AgeSelect value={createForm.age_classes} onChange={(v) => setCreateForm((p: any) => ({ ...p, age_classes: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Ort *</Label>
                  <Input value={createForm.location} onChange={(e) => setCreateForm((p: any) => ({ ...p, location: e.target.value }))} required />
                </div>
                <div className="space-y-1" />
                <div className="space-y-1">
                  <Label>Startdatum *</Label>
                  <Input type="date" value={createForm.start_date} onChange={(e) => setCreateForm((p: any) => ({ ...p, start_date: e.target.value }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Slutdatum</Label>
                  <Input type="date" value={createForm.end_date} onChange={(e) => setCreateForm((p: any) => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Länk</Label>
                <Input type="text" value={createForm.url} onChange={(e) => setCreateForm((p: any) => ({ ...p, url: e.target.value }))} placeholder="t.ex. ulvacupen.se" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedJob(null)}>Avbryt</Button>
                <Button type="submit" disabled={creating} className="bg-[#CC0000] hover:bg-[#AA0000]">
                  {creating ? 'Skapar...' : 'Skapa cup'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubscribersTab() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  async function loadSubs() {
    setLoading(true);
    try { setSubs(await api.admin.subscriptions.list()); }
    catch { toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte ladda prenumeranter.' }); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadSubs(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setAdding(true);
    try {
      await api.admin.subscriptions.add(email);
      toast({ title: 'Tillagd', description: `${email} är nu prenumerant.` });
      setEmail('');
      loadSubs();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel', description: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(sub: Subscription) {
    if (!confirm(`Ta bort prenumeration för ${sub.email}?`)) return;
    try {
      await api.admin.subscriptions.remove(sub.id);
      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
      toast({ title: 'Borttagen', description: `${sub.email} är avprenumererad.` });
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte ta bort prenumeranten.' });
    }
  }

  async function handleResend(sub: Subscription) {
    try {
      await api.admin.subscriptions.resend(sub.id);
      toast({ title: 'Skickat', description: `Mail skickat till ${sub.email}.` });
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte skicka mail.' });
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={async () => {
            try {
              await api.admin.digestNow();
              toast({ title: 'Digest skickad', description: 'Veckosammanfattning skickad till prenumeranter.' });
            } catch {
              toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte skicka digest.' });
            }
          }}
        >
          <Send className="h-3.5 w-3.5" /> Skicka digest nu
        </Button>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          type="email"
          placeholder="ny@epost.se"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={adding} className="bg-[#CC0000] hover:bg-[#AA0000] gap-1 shrink-0">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Lägg till
        </Button>
      </form>

      {subs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Inga prenumeranter.</p>
      ) : (
        <div className="space-y-2">
          {subs.map((sub) => (
            <div key={sub.id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium truncate">{sub.email}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant={sub.status === 'confirmed' ? 'default' : 'secondary'}>
                    {sub.status === 'confirmed' ? 'Bekräftad' : 'Väntar på bekräftelse'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sub.created_at).toLocaleDateString('sv-SE')}
                  </span>
                  {sub.age_classes && (
                    <span className="text-xs text-muted-foreground">Åldrar: {sub.age_classes}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResend(sub)}
                  title={sub.status === 'pending' ? 'Skicka om bekräftelsemail' : 'Skicka om välkomstmail'}
                  className="gap-1"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleRemove(sub)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [cups, setCups] = useState<Cup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadCups() {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([api.admin.listCups(), api.admin.stats()]);
      setCups(data);
      setStats(s);
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte ladda cuper.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCups(); }, []);

  const pendingCount = cups.filter((c) => c.status === 'pending').length;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Admin-panel</h2>
          {stats && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats.total} cuper · {stats.pending} väntande · {stats.total_votes} röster
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onLogout}>Logga ut</Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Väntande
            {pendingCount > 0 && (
              <span className="ml-1.5 bg-[#CC0000] text-white text-xs rounded-full px-1.5 py-0.5">{pendingCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Alla cuper</TabsTrigger>
          <TabsTrigger value="email">E-postinkorg</TabsTrigger>
          <TabsTrigger value="subscribers">Prenumeranter</TabsTrigger>
          <TabsTrigger value="stats">Statistik</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingTab cups={cups} onRefresh={loadCups} />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllCupsTab cups={cups} onRefresh={loadCups} />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <EmailJobsTab />
        </TabsContent>
        <TabsContent value="subscribers" className="mt-4">
          <SubscribersTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
