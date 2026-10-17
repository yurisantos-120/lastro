'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BookOpenText, Boxes, Camera, ChevronRight, CircleUserRound,
  LayoutDashboard, MapPin, Menu, Moon, Network, Plus, Search, Settings2, Sun, Tag, Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TicketsSection } from '@/components/tickets-section';
import { UserSession, useAuth } from '@/components/auth-provider';
import { canOperateTickets, canTestGlpi, canWriteData } from '@/lib/auth-ui';
import type { RecordDetails } from '@/db/data-types';

type RecordKind = 'general' | 'vlan' | 'camera' | 'point';
type ActiveView = 'inicio' | 'pesquisa' | 'informacoes' | 'vlans' | 'cameras' | 'pontos' | 'categorias' | 'chamados';
type Category = { id: number; name: string; description: string; color: string; scope: RecordKind; revision: number };
type RecordItem = {
  id: number; title: string; categoryId: number; responsible: string; validation: string;
  contact: string; notes: string; updated: string; kind: RecordKind; details: RecordDetails; revision: number;
};

class DataApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const activeKind: Partial<Record<ActiveView, RecordKind>> = { informacoes: 'general', vlans: 'vlan', cameras: 'camera', pontos: 'point' };

const emptyCategories: Category[] = [];
const emptyRecords: RecordItem[] = [];
const readTheme = () => {
  const saved = window.localStorage.getItem('noc-megalink-theme');
  return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};
const serverTheme = () => false;
function createThemeStore() {
  let snapshot: boolean | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => (snapshot ??= readTheme()),
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => { listeners.delete(notify); };
    },
    set: (next: boolean) => {
      snapshot = next;
      listeners.forEach((notify) => notify());
    },
  };
}
const kindLabels: Record<RecordKind, string> = { general: 'Rota', vlan: 'VLAN', camera: 'Câmera', point: 'Ponto' };
const scopeHelp: Record<RecordKind, string> = {
  general: 'Categoria ou subtipo da rota operacional',
  vlan: 'Região ou agrupamento das VLANs',
  camera: 'Responsável pelas câmeras',
  point: 'Empresa ou cliente atendido',
};

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
}

