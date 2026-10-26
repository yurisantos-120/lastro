'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  BookOpenText, Boxes, Camera, ChevronRight, CircleUserRound,
  LayoutDashboard, MapPin, Menu, Moon, Network, Plus, Search, Settings2, Sun, Tag, Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { CollectionState } from '@/components/collection-state';
import { CatalogCategoryPicker } from '@/components/catalog-category-picker';
import { PointDimensionFilters, emptyPointFilters, type PointFilterValues } from '@/components/point-dimension-filters';
import { PreservedForm, useSubmissionDisabled } from '@/components/preserved-form';
import { confirmedDataReceipt, normalizedDataPayload, readDataIntents, removeDataIntent, saveDataIntent, type DataIntent } from '@/lib/data-intents';
import { FormSubmissionError as DataApiError } from '@/lib/form-submission';
import { TicketsSection } from '@/components/tickets-section';
import { TicketDashboard } from '@/components/ticket-dashboard';
import { UserSession, useAuth } from '@/components/auth-provider';
import { canOperateTickets, canTestGlpi, canWriteData } from '@/lib/auth-ui';
import type { RecordDetails, RecordKind } from '@/db/data-types';
import { pointDimensionFields, type PointDimensionField } from '@/lib/point-dimensions';

type ActiveView = 'inicio' | 'pesquisa' | 'informacoes' | 'vlans' | 'cameras' | 'pontos' | 'categorias' | 'chamados';
type Category = { id: number; name: string; description: string; color: string; scope: RecordKind; revision: number; recordCount?: number };
type RecordItem = {
  id: number; title: string; categoryId: number; responsible: string; validation: string;
  contact: string; notes: string; updated: string; kind: RecordKind; details: RecordDetails; revision: number;
  categoryName?: string; categoryColor?: string;
};
type CatalogPage = { total: number; page: number; pageSize: number; pages: number };
type CatalogSummary = { counts: Record<RecordKind | 'categories', number>; recent: RecordItem[] };

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
  point: 'Agrupamento do ponto; município, cliente e região são campos separados',
};

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
}

