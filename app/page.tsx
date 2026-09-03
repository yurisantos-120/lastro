'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText, Boxes, Building2, Camera, ChevronRight, CircleUserRound,
  LayoutDashboard, MapPin, Moon, Network, Plus, Search, Settings2, Sun, Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RecordKind = 'general' | 'vlan' | 'camera' | 'point';
type ActiveView = 'inicio' | 'pesquisa' | 'informacoes' | 'vlans' | 'cameras' | 'pontos' | 'categorias';
type Category = { id: number; name: string; description: string; color: string; scope: RecordKind };
type RecordItem = {
  id: number; title: string; categoryId: number; responsible: string; validation: string;
  contact: string; notes: string; updated: string; kind: RecordKind; details: Record<string, string>;
};

const emptyCategories: Category[] = [];
const emptyRecords: RecordItem[] = [];
const kindLabels: Record<RecordKind, string> = { general: 'Informação geral', vlan: 'VLAN', camera: 'Câmera', point: 'Ponto' };
const scopeHelp: Record<RecordKind, string> = {
  general: 'Tipo de informação operacional',
  vlan: 'Região ou agrupamento das VLANs',
  camera: 'Responsável pelas câmeras',
  point: 'Empresa ou cliente atendido',
};

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
}

export default function Home() {
  const [active, setActive] = useState<ActiveView>('inicio');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>(emptyCategories);
  const [records, setRecords] = useState<RecordItem[]>(emptyRecords);
  const [recordFormKind, setRecordFormKind] = useState<RecordKind | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('noc-megalink-theme');
    const useDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(useDark);
    document.documentElement.classList.toggle('dark', useDark);
  }, []);

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    try {
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error('Não foi possível acessar o banco de dados.');
      const data = await response.json() as { categories: Category[]; records: RecordItem[] };
      setCategories(data.categories); setRecords(data.records); setStorageError('');
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao carregar os dados.'); }
  }

  async function persist(method: 'POST' | 'PUT', payload: Record<string, unknown>) {
    const response = await fetch('/api/data', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Não foi possível salvar no banco de dados.');
    const data = await response.json() as { categories: Category[]; records: RecordItem[] };
    setCategories(data.categories); setRecords(data.records); setStorageError('');
  }

  function toggleTheme() {
    const next = !darkMode; setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('noc-megalink-theme', next ? 'dark' : 'light');
  }

  function startNewRecord() {
    const map: Partial<Record<ActiveView, RecordKind>> = { vlans: 'vlan', cameras: 'camera', pontos: 'point', informacoes: 'general' };
    setRecordFormKind(map[active] || 'general');
  }

  function recordPayload(formData: FormData, kind: RecordKind, id?: number) {
    const details: Record<string, string> = {};
    const fields: Record<RecordKind, string[]> = {
      general: [], vlan: ['vlanNumber', 'neighborhood'],
      camera: ['camera', 'neighborhood', 'address', 'reference', 'geolocation', 'olt', 'description', 'signal', 'serialNumber'],
      point: ['location', 'address', 'speed', 'date', 'partner', 'ip'],
    };
    for (const field of fields[kind]) details[field] = value(formData, field);
    const title = kind === 'vlan' ? `VLAN ${details.vlanNumber} — ${details.neighborhood}`
      : kind === 'camera' ? details.camera
      : kind === 'point' ? details.location
      : value(formData, 'title');
    return {
      kind: 'record', id, title, categoryId: Number(value(formData, 'categoryId')),
      responsible: value(formData, 'responsible'), validation: value(formData, 'validation') || '—',
      contact: value(formData, 'contact'), notes: value(formData, 'notes') || details.description || '',
      recordKind: kind, details,
    };
  }

  async function createRecord(formData: FormData) {
    if (!recordFormKind) return;
    try {
      const payload = recordPayload(formData, recordFormKind);
      await persist('POST', { ...payload, kind: 'record', recordType: recordFormKind });
      setRecordFormKind(null); setActive(viewForKind(recordFormKind));
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao salvar.'); }
  }

  async function saveRecord(formData: FormData) {
    if (!editingRecord) return;
    try {
      const payload = recordPayload(formData, editingRecord.kind, editingRecord.id);
      await persist('PUT', { ...payload, kind: 'record', recordType: editingRecord.kind, details: payload.details });
      setEditingRecord(null);
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao atualizar.'); }
  }

  async function createCategory(formData: FormData) {
    try {
      await persist('POST', { kind: 'category', name: value(formData, 'name'), description: value(formData, 'description'), color: value(formData, 'color') || '#8b5cf6', scope: value(formData, 'scope') || 'general' });
      setShowCategoryForm(false);
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao salvar.'); }
  }

  async function saveCategory(formData: FormData) {
    if (!editingCategory) return;
    try {
      await persist('PUT', { kind: 'category', id: editingCategory.id, name: value(formData, 'name'), description: value(formData, 'description'), color: value(formData, 'color'), scope: value(formData, 'scope') });
      setEditingCategory(null);
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao atualizar.'); }
  }

  const filtered = useMemo(() => {
    const term = query.toLocaleLowerCase('pt-BR').trim();
    const activeKind: Partial<Record<ActiveView, RecordKind>> = { informacoes: 'general', vlans: 'vlan', cameras: 'camera', pontos: 'point' };
    return records.filter((item) => {
      if (activeKind[active] && item.kind !== activeKind[active]) return false;
      if (!term) return true;
      const category = categories.find((entry) => entry.id === item.categoryId)?.name || '';
      return [item.title, item.responsible, item.validation, item.contact, item.notes, category, ...Object.values(item.details || {})].join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [active, query, records, categories]);

  const nav = [
    ['inicio', 'Visão geral', LayoutDashboard], ['pesquisa', 'Pesquisa', Search], ['informacoes', 'Informações', BookOpenText],
    ['vlans', 'VLANs', Network], ['cameras', 'Câmeras', Camera], ['pontos', 'Pontos', MapPin], ['categorias', 'Categorias', Boxes],
  ] as const;
  const title: Record<ActiveView, string> = { inicio: 'Visão geral', pesquisa: 'Pesquisa', informacoes: 'Informações gerais', vlans: 'VLANs', cameras: 'Câmeras', pontos: 'Pontos atendidos', categorias: 'Categorias' };

  return <main className="min-h-screen bg-[#f4f6f8] pb-24 text-[#17202a] lg:pb-0">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-[#0b1625] px-4 py-5 text-white lg:flex">
      <div className="flex items-center gap-3 px-2 pb-7"><div className="grid size-10 place-items-center rounded-xl bg-[#ff6b2c]"><Network className="size-5" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">Eidos</p><p className="text-lg font-semibold">NOC Megalink</p></div></div>
      <nav className="space-y-1">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => setActive(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon className={`size-4 ${active === id ? 'text-[#ff7b43]' : ''}`} />{label}</button>)}</nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-3"><div className="mb-2 flex items-center gap-2"><Settings2 className="size-4 text-[#ff7b43]" /><span className="text-xs font-semibold">Base operacional</span></div><p className="text-xs leading-relaxed text-slate-400">VLANs, câmeras, pontos e informações organizadas por categoria.</p></div>
      <div className="mt-4 flex items-center gap-3 border-t border-white/10 px-1 pt-4"><CircleUserRound className="size-8 text-slate-400" /><div><p className="text-xs font-medium">Equipe NOC</p><p className="text-[11px] text-emerald-400">● Operação ativa</p></div></div>
    </aside>

    <section className="lg:pl-64">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur sm:px-5 lg:px-8">
        <button onClick={() => setActive('inicio')} className="flex min-w-0 items-center gap-2 lg:hidden"><Network className="size-5 shrink-0 text-[#ff6b2c]" /><b className="hidden truncate min-[380px]:block">NOC Megalink</b></button>
        <div className="relative hidden w-full max-w-lg sm:block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setActive('pesquisa'); }} placeholder="Pesquisar em todos os cadastros..." className="h-10 border-0 bg-slate-100 pl-10" /></div>
        <div className="flex shrink-0 items-center gap-2"><Button onClick={toggleTheme} variant="outline" size="icon-lg" aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}>{darkMode ? <Sun /> : <Moon />}</Button><Button onClick={startNewRecord} className="h-9 bg-[#ff6b2c] px-3 text-white hover:bg-[#e85b20] sm:px-4"><Plus /><span className="hidden sm:inline">Novo cadastro</span><span className="sm:hidden">Novo</span></Button></div>
      </header>

      <div className="mx-auto max-w-[1440px] p-4 sm:p-5 lg:p-8">
        {storageError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{storageError}</div>}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ef6427] sm:text-xs sm:tracking-[.16em]">Central de conhecimento</p><h1 className="text-2xl font-semibold sm:text-3xl">{title[active]}</h1><p className="mt-1 text-sm text-slate-500">Organize os dados por categoria e encontre rapidamente o que precisa.</p></div>{active === 'categorias' && <Button onClick={() => setShowCategoryForm(true)} variant="outline"><Plus />Criar categoria</Button>}</div>

        {active === 'inicio' && <>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
            ['VLANs', records.filter((r) => r.kind === 'vlan').length, Network, '#ff6b2c', 'vlans'],
            ['Câmeras', records.filter((r) => r.kind === 'camera').length, Camera, '#4f7cff', 'cameras'],
            ['Pontos', records.filter((r) => r.kind === 'point').length, MapPin, '#20a57a', 'pontos'],
            ['Categorias', categories.length, Tag, '#8b5cf6', 'categorias'],
          ].map(([label, count, Icon, color, view]) => <button key={String(label)} onClick={() => setActive(view as ActiveView)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_8px_30px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5"><div className="mb-5 flex items-center justify-between"><span className="text-sm text-slate-500">{String(label)}</span><span className="grid size-9 place-items-center rounded-xl" style={{ backgroundColor: `${String(color)}18`, color: String(color) }}><Icon className="size-4" /></span></div><strong className="text-3xl">{Number(count)}</strong></button>)}</div>
          <RecordList title="Atualizações recentes" items={records.slice(0, 8)} categories={categories} onSelect={setSelected} />
        </>}

        {(active === 'pesquisa' || ['informacoes', 'vlans', 'cameras', 'pontos'].includes(active)) && <div className="space-y-4"><div className="relative sm:hidden"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar..." className="h-11 bg-white pl-10" /></div><RecordList title={query ? `${filtered.length} resultado(s) para “${query}”` : title[active]} items={filtered} categories={categories} onSelect={setSelected} /></div>}

        {active === 'categorias' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <article key={category.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl" style={{ background: `${category.color}18`, color: category.color }}><Tag className="size-5" /></span><Button onClick={() => setEditingCategory(category)} variant="ghost" size="sm">Editar</Button></div><div className="mb-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kindLabels[category.scope]}</div><h2 className="font-semibold">{category.name}</h2><p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-500">{category.description}</p><div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">{records.filter((r) => r.categoryId === category.id).length} cadastros vinculados</div></article>)}</div>}
      </div>
    </section>

    <nav aria-label="Navegação móvel" className="mobile-nav fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white/95 px-1 pt-1 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur lg:hidden">
      {nav.map(([id, label, Icon]) => <button key={id} onClick={() => setActive(id)} className={`flex min-h-14 min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-medium transition ${active === id ? 'bg-[#ff6b2c]/10 text-[#e85b20]' : 'text-slate-500'}`} aria-current={active === id ? 'page' : undefined}><Icon className="size-5" /><span className="whitespace-nowrap">{label}</span></button>)}
    </nav>

    {(recordFormKind || showCategoryForm || editingCategory || editingRecord || selected) && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07111f]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={() => { setRecordFormKind(null); setShowCategoryForm(false); setEditingCategory(null); setEditingRecord(null); setSelected(null); }}><div onMouseDown={(event) => event.stopPropagation()} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-6">
      {recordFormKind && <RecordForm kind={recordFormKind} categories={categories} action={createRecord} close={() => setRecordFormKind(null)} />}
      {editingRecord && <RecordForm kind={editingRecord.kind} categories={categories} record={editingRecord} action={saveRecord} close={() => setEditingRecord(null)} />}
      {showCategoryForm && <CategoryForm action={createCategory} close={() => setShowCategoryForm(false)} />}
      {editingCategory && <CategoryForm category={editingCategory} action={saveCategory} close={() => setEditingCategory(null)} />}
      {selected && <RecordDetails record={selected} category={categories.find((c) => c.id === selected.categoryId)} close={() => setSelected(null)} edit={() => { setEditingRecord(selected); setSelected(null); }} />}
    </div></div>}
  </main>;
}

function viewForKind(kind: RecordKind): ActiveView { return kind === 'vlan' ? 'vlans' : kind === 'camera' ? 'cameras' : kind === 'point' ? 'pontos' : 'informacoes'; }

function RecordList({ title, items, categories, onSelect }: { title: string; items: RecordItem[]; categories: Category[]; onSelect: (item: RecordItem) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">{title}</h2><span className="text-xs text-slate-400">{items.length} registros</span></div>{items.length ? <div className="divide-y divide-slate-100">{items.map((item) => { const category = categories.find((c) => c.id === item.categoryId); return <button key={item.id} onClick={() => onSelect(item)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[1.5fr_1fr_auto]"><div className="min-w-0"><b className="block truncate text-sm">{item.title}</b><span className="mt-1 flex items-center gap-2 text-xs text-slate-400"><i className="size-2 rounded-full" style={{ background: category?.color }} />{kindLabels[item.kind]} · {category?.name || 'Sem categoria'}</span></div><div className="hidden min-w-0 sm:block"><span className="block truncate text-xs font-medium text-slate-600">{recordSummary(item)}</span><span className="text-[11px] text-slate-400">{item.updated}</span></div><ChevronRight className="size-4 text-slate-300" /></button>; })}</div> : <div className="px-5 py-16 text-center"><Search className="mx-auto mb-3 size-8 text-slate-300" /><p className="text-sm font-medium">Nenhum cadastro encontrado</p><p className="mt-1 text-xs text-slate-400">Crie o primeiro cadastro ou altere a pesquisa.</p></div>}</section>;
}

function recordSummary(record: RecordItem) {
  if (record.kind === 'vlan') return record.details.neighborhood || 'Bairro não informado';
  if (record.kind === 'camera') return record.details.address || record.details.olt || 'Local não informado';
  if (record.kind === 'point') return record.details.partner || record.details.ip || 'Parceiro não informado';
  return record.responsible || 'Responsável não informado';
}

function RecordForm({ kind, categories, record, action, close }: { kind: RecordKind; categories: Category[]; record?: RecordItem; action: (data: FormData) => void | Promise<void>; close: () => void }) {
  const available = categories.filter((category) => category.scope === kind);
  return <form action={action} className="space-y-4"><FormTitle title={`${record ? 'Editar' : 'Cadastrar'} ${kindLabels[kind]}`} subtitle={`Categoria usada para: ${scopeHelp[kind]}.`} />
    <Field label="Categoria"><select name="categoryId" required defaultValue={record?.categoryId || ''} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Selecione uma categoria</option>{available.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{!available.length && <span className="mt-1 block text-xs text-amber-600">Crie primeiro uma categoria para {kindLabels[kind].toLowerCase()}.</span>}</Field>
    {kind === 'general' && <><Field label="Título / trecho"><Input name="title" required defaultValue={record?.title} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Responsável"><Input name="responsible" required defaultValue={record?.responsible} /></Field><Field label="Validação / designação"><Input name="validation" defaultValue={record?.validation} /></Field></div><Field label="Contato"><Input name="contact" defaultValue={record?.contact} /></Field><Field label="Observações"><TextArea name="notes" defaultValue={record?.notes} /></Field></>}
    {kind === 'vlan' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Número da VLAN"><Input name="vlanNumber" required inputMode="numeric" defaultValue={record?.details.vlanNumber} /></Field><Field label="Bairro"><Input name="neighborhood" required defaultValue={record?.details.neighborhood} /></Field></div>}
    {kind === 'camera' && <><div className="grid gap-4 sm:grid-cols-2"><Field label="Câmera"><Input name="camera" required defaultValue={record?.details.camera} /></Field><Field label="Bairro"><Input name="neighborhood" required defaultValue={record?.details.neighborhood} /></Field></div><Field label="Endereço"><Input name="address" required defaultValue={record?.details.address} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Referência"><Input name="reference" defaultValue={record?.details.reference} /></Field><Field label="Geolocalização"><Input name="geolocation" placeholder="Latitude, longitude ou link" defaultValue={record?.details.geolocation} /></Field><Field label="OLT"><Input name="olt" defaultValue={record?.details.olt} /></Field><Field label="Sinal"><Input name="signal" placeholder="Ex.: -18 dBm" defaultValue={record?.details.signal} /></Field></div><Field label="Serial number"><Input name="serialNumber" defaultValue={record?.details.serialNumber} /></Field><Field label="Descrição"><TextArea name="description" defaultValue={record?.details.description} /></Field></>}
    {kind === 'point' && <><div className="grid gap-4 sm:grid-cols-2"><Field label="Local"><Input name="location" required defaultValue={record?.details.location} /></Field><Field label="Empresa / parceiro"><Input name="partner" required defaultValue={record?.details.partner} /></Field></div><Field label="Endereço"><Input name="address" required defaultValue={record?.details.address} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Velocidade"><Input name="speed" placeholder="Ex.: 500 Mbps" defaultValue={record?.details.speed} /></Field><Field label="Data"><Input name="date" type="date" defaultValue={record?.details.date} /></Field><Field label="IP"><Input name="ip" placeholder="Ex.: 192.0.2.10" defaultValue={record?.details.ip} /></Field></div></>}
    <FormActions close={close} submit={record ? 'Salvar alterações' : 'Cadastrar'} disabled={!available.length} />
  </form>;
}

function CategoryForm({ category, action, close }: { category?: Category; action: (data: FormData) => void | Promise<void>; close: () => void }) {
  return <form action={action} className="space-y-4"><FormTitle title={category ? 'Editar categoria' : 'Criar categoria'} subtitle="Escolha onde a categoria será utilizada e explique seu objetivo." /><Field label="Usar esta categoria em"><select name="scope" defaultValue={category?.scope || 'general'} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label} — {scopeHelp[id as RecordKind]}</option>)}</select></Field><Field label="Nome"><Input name="name" required defaultValue={category?.name} placeholder="Ex.: Região Serrana, Prefeitura, EDP" /></Field><Field label="Descrição"><TextArea name="description" required defaultValue={category?.description} placeholder="Explique quais cadastros pertencem a esta categoria." /></Field><Field label="Cor"><input name="color" type="color" defaultValue={category?.color || '#8b5cf6'} className="h-10 w-20 cursor-pointer rounded-lg border border-slate-200 p-1" /></Field><FormActions close={close} submit={category ? 'Salvar alterações' : 'Criar categoria'} /></form>;
}

function RecordDetails({ record, category, close, edit }: { record: RecordItem; category?: Category; close: () => void; edit: () => void }) {
  const detailLabels: Record<string, string> = { vlanNumber: 'Número da VLAN', neighborhood: 'Bairro', camera: 'Câmera', address: 'Endereço', reference: 'Referência', geolocation: 'Geolocalização', olt: 'OLT', description: 'Descrição', signal: 'Sinal', serialNumber: 'Serial number', location: 'Local', speed: 'Velocidade', date: 'Data', partner: 'Parceiro', ip: 'IP' };
  const general = record.kind === 'general' ? [['Responsável', record.responsible], ['Validação / designação', record.validation], ['Contato', record.contact], ['Observações', record.notes]] : [];
  return <div><FormTitle title={record.title} subtitle={`${kindLabels[record.kind]} · ${category?.name || 'Sem categoria'}`} /><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[...general, ...Object.entries(record.details || {}).map(([key, item]) => [detailLabels[key] || key, item])].filter(([, item]) => item).map(([label, item]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm">{item}</dd></div>)}</dl><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={close}>Fechar</Button><Button onClick={edit}>Editar cadastro</Button></div></div>;
}

function TextArea(props: React.ComponentProps<'textarea'>) { return <textarea rows={3} {...props} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#ff6b2c]" />; }
function FormTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function FormActions({ close, submit, disabled }: { close: () => void; submit: string; disabled?: boolean }) { return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={disabled} className="bg-[#ff6b2c] text-white hover:bg-[#e85b20]">{submit}</Button></div>; }