export default function Home() {
  const { user, request } = useAuth();
  const [active, setActive] = useState<ActiveView>('inicio');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>(emptyCategories);
  const [records, setRecords] = useState<RecordItem[]>(emptyRecords);
  const [recordFormKind, setRecordFormKind] = useState<RecordKind | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [editConflict, setEditConflict] = useState<{ kind: 'record' | 'category'; id: number; message: string } | null>(null);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const modalTrigger = useRef<HTMLElement | null>(null);
  const mainContent = useRef<HTMLElement | null>(null);
  const modalOpen = Boolean(recordFormKind || showCategoryForm || editingCategory || editingRecord || selected);
  const modalContentKey = selected ? `details-${selected.id}`
    : editingRecord ? `record-edit-${editingRecord.id}`
    : editingCategory ? `category-edit-${editingCategory.id}`
    : showCategoryForm ? 'category-create'
    : recordFormKind ? `record-create-${recordFormKind}`
    : '';
  const attachModal = useCallback((dialog: HTMLDialogElement | null) => {
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const [themeStore] = useState(createThemeStore);
  const darkMode = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, serverTheme);
  const [storageError, setStorageError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const canWrite = user ? canWriteData(user.role) : false;
  const canOperate = user ? canOperateTickets(user.role) : false;
  const canAdminister = user ? canTestGlpi(user.role) : false;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (modalOpen) {
      wasModalOpen.current = true;
      const dialog = document.querySelector<HTMLDialogElement>('[aria-labelledby="record-dialog-title"]');
      if (!dialog) return;
      const handleBackdropMouseDown = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        setRecordFormKind(null);
        setShowCategoryForm(false);
        setEditingCategory(null);
        setEditingRecord(null);
        setEditConflict(null);
        setSelected(null);
      };
      dialog.addEventListener('mousedown', handleBackdropMouseDown);
      return () => dialog.removeEventListener('mousedown', handleBackdropMouseDown);
    }
    if (wasModalOpen.current) {
      wasModalOpen.current = false;
      const restoreFrame = window.requestAnimationFrame(() => {
        const trigger = modalTrigger.current;
        modalTrigger.current = null;
        if (trigger?.isConnected) trigger.focus();
        else mainContent.current?.focus();
      });
      return () => window.cancelAnimationFrame(restoreFrame);
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalContentKey) return;
    const dialog = document.querySelector<HTMLDialogElement>('[aria-labelledby="record-dialog-title"]');
    const firstControl = dialog?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    firstControl?.focus({ preventScroll: true });
  }, [modalContentKey]);

  function rememberModalTrigger(trigger?: HTMLElement) {
    if (!modalTrigger.current) {
      const activeElement = document.activeElement;
      modalTrigger.current = trigger || (activeElement instanceof HTMLElement ? activeElement : null);
    }
  }

  function handleDialogCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    setRecordFormKind(null);
    setShowCategoryForm(false);
    setEditingCategory(null);
    setEditingRecord(null);
    setEditConflict(null);
    setSelected(null);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((control) => control.getClientRects().length > 0 && !control.closest('[hidden], [inert]'));
    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        const response = await request('/api/data', { cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível acessar o banco de dados.');
        const data = await response.json() as { categories: Category[]; records: RecordItem[] };
        setCategories(data.categories); setRecords(data.records); setStorageError('');
      } catch (error) { setStorageError(error instanceof Error ? error.message : 'Falha ao carregar os dados.'); }
    }
    void loadData();
  }, [request]);

  async function persist(method: 'POST' | 'PUT', payload: Record<string, unknown>) {
    if (!canWrite) throw new DataApiError('Seu perfil permite somente visualizar os dados.', 403);
    const response = await request('/api/data', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new DataApiError(body?.error || 'Não foi possível salvar no banco de dados.', response.status);
    }
    const data = await response.json() as { categories: Category[]; records: RecordItem[] };
    setCategories(data.categories); setRecords(data.records); setStorageError('');
  }

  async function reloadConflictingEdit() {
    if (!editConflict) return;
    try {
      const response = await request('/api/data', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível recarregar os dados atuais.');
      const data = await response.json() as { categories: Category[]; records: RecordItem[] };
      setCategories(data.categories);
      setRecords(data.records);
      if (editConflict.kind === 'category') {
        const latest = data.categories.find((item) => item.id === editConflict.id);
        if (!latest) throw new Error('A categoria não foi encontrada.');
        setEditingCategory(latest);
      } else {
        const latest = data.records.find((item) => item.id === editConflict.id);
        if (!latest) throw new Error('O registro não foi encontrado.');
        setEditingRecord(latest);
      }
      setEditConflict(null);
      setStorageError('');
    } catch (error) {
      setEditConflict({ ...editConflict, message: error instanceof Error ? error.message : 'Não foi possível recarregar os dados atuais.' });
    }
  }

  function toggleTheme() {
    const next = !darkMode;
    themeStore.set(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('noc-megalink-theme', next ? 'dark' : 'light');
  }

  function startNewRecord(event: React.MouseEvent<HTMLButtonElement>) {
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    const map: Partial<Record<ActiveView, RecordKind>> = { vlans: 'vlan', cameras: 'camera', pontos: 'point', informacoes: 'general' };
    setRecordFormKind(map[active] || 'general');
  }

  function startCategoryForm(event: React.MouseEvent<HTMLButtonElement>) {
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    setShowCategoryForm(true);
  }

  function editCategory(category: Category, event: React.MouseEvent<HTMLButtonElement>) {
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    setEditingCategory(category);
  }

  function selectRecord(record: RecordItem, trigger: HTMLButtonElement) {
    rememberModalTrigger(trigger);
    setSelected(record);
  }

  function recordPayload(formData: FormData, kind: RecordKind, id?: number) {
    const details: RecordDetails = {};
    const fields: Record<RecordKind, string[]> = {
      general: [], vlan: ['vlanNumber', 'neighborhood'],
      camera: ['camera', 'alternateIdentifier', 'neighborhood', 'address', 'reference', 'geolocation', 'olt', 'description', 'signal', 'serialNumber', 'ipAddress', 'tunnelIp', 'eoipId', 'onuIdentifier', 'vlanNumber', 'macAddress'],
      point: ['location', 'address', 'speed', 'date', 'partner', 'ip', 'provider', 'dhcpInternal', 'onu', 'onuIdentifier', 'olt', 'macAddress', 'connectionPort', 'opticalSignal', 'activationDate', 'installationTechnician'],
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
      await persist('PUT', { ...payload, kind: 'record', recordType: editingRecord.kind, details: payload.details, revision: editingRecord.revision });
      setEditingRecord(null);
      setEditConflict(null);
    } catch (error) {
      if (error instanceof DataApiError && error.status === 409) setEditConflict({ kind: 'record', id: editingRecord.id, message: error.message });
      else setStorageError(error instanceof Error ? error.message : 'Falha ao atualizar.');
    }
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
      await persist('PUT', { kind: 'category', id: editingCategory.id, revision: editingCategory.revision, name: value(formData, 'name'), description: value(formData, 'description'), color: value(formData, 'color'), scope: value(formData, 'scope') });
      setEditingCategory(null);
      setEditConflict(null);
    } catch (error) {
      if (error instanceof DataApiError && error.status === 409) setEditConflict({ kind: 'category', id: editingCategory.id, message: error.message });
      else setStorageError(error instanceof Error ? error.message : 'Falha ao atualizar.');
    }
  }

  const filtered = useMemo(() => {
    const term = query.toLocaleLowerCase('pt-BR').trim();
    return records.filter((item) => {
      if (activeKind[active] && item.kind !== activeKind[active]) return false;
      if (!term) return true;
      const category = categories.find((entry) => entry.id === item.categoryId)?.name || '';
      return [item.title, item.responsible, item.validation, item.contact, item.notes, category, ...Object.values(item.details || {})].join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [active, query, records, categories]);

  const nav = [
    ['inicio', 'Visão geral', LayoutDashboard], ['pesquisa', 'Pesquisa', Search], ['informacoes', 'Rotas', BookOpenText],
    ['vlans', 'VLANs', Network], ['cameras', 'Câmeras', Camera], ['pontos', 'Pontos', MapPin], ['categorias', 'Categorias', Boxes], ['chamados', 'Chamados', Ticket],
  ] as const;
  const stats: Array<[string, number, LucideIcon, string, ActiveView]> = [
    ['Rotas', records.filter((r) => r.kind === activeKind.informacoes).length, Network, '#0891b2', 'informacoes'],
    ['VLANs', records.filter((r) => r.kind === 'vlan').length, Network, '#ff6b2c', 'vlans'],
    ['Câmeras', records.filter((r) => r.kind === 'camera').length, Camera, '#4f7cff', 'cameras'],
    ['Pontos', records.filter((r) => r.kind === 'point').length, MapPin, '#20a57a', 'pontos'],
    ['Categorias', categories.length, Tag, '#8b5cf6', 'categorias'],
  ];
  const title: Record<ActiveView, string> = { inicio: 'Visão geral', pesquisa: 'Pesquisa', informacoes: 'Rotas', vlans: 'VLANs', cameras: 'Câmeras', pontos: 'Pontos atendidos', categorias: 'Categorias', chamados: 'Chamados' };

  if (!user) return null;

  return <main ref={mainContent} tabIndex={-1} className="min-h-screen bg-[#f4f6f8] pb-24 text-[#17202a] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff6b2c] lg:pb-0">
    <aside className={`noc-sidebar fixed inset-y-0 left-0 z-20 hidden flex-col overflow-hidden border-r px-3 py-4 text-white transition-all duration-300 lg:flex ${sidebarOpen ? 'w-64' : 'w-[72px]'}`}>
      <div className="mb-5 flex items-center gap-3 px-1">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ff6b2c]"><Network className="size-5" /></div>
        {sidebarOpen && <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-300">Eidos</p><p className="truncate text-lg font-semibold text-white">Lastro</p></div>}
      </div>

      {sidebarOpen ? (
        <div className="noc-team-card mb-5 flex items-center gap-3 rounded-2xl border px-3 py-2.5">
          <CircleUserRound className="size-8 text-slate-200" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-100">{user.name}</p>
            <p className="mt-0.5 text-[11px] text-emerald-400">{user.role === 'admin' ? 'Administrador' : user.role === 'operator' ? 'Operação' : 'Visualização'}</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex justify-center">
          <div className="relative grid size-10 place-items-center rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100" aria-label="Equipe NOC">
            <CircleUserRound className="size-5 text-slate-200" />
            <span className="absolute -right-1 -top-1 block size-2.5 rounded-full bg-emerald-500" aria-label="Operação ativa" />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2">
        <Button type="button" onClick={() => setSidebarOpen((value) => !value)} variant={sidebarOpen ? 'default' : 'outline'} className={`h-11 w-full ${sidebarOpen ? 'justify-start bg-slate-800/80 px-3 text-slate-100 hover:bg-slate-700' : 'mx-auto w-11 justify-center rounded-xl border border-slate-600 bg-slate-800/80 px-0 text-slate-100 hover:bg-slate-700'}`} aria-label={sidebarOpen ? 'Recolher barra lateral' : 'Expandir barra lateral'}>
          <Menu className="size-4" />
          {sidebarOpen && <span className="ml-2">Menu</span>}
        </Button>

        {canWrite && <Button onClick={startNewRecord} className={`h-11 w-full ${sidebarOpen ? 'justify-start bg-[#ff6b2c] px-3 text-white hover:bg-[#e85b20]' : 'mx-auto w-11 justify-center rounded-xl bg-[#ff6b2c] px-0 text-white hover:bg-[#e85b20]'}`} aria-label={active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}>
          <Plus className="size-4" />
          {sidebarOpen && <span className="ml-2">{active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}</span>}
        </Button>}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {nav.map(([id, label, Icon]) => <button key={id} aria-label={label} onClick={() => setActive(id)} className={`noc-nav-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active === id ? 'noc-nav-button--active' : 'text-slate-300'} ${!sidebarOpen && 'justify-center px-2'}`}><Icon className={`size-4 ${active === id ? 'text-[#ff9d6c]' : 'text-slate-300'}`} />{sidebarOpen && label}</button>)}
      </nav>

      {sidebarOpen && <div className="noc-base-card mt-4 shrink-0 rounded-2xl border p-3">
        <div className="mb-2 flex items-center gap-2"><Settings2 className="size-4 text-[#ff9d6c]" /><span className="text-xs font-semibold text-slate-100">Base operacional</span></div>
        <p className="text-xs leading-relaxed text-slate-300">VLANs, câmeras, pontos e rotas organizadas por categoria.</p>
      </div>}

      <div className={`mt-4 ${sidebarOpen ? 'px-1' : 'flex justify-center'}`}>
        <Button onClick={toggleTheme} variant={sidebarOpen ? 'outline' : 'ghost'} className={`noc-theme-button ${sidebarOpen ? 'w-full justify-start' : 'h-10 w-10 justify-center rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700'} `} aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}>
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {sidebarOpen && <span className="ml-2">Tema</span>}
        </Button>
      </div>
    </aside>

    <div className={`fixed left-4 top-4 z-30 transition-all duration-300 ${sidebarOpen ? 'lg:left-[17.25rem]' : 'lg:left-[5.1rem]'}`}>
      <div className={`noc-search relative flex h-11 items-center overflow-hidden rounded-2xl transition-all duration-300 ${searchExpanded || query ? 'w-[min(72vw,360px)]' : 'w-11'}`}>
        <button type="button" onClick={() => setSearchExpanded((value) => !value)} className="z-10 grid size-11 shrink-0 place-items-center rounded-2xl text-slate-500 transition hover:bg-slate-200" aria-label="Pesquisar">
          <Search className="size-4" />
        </button>
        <Input value={query} onFocus={() => setSearchExpanded(true)} onBlur={() => { if (!query) setSearchExpanded(false); }} onChange={(event) => { const nextValue = event.target.value; setQuery(nextValue); if (nextValue) { setActive('pesquisa'); setSearchExpanded(true); } else { setSearchExpanded(false); } }} placeholder="Pesquisar..." className={`h-full border-0 bg-transparent pl-1 pr-3 text-sm text-slate-700 outline-none ring-0 transition-all duration-300 ${searchExpanded || query ? 'visible w-full opacity-100' : 'invisible w-0 opacity-0'}`} />
      </div>
    </div>

    <section className={`transition-all duration-300 pt-20 ${sidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]'}`}>
      <div className="mx-auto max-w-[1440px] p-4 sm:p-5 lg:p-8">
        {storageError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{storageError}</div>}
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ef6427] sm:text-xs sm:tracking-[.16em]">Central de conhecimento</p><h1 className="text-2xl font-semibold sm:text-3xl">{title[active]}</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">{active === 'chamados' ? 'Gerencie a abertura e o acompanhamento de chamados integrados ao GLPI.' : active === 'informacoes' ? 'Consulte rotas operacionais, responsáveis, contatos e designações.' : 'Organize os dados por categoria e encontre rapidamente o que precisa.'}</p></div><div className="flex max-w-full flex-wrap items-center justify-end gap-2"><UserSession />{active !== 'chamados' && canWrite && <Button onClick={startNewRecord} className="lg:hidden"><Plus />{active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}</Button>}{active === 'categorias' && canWrite && <Button onClick={startCategoryForm} variant="outline"><Plus />Criar categoria</Button>}</div></div>

        {active === 'chamados' && <TicketsSection canCreate={canOperate} canViewDetails={canOperate} showGlpiTest={canAdminister} request={request} />}

        {active === 'inicio' && <>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{stats.map(([label, count, Icon, color, view]) => <button key={String(label)} onClick={() => setActive(view)} className="noc-stat-card rounded-2xl p-5 text-left transition hover:-translate-y-0.5"><div className="mb-5 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">{String(label)}</span><span className="grid size-9 place-items-center rounded-xl" style={{ backgroundColor: `${String(color)}18`, color: String(color) }}><Icon className="size-4" /></span></div><strong className="text-3xl font-semibold">{Number(count)}</strong></button>)}</div>
          <RecordList title="Atualizações recentes" items={records.slice(0, 8)} categories={categories} onSelect={selectRecord} />
        </>}

        {(active === 'pesquisa' || ['informacoes', 'vlans', 'cameras', 'pontos'].includes(active)) && <div className="space-y-4"><RecordList title={query ? `${filtered.length} resultado(s) para “${query}”` : title[active]} items={filtered} categories={categories} onSelect={selectRecord} /></div>}

        {active === 'categorias' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <article key={category.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl" style={{ background: `${category.color}18`, color: category.color }}><Tag className="size-5" /></span>{canWrite && <Button onClick={(event) => editCategory(category, event)} variant="ghost" size="sm">Editar</Button>}</div><div className="mb-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kindLabels[category.scope]}</div><h2 className="font-semibold">{category.name}</h2><p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-500">{category.description}</p><div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">{records.filter((r) => r.categoryId === category.id).length} cadastros vinculados</div></article>)}</div>}
      </div>
    </section>

    <nav aria-label="Navegação móvel" className="mobile-nav fixed inset-x-0 bottom-0 z-40 flex min-w-0 overflow-x-auto border-t border-slate-200 bg-white/95 px-1 pt-1 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur lg:hidden">
      {nav.map(([id, label, Icon]) => <button key={id} onClick={() => setActive(id)} className={`flex min-h-14 min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-medium transition ${active === id ? 'bg-[#ff6b2c]/10 text-[#e85b20]' : 'text-slate-500'}`} aria-current={active === id ? 'page' : undefined}><Icon className="size-5" /><span className="whitespace-nowrap">{label}</span></button>)}
    </nav>

    {modalOpen && <>
      <dialog ref={attachModal} aria-modal="true" aria-labelledby="record-dialog-title" className="fixed inset-0 z-50 m-0 flex h-dvh w-screen max-h-none max-w-none items-end justify-center overflow-hidden border-0 bg-[#07111f]/55 p-0 text-inherit backdrop-blur-sm backdrop:bg-transparent sm:items-center sm:p-4" onCancel={handleDialogCancel} onKeyDown={handleDialogKeyDown}>
      <div className="relative m-0 max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 text-inherit shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-6">
      {recordFormKind && <RecordForm kind={recordFormKind} categories={categories} action={createRecord} close={() => setRecordFormKind(null)} reload={reloadConflictingEdit} />}
        {editingRecord && <RecordForm key={`${editingRecord.id}-${editingRecord.revision}`} kind={editingRecord.kind} categories={categories} record={editingRecord} action={saveRecord} close={() => { setEditingRecord(null); setEditConflict(null); }} conflict={editConflict?.kind === 'record' ? editConflict.message : undefined} reload={reloadConflictingEdit} />}
      {showCategoryForm && <CategoryForm action={createCategory} close={() => setShowCategoryForm(false)} reload={reloadConflictingEdit} />}
        {editingCategory && <CategoryForm key={`${editingCategory.id}-${editingCategory.revision}`} category={editingCategory} action={saveCategory} close={() => { setEditingCategory(null); setEditConflict(null); }} conflict={editConflict?.kind === 'category' ? editConflict.message : undefined} reload={reloadConflictingEdit} />}
      {selected && <RecordDetails record={selected} category={categories.find((c) => c.id === selected.categoryId)} canEdit={canWrite} close={() => setSelected(null)} edit={() => { if (!canWrite) return; setEditingRecord(selected); setSelected(null); }} />}
      </div>
      </dialog>
    </>}
  </main>;
}

function viewForKind(kind: RecordKind): ActiveView { return kind === 'vlan' ? 'vlans' : kind === 'camera' ? 'cameras' : kind === 'point' ? 'pontos' : 'informacoes'; }

function RecordList({ title, items, categories, onSelect }: { title: string; items: RecordItem[]; categories: Category[]; onSelect: (item: RecordItem, trigger: HTMLButtonElement) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">{title}</h2><span className="text-xs text-slate-400">{items.length} registros</span></div>{items.length ? <div className="divide-y divide-slate-100">{items.map((item) => { const category = categories.find((c) => c.id === item.categoryId); return <button key={item.id} onClick={(event) => onSelect(item, event.currentTarget)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[1.5fr_1fr_auto]"><div className="min-w-0"><b className="block truncate text-sm">{item.title}</b><span className="mt-1 flex items-center gap-2 text-xs text-slate-400"><i className="size-2 rounded-full" style={{ background: category?.color }} />{kindLabels[item.kind]} · {category?.name || 'Sem categoria'}</span></div><div className="hidden min-w-0 sm:block"><span className="block truncate text-xs font-medium text-slate-600">{recordSummary(item)}</span><span className="text-[11px] text-slate-400">{item.updated}</span></div><ChevronRight className="size-4 text-slate-300" /></button>; })}</div> : <div className="px-5 py-16 text-center"><Search className="mx-auto mb-3 size-8 text-slate-300" /><p className="text-sm font-medium">Nenhum cadastro encontrado</p><p className="mt-1 text-xs text-slate-400">Crie o primeiro cadastro ou altere a pesquisa.</p></div>}</section>;
}