export default function Home() {
  const { user, request } = useAuth();
  const [resuming, setResuming] = useState<DataIntent | undefined>();
  const [pendingIntents, setPendingIntents] = useState<DataIntent[]>([]);
  const [confirmedDataMessage, setConfirmedDataMessage] = useState('');
  const [active, setActive] = useState<ActiveView>('inicio');
  const [dashboardTicketId, setDashboardTicketId] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataReload, setDataReload] = useState(0);
  const [formReload, setFormReload] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [appliedCategoryQuery, setAppliedCategoryQuery] = useState('');
  const [searchKind, setSearchKind] = useState<RecordKind | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [pointFilters, setPointFilters] = useState<PointFilterValues>(emptyPointFilters);
  const [appliedPointFilters, setAppliedPointFilters] = useState<PointFilterValues>(emptyPointFilters);
  const [catalogPage, setCatalogPage] = useState<CatalogPage>({ total: 0, page: 1, pageSize: 20, pages: 0 });
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [loadedCatalogKey, setLoadedCatalogKey] = useState('');
  const [categories, setCategories] = useState<Category[]>(emptyCategories);
  const [records, setRecords] = useState<RecordItem[]>(emptyRecords);
  const [recordFormKind, setRecordFormKind] = useState<RecordKind | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [editConflict, setEditConflict] = useState<{ kind: 'record' | 'category'; id: number; message: string } | null>(null);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const mobileNav = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const names: Record<string, string> = { inicio: 'Visão geral', pesquisa: 'Pesquisa', informacoes: 'Rotas', vlans: 'VLANs', cameras: 'Câmeras', pontos: 'Pontos atendidos', categorias: 'Categorias', chamados: 'Chamados' };
    document.title = `${names[active]} · Lastro`;
    if (document.activeElement?.closest('nav')) document.getElementById('lastro-page-title')?.focus({ preventScroll: true });
    const reveal = () => mobileNav.current?.querySelector<HTMLElement>('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const frame = requestAnimationFrame(reveal);
    window.addEventListener('resize', reveal);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', reveal); };
  }, [active]);
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
  useEffect(() => { if (searchExpanded) searchInput.current?.focus(); }, [searchExpanded]);
  const canWrite = user ? canWriteData(user.role) : false;
  const canOperate = user ? canOperateTickets(user.role) : false;
  const canAdminister = user ? canTestGlpi(user.role) : false;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const refreshIntents = useCallback(() => {
    if (!user) return;
    try { setPendingIntents(readDataIntents(window.localStorage,user.id)); } catch { /* Writes fail closed if local persistence is unavailable. */ }
  }, [user]);
  useEffect(() => { let active=true;queueMicrotask(()=>{if(active)refreshIntents();});window.addEventListener('storage',refreshIntents);return () => {active=false;window.removeEventListener('storage',refreshIntents);}; }, [refreshIntents]);
  function resumeOperation(intent:DataIntent) {
    rememberModalTrigger();
    const p=intent.payload;
    setResuming(intent);setEditConflict(null);
    if(p.kind==='category') {
      if(intent.method==='POST')setShowCategoryForm(true);
      else setEditingCategory(p as unknown as Category);
    } else {
      if(intent.method==='POST')setRecordFormKind(p.recordType as RecordKind);
      else setEditingRecord({...p,kind:p.recordType,updated:''} as unknown as RecordItem);
    }
  }

  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (modalOpen) {
      wasModalOpen.current = true;
      const dialog = document.querySelector<HTMLDialogElement>('[aria-labelledby="record-dialog-title"]');
      if (!dialog) return;
      const handleBackdropMouseDown = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        if (dialog.querySelector('form[aria-busy="true"]')) return;
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
  }, [modalContentKey, formReload]);

  function rememberModalTrigger(trigger?: HTMLElement) {
    if (!modalTrigger.current) {
      const activeElement = document.activeElement;
      modalTrigger.current = trigger || (activeElement instanceof HTMLElement ? activeElement : null);
    }
  }

  function handleDialogCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (event.currentTarget.querySelector('form[aria-busy="true"]')) return;
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

  useEffect(() => { const timer = setTimeout(() => setAppliedQuery(query), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { const timer = setTimeout(() => setAppliedCategoryQuery(categoryQuery), 250); return () => clearTimeout(timer); }, [categoryQuery]);
  useEffect(() => { const timer = setTimeout(() => setAppliedPointFilters(pointFilters), 250); return () => clearTimeout(timer); }, [pointFilters]);
  const catalogKey = `${active}|${appliedQuery}|${appliedCategoryQuery}|${searchKind}|${categoryFilter ?? ''}|${Object.values(appliedPointFilters).join('|')}|${page}|${pageSize}|${dataReload}`;
  const catalogLoading = dataLoading || loadedCatalogKey !== catalogKey;
  useEffect(() => {
    const resource = active === 'inicio' ? 'summary' : active === 'categorias' ? 'categories'
      : active === 'pesquisa' || activeKind[active] ? 'records' : null;
    if (!resource) return;
    const controller = new AbortController();
    async function loadData() {
      setDataLoading(true); setStorageError('');
      try {
        const params = new URLSearchParams({ resource: resource! });
        if (resource !== 'summary') { params.set('page', String(page)); params.set('pageSize', String(pageSize)); }
        if (resource !== 'summary') params.set('q', resource === 'categories' ? appliedCategoryQuery : appliedQuery);
        if (resource === 'records' && (activeKind[active] || searchKind)) params.set('kind', activeKind[active] || searchKind);
        if (resource === 'records' && categoryFilter) params.set('categoryId', String(categoryFilter));
        if (resource === 'records' && active === 'pontos') for (const field of pointDimensionFields) {
          if (appliedPointFilters[field]) params.set(field, appliedPointFilters[field]);
        }
        const response = await request(`/api/data?${params}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Não foi possível atualizar a listagem cadastral. Use Tentar novamente.');
        const data = await response.json() as Partial<CatalogSummary & CatalogPage> & { categories?: Category[]; records?: RecordItem[] };
        if (controller.signal.aborted) return;
        if (resource === 'summary') setSummary(data as CatalogSummary);
        else {
          setCatalogPage({ total: data.total ?? 0, page: data.page ?? 1, pageSize: data.pageSize ?? pageSize, pages: data.pages ?? 0 });
          if (resource === 'categories') setCategories(data.categories ?? []);
          else setRecords(data.records ?? []);
        }
      } catch (error) { if (!controller.signal.aborted) setStorageError(error instanceof Error ? error.message : 'Falha ao carregar os dados.'); }
      finally { if (!controller.signal.aborted) { setLoadedCatalogKey(catalogKey); setDataLoading(false); } }
    }
    void loadData();
    return () => controller.abort();
  }, [request, catalogKey, active, appliedQuery, appliedCategoryQuery, searchKind, categoryFilter, appliedPointFilters, page, pageSize]);

  async function persist(method: 'POST' | 'PUT', raw: Record<string, unknown>, fields:FormData) {
    setConfirmedDataMessage('');
    if (!canWrite || !user) throw new DataApiError('Seu perfil permite somente visualizar os dados.',403);
    let payload:Record<string,unknown>;
    try { payload=normalizedDataPayload(method,raw); } catch(error) { throw new DataApiError(error instanceof Error?error.message:'Dados inválidos.',400); }
    const rawKey=fields.get('_dataOperationKey'),key=typeof rawKey==='string'?rawKey:'';
    const label=typeof payload.name==='string'?payload.name:typeof payload.title==='string'?payload.title:'Cadastro';
    const intent:DataIntent={key,actorId:user.id,method,payload,fields:[...fields.entries()].filter((pair):pair is [string,string]=>pair[0]!=='_dataOperationKey'&&typeof pair[1]==='string'),label,createdAt:new Date().toISOString()};
    let prior=false;
    try { prior=readDataIntents(window.localStorage,user.id).some(i=>i.key===key);saveDataIntent(window.localStorage,intent);refreshIntents(); }
    catch(error) { throw new DataApiError(error instanceof Error?error.message:'Não foi possível preservar a intenção localmente. Nenhuma requisição foi enviada.',503,prior||resuming?.key===key,'LOCAL_PERSISTENCE_UNAVAILABLE'); }
    let response:Response;
    let recovering=prior;
    try {
      if(prior) {
        response=await request('/api/data/operations/'+key,{cache:'no-store'});
        if(response.status===404){recovering=false;response=await request('/api/data',{method,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});}
      } else response=await request('/api/data',{method,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
    } catch { throw new DataApiError('Resposta não confirmada. A mesma intenção foi preservada para consulta.',0,true); }
    if(!response.ok) {
      const body=await response.json().catch(()=>null) as {error?:string;code?:string;outcome?:string}|null;
      const unknown=recovering||body?.outcome==='blocked'||(response.status>=500&&body?.outcome!=='rejected')||response.status===408||(prior&&(response.status===401||response.status===403));
      if(!unknown){try{removeDataIntent(window.localStorage,user.id,key);}catch{}refreshIntents();}
      throw new DataApiError(body?.error||'Não foi possível confirmar a operação.',response.status,unknown,body?.code||(response.status===409?'REVISION_CONFLICT':''));
    }
    let receipt;
    try { receipt=confirmedDataReceipt(await response.json(),intent); } catch { throw new DataApiError('Resposta sem confirmação válida. Retome a mesma intenção.',response.status,true); }
    try { removeDataIntent(window.localStorage,user.id,key); } catch { /* A retained confirmed intent can safely recover its receipt again. */ }
    refreshIntents();setStorageError('');setConfirmedDataMessage(`${receipt.method==='POST'?'Criação':'Edição'} confirmada: ${receipt.kind==='category'?'categoria':'cadastro'} #${receipt.entityId}, revisão ${receipt.revision}. Uma falha ao atualizar a lista não desfaz esta gravação.`);setDataReload(value=>value+1);
  }

  async function reloadConflictingEdit() {
    if (!editConflict) return;
    try {
      const response = await request(`/api/data?resource=${editConflict.kind}&id=${editConflict.id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível recarregar os dados atuais.');
      const data = await response.json() as { category?: Category | null; record?: RecordItem | null };
      if (editConflict.kind === 'category') {
        const latest = data.category;
        if (!latest) throw new Error('A categoria não foi encontrada.');
        setEditingCategory(latest);
      } else {
        const latest = data.record;
        if (!latest) throw new Error('O registro não foi encontrado.');
        setEditingRecord(latest);
      }
      setDataReload((value) => value + 1);
      setEditConflict(null);
      setStorageError('');
      setResuming(undefined);
      setFormReload((v) => v + 1);
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

  function navigate(view: ActiveView) { setActive(view); setPage(1); setCategoryFilter(null); }

  function startNewRecord(event: React.MouseEvent<HTMLButtonElement>) {
    setResuming(undefined);
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    const map: Partial<Record<ActiveView, RecordKind>> = { vlans: 'vlan', cameras: 'camera', pontos: 'point', informacoes: 'general' };
    setRecordFormKind(map[active] || 'general');
  }

  function startCategoryForm(event: React.MouseEvent<HTMLButtonElement>) {
    setResuming(undefined);
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    setShowCategoryForm(true);
  }

  function editCategory(category: Category, event: React.MouseEvent<HTMLButtonElement>) {
    setResuming(undefined);
    if (!canWrite) return;
    rememberModalTrigger(event.currentTarget);
    setEditingCategory(category);
  }

  function selectRecord(record: RecordItem, trigger: HTMLButtonElement) {
    setResuming(undefined);
    rememberModalTrigger(trigger);
    setSelected(record);
  }

  function recordPayload(formData: FormData, kind: RecordKind, id?: number) {
    const details: RecordDetails = {};
    const fields: Record<RecordKind, string[]> = {
      general: [], vlan: ['vlanNumber', 'neighborhood'],
      camera: ['camera', 'alternateIdentifier', 'neighborhood', 'address', 'reference', 'geolocation', 'olt', 'description', 'signal', 'serialNumber', 'ipAddress', 'tunnelIp', 'eoipId', 'onuIdentifier', 'vlanNumber', 'macAddress'],
      point: ['location', 'address', 'speed', 'date', 'partner', 'ip', 'provider', 'dhcpInternal', 'onu', 'onuIdentifier', 'olt', 'macAddress', 'connectionPort', 'opticalSignal', 'activationDate', 'installationTechnician', ...pointDimensionFields],
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
    const payload = recordPayload(formData, recordFormKind);
    await persist('POST', { ...payload, kind: 'record', recordType: recordFormKind },formData);
    setRecordFormKind(null); navigate(viewForKind(recordFormKind));
  }

  async function saveRecord(formData: FormData) {
    if (!editingRecord) return;
    try {
      const payload = recordPayload(formData, editingRecord.kind, editingRecord.id);
      await persist('PUT', { ...payload, kind: 'record', recordType: editingRecord.kind, details: payload.details, revision: editingRecord.revision },formData);
      setEditingRecord(null);
      setEditConflict(null);
    } catch (error) {
      if (error instanceof DataApiError && error.code === 'REVISION_CONFLICT') setEditConflict({ kind: 'record', id: editingRecord.id, message: error.message });
      throw error;
    }
  }

  async function createCategory(formData: FormData) {
    await persist('POST', { kind: 'category', name: value(formData, 'name'), description: value(formData, 'description'), color: value(formData, 'color') || '#8b5cf6', scope: value(formData, 'scope') || 'general' },formData);
    setShowCategoryForm(false);
  }

  async function saveCategory(formData: FormData) {
    if (!editingCategory) return;
    try {
      await persist('PUT', { kind: 'category', id: editingCategory.id, revision: editingCategory.revision, name: value(formData, 'name'), description: value(formData, 'description'), color: value(formData, 'color'), scope: value(formData, 'scope') },formData);
      setEditingCategory(null);
      setEditConflict(null);
    } catch (error) {
      if (error instanceof DataApiError && error.code === 'REVISION_CONFLICT') setEditConflict({ kind: 'category', id: editingCategory.id, message: error.message });
      throw error;
    }
  }

  const nav = [
    ['inicio', 'Visão geral', LayoutDashboard], ['pesquisa', 'Pesquisa', Search], ['informacoes', 'Rotas', BookOpenText],
    ['vlans', 'VLANs', Network], ['cameras', 'Câmeras', Camera], ['pontos', 'Pontos', MapPin], ['categorias', 'Categorias', Boxes], ['chamados', 'Chamados', Ticket],
  ] as const;
  const stats: Array<[string, number, LucideIcon, string, ActiveView]> = [
    ['Rotas', summary?.counts.general ?? 0, Network, '#0891b2', 'informacoes'],
    ['VLANs', summary?.counts.vlan ?? 0, Network, '#ff6b2c', 'vlans'],
    ['Câmeras', summary?.counts.camera ?? 0, Camera, '#4f7cff', 'cameras'],
    ['Pontos', summary?.counts.point ?? 0, MapPin, '#20a57a', 'pontos'],
    ['Categorias', summary?.counts.categories ?? 0, Tag, '#8b5cf6', 'categorias'],
  ];
  const title: Record<ActiveView, string> = { inicio: 'Visão geral', pesquisa: 'Pesquisa', informacoes: 'Rotas', vlans: 'VLANs', cameras: 'Câmeras', pontos: 'Pontos atendidos', categorias: 'Categorias', chamados: 'Chamados' };

  if (!user) return null;

  return <main ref={mainContent} tabIndex={-1} className="relative min-h-screen bg-[#f4f6f8] pb-24 text-[#17202a] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff6b2c] lg:pb-0">
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

        {canWrite && activeKind[active] && <Button onClick={startNewRecord} variant="brand" className={`h-11 w-full ${sidebarOpen ? 'justify-start px-3' : 'mx-auto w-11 justify-center rounded-xl px-0'}`} aria-label={active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}>
          <Plus className="size-4" />
          {sidebarOpen && <span className="ml-2">{active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}</span>}
        </Button>}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {nav.map(([id, label, Icon]) => <button key={id} aria-label={label} aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)} className={`noc-nav-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active === id ? 'noc-nav-button--active' : 'text-slate-300'} ${!sidebarOpen && 'justify-center px-2'}`}><Icon className={`size-4 ${active === id ? 'text-[#ff9d6c]' : 'text-slate-300'}`} />{sidebarOpen && label}</button>)}
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

    <div className={`absolute left-4 top-4 z-30 transition-all duration-300 ${sidebarOpen ? 'lg:left-[17.25rem]' : 'lg:left-[5.1rem]'}`}>
      <div className={`noc-search relative flex h-11 items-center overflow-hidden rounded-2xl transition-all duration-300 ${searchExpanded || query ? 'w-[min(72vw,360px)]' : 'w-11'}`}>
        <button type="button" onClick={() => { setSearchExpanded(true); requestAnimationFrame(() => searchInput.current?.focus()); }} className="z-10 grid size-11 shrink-0 place-items-center rounded-2xl text-slate-500 transition hover:bg-slate-200" aria-label="Pesquisar">
          <Search className="size-4" />
        </button>
        <Input ref={searchInput} aria-label="Pesquisar na base de conhecimento" value={query} maxLength={160} onFocus={() => setSearchExpanded(true)} onBlur={() => { if (!query) setSearchExpanded(false); }} onChange={(event) => { const nextValue = event.target.value; setQuery(nextValue); setPage(1); if (nextValue) { if (!activeKind[active]) navigate('pesquisa'); setSearchExpanded(true); } else { setSearchExpanded(false); } }} placeholder="Pesquisar..." className={`h-full border-0 bg-transparent pl-1 pr-3 text-sm text-slate-700 outline-none ring-0 transition-all duration-300 ${searchExpanded || query ? 'visible w-full opacity-100' : 'hidden'}`} />
      {query && <Button type="button" variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); setPage(1); setSearchExpanded(true); searchInput.current?.focus(); }} aria-label="Limpar pesquisa">Limpar</Button>}
      </div>
    </div>

    <section className={`transition-all duration-300 pt-20 ${sidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]'}`}>
      <div className="mx-auto max-w-[1440px] p-4 sm:p-5 lg:p-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ef6427] sm:text-xs sm:tracking-[.16em]">Central de conhecimento</p><h1 id="lastro-page-title" tabIndex={-1} className="text-2xl font-semibold sm:text-3xl">{title[active]}</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">{active === 'chamados' ? 'Gerencie a abertura e o acompanhamento de chamados integrados ao GLPI.' : active === 'informacoes' ? 'Consulte rotas operacionais, responsáveis, contatos e designações.' : 'Organize os dados por categoria e encontre rapidamente o que precisa.'}</p></div><div className="flex max-w-full flex-wrap items-center justify-end gap-2"><UserSession /><Button type="button" variant="outline" className="lg:hidden" onClick={toggleTheme} aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}>{darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>{activeKind[active] && canWrite && <Button onClick={startNewRecord} className="lg:hidden"><Plus />{active === 'informacoes' ? 'Nova rota' : 'Novo cadastro'}</Button>}{active === 'categorias' && canWrite && <Button onClick={startCategoryForm} variant="outline"><Plus />Criar categoria</Button>}</div></div>

        {confirmedDataMessage&&<AlertStatus variant="success" className="mb-5">{confirmedDataMessage}</AlertStatus>}
        {pendingIntents.length>0&&canWrite&&<AlertStatus variant="warning" className="mb-5 min-w-0 grid-cols-1"><p>Há {pendingIntents.length} intenção(ões) cadastral(is) para conferir. Retome a original antes de iniciar uma substituição.</p>{pendingIntents.map(intent=><Button key={intent.key} type="button" variant="outline" className="mt-2 mr-2 min-w-0 max-w-full" aria-label={`Retomar ${intent.method==='POST'?'criação':'edição'}: ${intent.label}, intenção ${intent.key}`} onClick={()=>resumeOperation(intent)}><span className="min-w-0 truncate">Retomar {intent.method==='POST'?'criação':'edição'}: {intent.label}</span><span className="shrink-0 text-xs" aria-hidden="true">{intent.key.slice(0,8)}</span></Button>)}</AlertStatus>}
        {active === 'chamados' && <TicketsSection actorId={user.id} initialTicketId={dashboardTicketId} canCreate={canOperate} canViewDetails={canOperate} showGlpiTest={canAdminister} request={request} />}

        {active === 'inicio' && <>
          <nav aria-label="Seções da Visão geral" className="mb-5 flex flex-wrap gap-3 text-sm">
            <a href="#noc-dashboard-title" className="rounded-lg border border-border px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" onClick={(event) => { event.preventDefault(); document.getElementById('noc-dashboard-title')?.focus(); }}>Painel operacional</a>
            <a href="#knowledge-title" className="rounded-lg border border-border px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" onClick={(event) => { event.preventDefault(); document.getElementById('knowledge-title')?.focus(); }}>Base de conhecimento</a>
          </nav>
          <TicketDashboard request={request} canConfirmHandoff={canOperate} actorId={user.id} onOpen={canOperate ? (id) => { setDashboardTicketId(id); navigate('chamados'); } : undefined} />
          <h2 id="knowledge-title" tabIndex={-1} className="mb-4 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Base de conhecimento</h2>
          <CollectionState loading={catalogLoading} error={storageError} retry={() => setDataReload((v) => v + 1)}>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{stats.map(([label, count, Icon, color, view]) => <button key={String(label)} onClick={() => navigate(view)} className="noc-stat-card rounded-xl p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium text-muted-foreground">{String(label)}</span><span className="grid size-9 place-items-center rounded-xl" style={{ backgroundColor: `${String(color)}18`, color: String(color) }}><Icon className="size-4" /></span></div><strong className="text-3xl font-semibold">{Number(count)}</strong></button>)}</div>
          <details className="mb-7 rounded-xl border border-border bg-card p-4 text-card-foreground">
            <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
              Atualizações recentes · {summary?.recent?.length ?? 0} registros
            </summary>
            <div className="mt-4">
              <RecordList title="Registros atualizados" items={summary?.recent ?? []} onSelect={selectRecord} />
            </div>
          </details>
          </CollectionState>
        </>}

        {(active === 'pesquisa' || ['informacoes', 'vlans', 'cameras', 'pontos'].includes(active)) && <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>{active === 'pesquisa' && <label className="mb-3 block text-sm">Tipo de cadastro<select value={searchKind} onChange={(event) => { setSearchKind(event.target.value as RecordKind | ''); setCategoryFilter(null); setPage(1); }} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Todos os tipos</option>{Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>}<p className="mb-1 text-sm font-medium">Filtrar por categoria</p><CatalogCategoryPicker key={activeKind[active] || searchKind || 'all'} request={request} scope={activeKind[active] || searchKind || undefined} value={categoryFilter} onChange={(id) => { setCategoryFilter(id); setPage(1); }} /></div>
            <label className="text-sm">Por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-3"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
          </div>
          {active === 'pontos' && <PointDimensionFilters values={pointFilters} onChange={(field: PointDimensionField, next) => { setPointFilters((current) => ({ ...current, [field]: next })); setPage(1); }} />}
          <Button type="button" variant="outline" size="sm" className="mb-3" onClick={() => setDataReload((value) => value + 1)}>Atualizar lista</Button>
          <CollectionState loading={catalogLoading} error={storageError} retry={() => setDataReload((v) => v + 1)}><RecordList title={appliedQuery ? `${catalogPage.total} resultado(s) para “${appliedQuery}”` : title[active]} items={records} total={catalogPage.total} onSelect={selectRecord} /></CollectionState>
          {!catalogLoading && !storageError && <CatalogPager page={page} pages={catalogPage.pages} total={catalogPage.total} onPage={setPage} label={active === 'categorias' ? 'categorias' : 'registros'} />}
        </>}

        {active === 'categorias' && <>
          <Input aria-label="Buscar categorias" value={categoryQuery} maxLength={160} placeholder="Buscar categorias…" onChange={(event) => { setCategoryQuery(event.target.value); setPage(1); }} className="mb-3" />
          <label className="mb-4 block text-sm">Por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-3"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
          <Button type="button" variant="outline" size="sm" className="mb-3" onClick={() => setDataReload((value) => value + 1)}>Atualizar lista</Button>
          <CollectionState loading={catalogLoading} error={storageError} retry={() => setDataReload((v) => v + 1)} empty={!categories.length} emptyMessage="Nenhuma categoria cadastrada. Use Criar categoria para começar.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <article key={category.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl" style={{ background: `${category.color}18`, color: category.color }}><Tag className="size-5" /></span>{canWrite && <Button onClick={(event) => editCategory(category, event)} variant="ghost" size="sm">Editar</Button>}</div><div className="mb-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kindLabels[category.scope]}</div><h2 className="font-semibold">{category.name}</h2><p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-500">{category.description}</p><div className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">{category.recordCount ?? 0} {category.recordCount === 1 ? 'cadastro vinculado' : 'cadastros vinculados'}</div></article>)}</div>
          </CollectionState>
          {!catalogLoading && !storageError && <CatalogPager page={page} pages={catalogPage.pages} total={catalogPage.total} onPage={setPage} label={active === 'categorias' ? 'categorias' : 'registros'} />}
        </>}
      </div>
    </section>

    <nav ref={mobileNav} aria-label="Navegação móvel — deslize para mais destinos" className="mobile-nav fixed inset-x-0 bottom-0 z-40 flex min-w-0 overflow-x-auto border-t border-slate-200 bg-white/95 px-1 pt-1 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur lg:hidden">
      {nav.map(([id, label, Icon]) => <button key={id} onClick={() => navigate(id)} className={`flex min-h-14 min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-medium transition ${active === id ? 'bg-[#ff6b2c]/10 text-[#e85b20]' : 'text-slate-500'}`} aria-current={active === id ? 'page' : undefined}><Icon className="size-5" /><span className="whitespace-nowrap">{label}</span></button>)}
    </nav>

    {modalOpen && <>
      <dialog ref={attachModal} aria-modal="true" aria-labelledby="record-dialog-title" className="fixed inset-0 z-50 m-0 flex h-dvh w-screen max-h-none max-w-none items-end justify-center overflow-hidden border-0 bg-[#07111f]/55 p-0 text-inherit backdrop-blur-sm backdrop:bg-transparent sm:items-center sm:p-4" onCancel={handleDialogCancel} onKeyDown={handleDialogKeyDown}>
      <div className="relative m-0 max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 text-inherit shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-6">
      {recordFormKind && <RecordForm resume={resuming} kind={recordFormKind} request={request} action={createRecord} close={() => setRecordFormKind(null)} reload={reloadConflictingEdit} />}
        {editingRecord && <RecordForm resume={resuming} key={`${editingRecord.id}-${editingRecord.revision}-${formReload}`} kind={editingRecord.kind} request={request} record={editingRecord} action={saveRecord} close={() => { setEditingRecord(null); setEditConflict(null); }} conflict={editConflict?.kind === 'record' ? editConflict.message : undefined} reload={reloadConflictingEdit} />}
      {showCategoryForm && <CategoryForm resume={resuming} action={createCategory} close={() => setShowCategoryForm(false)} reload={reloadConflictingEdit} />}
        {editingCategory && <CategoryForm resume={resuming} key={`${editingCategory.id}-${editingCategory.revision}-${formReload}`} category={editingCategory} action={saveCategory} close={() => { setEditingCategory(null); setEditConflict(null); }} conflict={editConflict?.kind === 'category' ? editConflict.message : undefined} reload={reloadConflictingEdit} />}
      {selected && <RecordDetails record={selected} canEdit={canWrite} close={() => setSelected(null)} edit={() => { if (!canWrite) return; setEditingRecord(selected); setSelected(null); }} />}
      </div>
      </dialog>
    </>}
  </main>;
}

function viewForKind(kind: RecordKind): ActiveView { return kind === 'vlan' ? 'vlans' : kind === 'camera' ? 'cameras' : kind === 'point' ? 'pontos' : 'informacoes'; }

function CatalogPager({ page, pages, total, onPage, label }: { page: number; pages: number; total: number; onPage: (page: number) => void; label: string }) {
  return <nav aria-label="Páginas dos cadastros" className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
    <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
    <span aria-live="polite">Página {page} de {Math.max(1, pages)} · {total} {total === 1 ? (label === 'categorias' ? 'categoria' : 'registro') : label}</span>
    <Button type="button" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</Button>
    <span className="w-full text-center text-xs text-slate-500">Cadastros novos ou editados podem mudar a ordem entre páginas.</span>
  </nav>;
}

function RecordList({ title, items, total, onSelect }: { title: string; items: RecordItem[]; total?: number; onSelect: (item: RecordItem, trigger: HTMLButtonElement) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">{title}</h2><span className="text-xs text-slate-400">{total ?? items.length} registros</span></div>{items.length ? <div className="divide-y divide-slate-100">{items.map((item) => <button key={item.id} onClick={(event) => onSelect(item, event.currentTarget)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[1.5fr_1fr_auto]"><div className="min-w-0"><b className="block break-words text-sm">{item.title}</b><span className="mt-1 flex items-center gap-2 text-xs text-slate-400"><i className="size-2 rounded-full" style={{ background: item.categoryColor }} />{kindLabels[item.kind]} · {item.categoryName || 'Sem categoria'}</span></div><div className="col-start-1 min-w-0 sm:col-auto"><span className="block break-words text-xs font-medium text-slate-600">{recordSummary(item)}</span><span className="text-[11px] text-slate-400">{item.updated}</span></div><ChevronRight className="size-4 text-slate-300" /></button>)}</div> : <div className="px-5 py-16 text-center"><Search className="mx-auto mb-3 size-8 text-slate-300" /><p className="text-sm font-medium">Nenhum cadastro encontrado</p><p className="mt-1 text-xs text-slate-400">Crie o primeiro cadastro ou altere a pesquisa.</p></div>}</section>;
}

function recordSummary(record: RecordItem) {
  if (record.kind === 'vlan') return record.details.neighborhood || 'Bairro não informado';
  if (record.kind === 'camera') return record.details.address || record.details.olt || 'Local não informado';
  if (record.kind === 'point') return record.details.partner || record.details.ip || 'Parceiro não informado';
  return record.responsible || 'Responsável não informado';
}

function ConflictNotice({ message, reload }: { message: string; reload: () => void; resume?:DataIntent }) {
  return <Alert variant="warning"><p>{message}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={reload}>Recarregar versão atual (substitui o formulário)</Button></Alert>;
}

function RecordForm({ resume, kind, request, record, action, close, conflict, reload }: { kind: RecordKind; request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; record?: RecordItem; action: (data: FormData) => void | Promise<void>; close: () => void; conflict?: string; reload: () => void; resume?:DataIntent }) {
  const originalCategory=resume?.fields.find(([name])=>name==='categoryId')?.[1];
  const [categoryId, setCategoryId] = useState<number | null>(Number(originalCategory ?? record?.categoryId ?? 0) || null);
  return <PreservedForm onDefer={close} resume={resume} action={action} conflict={Boolean(conflict)}><FormTitle title={`${record ? 'Editar' : 'Cadastrar'} ${kindLabels[kind]}`} subtitle={`Categoria usada para: ${scopeHelp[kind]}.`} />
    {conflict && <ConflictNotice message={conflict} reload={reload} />}
    <Field label="Categoria"><CatalogCategoryPicker request={request} scope={kind} value={categoryId} onChange={setCategoryId} name="categoryId" required /></Field>
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
      <FormSection title="Organização do ponto">
        <p className="text-xs text-slate-500">Preencha somente nomes institucionais verificados. Não use contatos, endereços de rede ou credenciais.</p>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Município"><Input name="municipality" maxLength={160} defaultValue={record?.details.municipality} /></Field><Field label="Cliente atendido"><Input name="client" maxLength={160} defaultValue={record?.details.client} /></Field><Field label="Região operacional"><Input name="operationalRegion" maxLength={160} defaultValue={record?.details.operationalRegion} /></Field></div>
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
    <FormActions close={close} submit={record ? 'Salvar alterações' : 'Cadastrar'} disabled={!categoryId} />
  </PreservedForm>;
}

function CategoryForm({ resume, category, action, close, conflict, reload }: { category?: Category; action: (data: FormData) => void | Promise<void>; close: () => void; conflict?: string; reload: () => void; resume?:DataIntent }) {
  return <PreservedForm onDefer={close} resume={resume} action={action} conflict={Boolean(conflict)}><FormTitle title={category ? 'Editar categoria' : 'Criar categoria'} subtitle="Escolha onde a categoria será utilizada e explique seu objetivo." />{conflict && <ConflictNotice message={conflict} reload={reload} />}<Field label="Usar esta categoria em"><select name="scope" defaultValue={category?.scope || 'general'} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label} — {scopeHelp[id as RecordKind]}</option>)}</select></Field><Field label="Nome"><Input name="name" required defaultValue={category?.name} placeholder="Ex.: Região Serrana, Prefeitura, EDP" /></Field><Field label="Descrição"><TextArea name="description" required defaultValue={category?.description} placeholder="Explique quais cadastros pertencem a esta categoria." /></Field><Field label="Cor"><input name="color" type="color" defaultValue={category?.color || '#8b5cf6'} className="h-10 w-20 cursor-pointer rounded-lg border border-slate-200 p-1" /></Field><FormActions close={close} submit={category ? 'Salvar alterações' : 'Criar categoria'} /></PreservedForm>;
}

function RecordDetails({ record, canEdit, close, edit }: { record: RecordItem; canEdit: boolean; close: () => void; edit: () => void }) {
  const detailLabels: Record<string, string> = {
    vlanNumber: 'Número da VLAN', neighborhood: 'Bairro', camera: 'Câmera', alternateIdentifier: 'Identificador alternativo',
    address: 'Endereço', reference: 'Referência', geolocation: 'Geolocalização', olt: 'OLT', description: 'Descrição',
    signal: 'Sinal', serialNumber: 'Serial number', location: 'Local', speed: 'Velocidade', date: 'Data', partner: 'Parceiro',
    provider: 'Provedor de internet', ip: 'IP', dhcpInternal: 'DHCP interno', onu: 'ONU / modelo', onuIdentifier: 'Identificador da ONU',
    macAddress: 'Endereço MAC', connectionPort: 'Porta de conexão', opticalSignal: 'Sinal óptico', activationDate: 'Data de ativação',
    installationTechnician: 'Técnico da instalação', ipAddress: 'IP da câmera', tunnelIp: 'IP do túnel', eoipId: 'Identificador EOIP',
    municipality: 'Município', client: 'Cliente atendido', operationalRegion: 'Região operacional',
  };
  const general = record.kind === 'general' ? [['Responsável', record.responsible], ['Validação / designação', record.validation], ['Contato', record.contact], ['Observações', record.notes]] : [];
  return <div><FormTitle title={record.title} subtitle={`${kindLabels[record.kind]} · ${record.categoryName || 'Sem categoria'}`} /><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[...general, ...Object.entries(record.details || {}).filter(([key]) => !key.endsWith('Key')).map(([key, item]) => [detailLabels[key] || key, item])].filter(([, item]) => item).map(([label, item]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm">{item}</dd></div>)}</dl><div className="lastro-form-actions mt-6 flex justify-end gap-2"><Button variant="outline" onClick={close}>Fechar</Button>{canEdit && <Button onClick={edit}>Editar cadastro</Button>}</div></div>;
}

function TextArea(props: React.ComponentProps<'textarea'>) { return <Textarea rows={3} {...props} />; }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4"><legend className="lastro-form-legend px-1 text-sm font-semibold text-slate-700">{title}</legend>{children}</fieldset>; }
function FormTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 id="record-dialog-title" className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <FormField label={label}>{children}</FormField>; }
function FormActions({ close, submit, disabled }: { close: () => void; submit: string; disabled?: boolean }) { const submissionDisabled = useSubmissionDisabled(); return <div className="lastro-form-actions flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={disabled || submissionDisabled} variant="brand">{submit}</Button></div>; }
