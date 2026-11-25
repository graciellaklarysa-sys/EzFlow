import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, Edit2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { getMakassarDateString } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import type { OperationalTask } from '../../types/ezflow';

const TASK_CATEGORIES = [
  { key: 'opening', label: 'Pembukaan (Opening)' },
  { key: 'closing', label: 'Penutupan (Closing)' },
  { key: 'cleaning', label: 'Kebersihan' },
  { key: 'maintenance', label: 'Pemeliharaan Peralatan' },
] as const;

export function OperationsPage() {
  const { activeOutletId } = useAuth();
  const {
    outlets,
    employees,
    operationalTasks,
    currentMemberRole,
    saveOperationalTask,
    deleteOperationalTask,
  } = useBusinessData();
  const { showToast } = useToast();

  const canManage = ['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(currentMemberRole);
  const [catFilter, setCatFilter] = useState<'ALL' | OperationalTask['category']>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<OperationalTask | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<OperationalTask['category']>('opening');
  const [outletId, setOutletId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDate, setDueDate] = useState(() => getMakassarDateString(new Date()));
  const [status, setStatus] = useState<OperationalTask['status']>('pending');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const activeOutlets = outlets.filter((o) => !o.isArchived);

  const outletScopedTasks = operationalTasks.filter(
    (t) => activeOutletId === 'ALL' || t.outletId === activeOutletId
  );

  const visibleTasks = outletScopedTasks.filter((t) => {
    if (catFilter !== 'ALL' && t.category !== catFilter) return false;
    return true;
  });

  const openModal = (task?: OperationalTask) => {
    if (task) {
      setEditingTask(task);
      setTitle(task.title);
      setCategory(task.category);
      setOutletId(task.outletId);
      setAssignedToId(task.assignedToId || '');
      setDueDate(task.dueDate || getMakassarDateString(new Date()));
      setStatus(task.status);
      setNotes(task.notes || '');
    } else {
      setEditingTask(null);
      setTitle('');
      setCategory('opening');
      setOutletId(activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '');
      setAssignedToId(employees[0]?.id || '');
      setDueDate(getMakassarDateString(new Date()));
      setStatus('pending');
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !outletId) {
      showToast('Judul tugas dan outlet wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      const emp = employees.find((x) => x.id === assignedToId);
      await saveOperationalTask(
        {
          outletId,
          title,
          category,
          assignedToId: emp?.id || '',
          assignedToName: emp?.name || '',
          dueDate,
          status,
          notes,
        },
        editingTask?.id
      );
      showToast(editingTask ? 'Tugas operasional diperbarui.' : 'Tugas operasional ditambahkan.', 'success');
      setModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan tugas.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cycleStatus = async (task: OperationalTask) => {
    const nextStatus: OperationalTask['status'] =
      task.status === 'pending' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'pending';
    try {
      await saveOperationalTask(
        {
          outletId: task.outletId,
          title: task.title,
          category: task.category,
          assignedToId: task.assignedToId,
          assignedToName: task.assignedToName,
          dueDate: task.dueDate,
          status: nextStatus,
          notes: task.notes,
        },
        task.id
      );
    } catch (err) {
      showToast(formatAppError(err, 'Gagal mengubah status tugas.'), 'error');
    }
  };

  const completedCount = visibleTasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setCatFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg border ${
              catFilter === 'ALL' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600'
            }`}
          >
            Semua ({outletScopedTasks.length})
          </button>
          {TASK_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCatFilter(c.key)}
              className={`px-3 py-1.5 rounded-lg border ${
                catFilter === c.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => openModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Tambah Tugas Checklist
          </button>
        )}
      </div>

      {/* Progress Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-900">
            Progres Penyelesaian Checklist ({completedCount} / {visibleTasks.length})
          </p>
          <p className="text-[11px] text-slate-500">Klik ikon status pada tiap tugas untuk mengubah status (Tertunda → Proses → Selesai).</p>
        </div>
        <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${visibleTasks.length ? Math.round((completedCount / visibleTasks.length) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {visibleTasks.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Belum ada tugas operasional pada kategori ini.
          </div>
        ) : (
          visibleTasks.map((task) => {
            const catLabel = TASK_CATEGORIES.find((c) => c.key === task.category)?.label || task.category;
            const outletName = outlets.find((o) => o.id === task.outletId)?.name || '-';
            return (
              <div key={task.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => cycleStatus(task)}
                    title="Ubah status tugas"
                    className="mt-0.5 shrink-0"
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : task.status === 'in_progress' ? (
                      <Clock className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {catLabel} · {outletName} · PIC: {task.assignedToName || 'Belum ditugaskan'} · Batas: {task.dueDate || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-semibold ${
                      task.status === 'completed'
                        ? 'text-emerald-600'
                        : task.status === 'in_progress'
                          ? 'text-blue-600'
                          : 'text-amber-600'
                    }`}
                  >
                    {task.status === 'completed' ? 'Selesai' : task.status === 'in_progress' ? 'Sedang Proses' : 'Tertunda'}
                  </span>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openModal(task)}
                        className="text-slate-400 hover:text-blue-600 p-1"
                        aria-label="Edit tugas"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          deleteOperationalTask(task.id)
                            .then(() => showToast('Tugas dihapus.', 'info'))
                            .catch((err) => showToast(formatAppError(err, 'Gagal menghapus tugas.'), 'error'))
                        }
                        className="text-slate-400 hover:text-red-600 p-1"
                        aria-label="Hapus tugas"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Edit Tugas Operasional' : 'Tambah Tugas Operasional'}
      >
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Judul Tugas / Checklist *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Kalibrasi grinder sebelum buka"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as OperationalTask['category'])}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Outlet</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Penanggung Jawab</label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Pilih --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Batas Tanggal</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OperationalTask['status'])}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="pending">Tertunda</option>
                <option value="in_progress">Sedang Proses</option>
                <option value="completed">Selesai</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Catatan</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Tugas'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