function recordSummary(record: RecordItem) {
  if (record.kind === 'vlan') return record.details.neighborhood || 'Bairro não informado';
  if (record.kind === 'camera') return record.details.address || record.details.olt || 'Local não informado';
  if (record.kind === 'point') return record.details.partner || record.details.ip || 'Parceiro não informado';
  return record.responsible || 'Responsável não informado';
}

function ConflictNotice({ message, reload }: { message: string; reload: () => void }) {
  return <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p>{message}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={reload}>Recarregar versão atual (substitui o formulário)</Button></div>;
}

function RecordForm({ kind, categories, record, action, close, conflict, reload }: { kind: RecordKind; categories: Category[]; record?: RecordItem; action: (data: FormData) => void | Promise<void>; close: () => void; conflict?: string; reload: () => void }) {
  const available = categories.filter((category) => category.scope === kind);
  return <form action={action} className="space-y-4"><FormTitle title={`${record ? 'Editar' : 'Cadastrar'} ${kindLabels[kind]}`} subtitle={`Categoria usada para: ${scopeHelp[kind]}.`} />
    {conflict && <ConflictNotice message={conflict} reload={reload} />}
    <Field label="Categoria"><select name="categoryId" required defaultValue={record?.categoryId || ''} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Selecione uma categoria</option>{available.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{!available.length && <span className="mt-1 block text-xs text-amber-600">Crie primeiro uma categoria para {kindLabels[kind].toLowerCase()}.</span>}</Field>
    {kind === 'general' && <><Field label="Nome da rota"><Input name="title" required defaultValue={record?.title} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Responsável"><Input name="responsible" required defaultValue={record?.responsible} /></Field><Field label="Validação / designação"><Input name="validation" defaultValue={record?.validation} /></Field></div><Field label="Contato"><Input name="contact" defaultValue={record?.contact} /></Field><Field label="Observações"><TextArea name="notes" defaultValue={record?.notes} /></Field></>}
    {kind === 'vlan' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Número da VLAN"><Input name="vlanNumber" required inputMode="numeric" defaultValue={record?.details.vlanNumber} /></Field><Field label="Bairro"><Input name="neighborhood" required defaultValue={record?.details.neighborhood} /></Field></div>}
    {kind === 'camera' && <>
      <FormSection title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Câmera"><Input name="camera" required defaultValue={record?.details.camera} /></Field><Field label="Identificador alternativo"><Input name="alternateIdentifier" defaultValue={record?.details.alternateIdentifier} /></Field><Field label="Serial number"><Input name="serialNumber" defaultValue={record?.details.serialNumber} /></Field></div>
      </FormSection>
      <FormSection title="Localização">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Bairro"><Input name="neighborhood" required defaultValue={record?.details.neighborhood} /></Field><Field label="Endereço"><Input name="address" required defaultValue={record?.details.address} /></Field><Field label="Referência"><Input name="reference" defaultValue={record?.details.reference} /></Field><Field label="Geolocalização"><Input name="geolocation" placeholder="Latitude, longitude ou link" defaultValue={record?.details.geolocation} /></Field></div>
      </FormSection>
      <FormSection title="Rede e equipamentos associados">
        <p className="text-xs text-slate-500">Os identificadores são armazenados como informados; não criam vínculo automático com outro cadastro.</p>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="IP da câmera"><Input name="ipAddress" inputMode="decimal" placeholder="Ex.: 192.0.2.10" defaultValue={record?.details.ipAddress} /></Field><Field label="IP do túnel"><Input name="tunnelIp" inputMode="decimal" placeholder="Ex.: 192.0.2.20" defaultValue={record?.details.tunnelIp} /></Field><Field label="Identificador EOIP"><Input name="eoipId" inputMode="numeric" defaultValue={record?.details.eoipId} /></Field><Field label="ONU vinculada (identificador)"><Input name="onuIdentifier" defaultValue={record?.details.onuIdentifier} /></Field><Field label="VLAN associada"><Input name="vlanNumber" inputMode="numeric" placeholder="1–4094" defaultValue={record?.details.vlanNumber} /></Field><Field label="Endereço MAC"><Input name="macAddress" placeholder="AA:BB:CC:DD:EE:FF" defaultValue={record?.details.macAddress} /></Field><Field label="OLT"><Input name="olt" defaultValue={record?.details.olt} /></Field><Field label="Sinal"><Input name="signal" placeholder="Ex.: -18 dBm" defaultValue={record?.details.signal} /></Field></div>
      </FormSection>
      <FormSection title="Descrição"><Field label="Descrição"><TextArea name="description" defaultValue={record?.details.description} /></Field></FormSection>
    </>}
    {kind === 'point' && <>
      <FormSection title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Local"><Input name="location" required defaultValue={record?.details.location} /></Field><Field label="Empresa / parceiro"><Input name="partner" required defaultValue={record?.details.partner} /></Field><Field label="Provedor de internet"><Input name="provider" defaultValue={record?.details.provider} /></Field></div>
      </FormSection>
      <FormSection title="Localização">
        <Field label="Endereço"><Input name="address" required defaultValue={record?.details.address} /></Field>
      </FormSection>
      <FormSection title="Conectividade">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Velocidade"><Input name="speed" placeholder="Ex.: 500 Mbps" defaultValue={record?.details.speed} /></Field><Field label="IP"><Input name="ip" placeholder="Ex.: 192.0.2.10" defaultValue={record?.details.ip} /></Field><Field label="DHCP interno"><Input name="dhcpInternal" defaultValue={record?.details.dhcpInternal} /></Field><Field label="ONU / modelo"><Input name="onu" defaultValue={record?.details.onu} /></Field><Field label="Identificador da ONU"><Input name="onuIdentifier" defaultValue={record?.details.onuIdentifier} /></Field><Field label="OLT vinculada"><Input name="olt" defaultValue={record?.details.olt} /></Field><Field label="Endereço MAC"><Input name="macAddress" placeholder="AA:BB:CC:DD:EE:FF" defaultValue={record?.details.macAddress} /></Field><Field label="Porta de conexão"><Input name="connectionPort" defaultValue={record?.details.connectionPort} /></Field></div>
      </FormSection>
      <FormSection title="Datas e informações técnicas">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Data"><Input name="date" type="date" defaultValue={record?.details.date} /></Field><Field label="Data de ativação"><Input name="activationDate" type="date" defaultValue={record?.details.activationDate} /></Field><Field label="Sinal óptico (dBm)"><Input name="opticalSignal" placeholder="Ex.: -18.5 dBm" defaultValue={record?.details.opticalSignal} /></Field><Field label="Técnico da instalação"><Input name="installationTechnician" defaultValue={record?.details.installationTechnician} /></Field></div>
      </FormSection>
    </>}
    <FormActions close={close} submit={record ? 'Salvar alterações' : 'Cadastrar'} disabled={!available.length} />
  </form>;
}

function CategoryForm({ category, action, close, conflict, reload }: { category?: Category; action: (data: FormData) => void | Promise<void>; close: () => void; conflict?: string; reload: () => void }) {
  return <form action={action} className="space-y-4"><FormTitle title={category ? 'Editar categoria' : 'Criar categoria'} subtitle="Escolha onde a categoria será utilizada e explique seu objetivo." />{conflict && <ConflictNotice message={conflict} reload={reload} />}<Field label="Usar esta categoria em"><select name="scope" defaultValue={category?.scope || 'general'} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label} — {scopeHelp[id as RecordKind]}</option>)}</select></Field><Field label="Nome"><Input name="name" required defaultValue={category?.name} placeholder="Ex.: Região Serrana, Prefeitura, EDP" /></Field><Field label="Descrição"><TextArea name="description" required defaultValue={category?.description} placeholder="Explique quais cadastros pertencem a esta categoria." /></Field><Field label="Cor"><input name="color" type="color" defaultValue={category?.color || '#8b5cf6'} className="h-10 w-20 cursor-pointer rounded-lg border border-slate-200 p-1" /></Field><FormActions close={close} submit={category ? 'Salvar alterações' : 'Criar categoria'} /></form>;
}

function RecordDetails({ record, category, canEdit, close, edit }: { record: RecordItem; category?: Category; canEdit: boolean; close: () => void; edit: () => void }) {
  const detailLabels: Record<string, string> = {
    vlanNumber: 'Número da VLAN', neighborhood: 'Bairro', camera: 'Câmera', alternateIdentifier: 'Identificador alternativo',
    address: 'Endereço', reference: 'Referência', geolocation: 'Geolocalização', olt: 'OLT', description: 'Descrição',
    signal: 'Sinal', serialNumber: 'Serial number', location: 'Local', speed: 'Velocidade', date: 'Data', partner: 'Parceiro',
    provider: 'Provedor de internet', ip: 'IP', dhcpInternal: 'DHCP interno', onu: 'ONU / modelo', onuIdentifier: 'Identificador da ONU',
    macAddress: 'Endereço MAC', connectionPort: 'Porta de conexão', opticalSignal: 'Sinal óptico', activationDate: 'Data de ativação',
    installationTechnician: 'Técnico da instalação', ipAddress: 'IP da câmera', tunnelIp: 'IP do túnel', eoipId: 'Identificador EOIP',
  };
  const general = record.kind === 'general' ? [['Responsável', record.responsible], ['Validação / designação', record.validation], ['Contato', record.contact], ['Observações', record.notes]] : [];
  return <div><FormTitle title={record.title} subtitle={`${kindLabels[record.kind]} · ${category?.name || 'Sem categoria'}`} /><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[...general, ...Object.entries(record.details || {}).map(([key, item]) => [detailLabels[key] || key, item])].filter(([, item]) => item).map(([label, item]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm">{item}</dd></div>)}</dl><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={close}>Fechar</Button>{canEdit && <Button onClick={edit}>Editar cadastro</Button>}</div></div>;
}

function TextArea(props: React.ComponentProps<'textarea'>) { return <textarea rows={3} {...props} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#ff6b2c]" />; }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold text-slate-700">{title}</legend>{children}</fieldset>; }
function FormTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 id="record-dialog-title" className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function FormActions({ close, submit, disabled }: { close: () => void; submit: string; disabled?: boolean }) { return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={disabled} className="bg-[#ff6b2c] text-white hover:bg-[#e85b20]">{submit}</Button></div>; }
