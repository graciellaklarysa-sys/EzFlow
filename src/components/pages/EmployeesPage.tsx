import React, { useMemo, useState } from 'react';
import { Activity, CalendarClock, CheckSquare, Clock, Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { formatDateTimeID, formatIDR, getMakassarDateString, toIsoTimestamp } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import type { Employee } from '../../types/ezflow';

export function EmployeesPage() {
  const { activeOutletId } = useAuth();
  const {
    outlets,
    employees,
    shifts,
    attendance,
    operationalTasks,
    transactions,
    stockMovements,
    auditLogs,
    currentMemberRole,
    saveEmployee,
    saveShift,
    deleteShift,
    clockInEmployee,
    clockOutAttendance,
  } = useBusinessData();
  const { showToast } = useToast();

  const canManage = ['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(currentMemberRole);
  const [tab, setTab] = useState<'directory' | 'shifts' | 'attendance' | 'tasks_activity'>('directory');
  const [selectedEmpFilter, setSelectedEmpFilter] = useState<string>('ALL');

  // Employee Modal
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empPos, setEmpPos] = useState('');
  const [empRole, setEmpRole] = useState<'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF'>('STAFF');
  const [empOutletId, setEmpOutletId] = useState('');
  const [empStatus, setEmpStatus] = useState<'active' | 'inactive'>('active');

  // Shift Modal
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftEmpId, setShiftEmpId] = useState('');
  const [shiftOutletId, setShiftOutletId] = useState('');
  const [shiftDate, setShiftDate] = useState(() => getMakassarDateString(new Date()));
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [shiftNotes, setShiftNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const activeOutlets = outlets.filter((o) => !o.isArchived);

  const visibleEmployees = employees.filter((e) => activeOutletId === 'ALL' || e.outletId === activeOutletId);
  const visibleShifts = shifts.filter((s) => activeOutletId === 'ALL' || s.outletId === activeOutletId);
  const visibleAttendance = attendance.filter((a) => activeOutletId === 'ALL' || a.outletId === activeOutletId);
  const visibleTasks = operationalTasks.filter((t) => {
    if (activeOutletId !== 'ALL' && t.outletId !== activeOutletId) return false;
    if (selectedEmpFilter !== 'ALL' && t.assignedToId !== selectedEmpFilter) return false;
    return true;
  });

  const employeeStatsMap = useMemo(() => {
    const map = new Map<string, { hoursWorked: number; shiftCount: number; tasksPending: number; tasksDone: number }>();
    for (const emp of visibleEmployees) {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id);
      const hoursWorked = Number(
        empAtt.reduce((s, a) => s + (typeof a.hoursWorked === 'number' ? a.hoursWorked : 0), 0).toFixed(2)
      );
      const shiftCount = shifts.filter((s) => s.employeeId === emp.id).length;
      const empTasks = operationalTasks.filter((t) => t.assignedToId === emp.id);
      const tasksDone = empTasks.filter((t) => t.status === 'completed').length;
      const tasksPending = empTasks.length - tasksDone;
      map.set(emp.id, { hoursWorked, shiftCount, tasksPending, tasksDone });
    }
    return map;
  }, [visibleEmployees, attendance, shifts, operationalTasks]);

  const activityFeed = useMemo(() => {
    const selectedEmp = selectedEmpFilter !== 'ALL' ? employees.find((e) => e.id === selectedEmpFilter) : undefined;
    const matchActor = (uid?: string, actorName?: string, empId?: string) => {
      if (!selectedEmp) return true;
      if (empId && empId === selectedEmp.id) return true;
      if (uid && selectedEmp.userUid && uid === selectedEmp.userUid) return true;
      if (actorName && actorName.trim().toLowerCase() === selectedEmp.name.trim().toLowerCase()) return true;
      return false;
    };

    const items: Array<{ id: string; timestamp: string; actor: string; category: string; description: string }> = [];

    for (const a of visibleAttendance) {
      if (!matchActor(undefined, a.employeeName, a.employeeId)) continue;
      items.push({
        id: `att-${a.id}`,
        timestamp: a.clockOut || a.clockIn,
        actor: a.employeeName || 'Karyawan',
        category: 'Absensi',
        description:
          a.status === 'clocked_out'
            ? `Selesai shift (Clock-Out · ${a.hoursWorked ?? 0} jam bekerja)`
            : 'Melakukan Clock-In shift kerja',
      });
    }

    for (const tx of transactions) {
      if (activeOutletId !== 'ALL' && tx.outletId !== activeOutletId) continue;
      if (!matchActor(tx.cashierUid, tx.cashierName)) continue;
      items.push({
        id: `tx-${tx.id}`,
        timestamp: tx.occurredAt,
        actor: tx.cashierName || 'Kasir',
        category: 'POS',
        description: `Transaksi ${tx.receiptNumber} (${formatIDR(tx.total)} · ${tx.status})`,
      });
    }

    for (const mov of stockMovements) {
      if (activeOutletId !== 'ALL' && mov.outletId !== activeOutletId) continue;
      if (!matchActor(mov.userUid, mov.userName)) continue;
      items.push({
        id: `mov-${mov.id}`,
        timestamp: mov.occurredAt,
        actor: mov.userName || 'Staf Gudang',
        category: 'Stok',
        description: `${mov.ingredientName || 'Bahan'} (${mov.quantityDelta >= 0 ? '+' : ''}${mov.quantityDelta} ${mov.unit}) — ${mov.reason || mov.movementType}`,
      });
    }

    for (const log of auditLogs) {
      if (!matchActor(log.actorUid, log.actorName)) continue;
      items.push({
        id: `audit-${log.id}`,
        timestamp: toIsoTimestamp(log.createdAt),
        actor: log.actorName || 'Admin',
        category: 'Audit',
        description: log.details || log.action,
      });
    }

    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return items.slice(0, 40);
  }, [visibleAttendance, transactions, stockMovements, auditLogs, activeOutletId, selectedEmpFilter, employees]);

  const openEmpModal = (emp?: Employee) => {
    if (emp) {
      setEditingEmp(emp);
      setEmpName(emp.name);
      setEmpEmail(emp.email || '');
      setEmpPhone(emp.phone || '');
      setEmpPos(emp.position);
      setEmpRole(emp.role);
      setEmpOutletId(emp.outletId);
      setEmpStatus(emp.status);
    } else {
      setEditingEmp(null);
      setEmpName('');
      setEmpEmail('');
      setEmpPhone('');
      setEmpPos('Barista');
      setEmpRole('STAFF');
      setEmpOutletId(activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '');
      setEmpStatus('active');
    }
    setEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim() || !empPos.trim() || !empOutletId) {
      showToast('Nama, jabatan, dan outlet wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveEmployee(
        {
          name: empName,
          email: empEmail,
          phone: empPhone,
          position: empPos,
          role: empRole,
          outletId: empOutletId,
          status: empStatus,
        },
        editingEmp?.id
      );
      showToast(editingEmp ? 'Profil karyawan diperbarui.' : 'Karyawan baru ditambahkan.', 'success');
      setEmpModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan karyawan.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openShiftModal = () => {
    setShiftEmpId(visibleEmployees[0]?.id || employees[0]?.id || '');
    setShiftOutletId(activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '');
    setShiftNotes('');
    setShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === shiftEmpId);
    if (!emp || !shiftOutletId) {
      showToast('Pilih karyawan dan outlet terlebih dahulu.', 'error');
      return;
    }
    if (!shiftDate || shiftEnd <= shiftStart) {
      showToast('Jam selesai shift harus lebih akhir dari jam mulai shift.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveShift({
        outletId: shiftOutletId,
        employeeId: emp.id,
        employeeName: emp.name,
        shiftDate,
        startTime: shiftStart,
        endTime: shiftEnd,
        notes: shiftNotes,
      });
      showToast('Jadwal shift berhasil ditambahkan.', 'success');
      setShiftModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan jadwal shift.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleClockIn = async (emp: Employee) => {
    if (emp.status !== 'active') {
      showToast('Karyawan berstatus nonaktif tidak dapat melakukan Clock-In.', 'error');
      return;
    }
    const activeShift = attendance.find((a) => a.employeeId === emp.id && a.status === 'clocked_in');
    if (activeShift) {
      showToast(`${emp.name} sudah melakukan clock-in.`, 'info');
      return;
    }
    try {
      await clockInEmployee(emp);
      showToast(`${emp.name} berhasil Clock-In.`, 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal clock-in.'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg text-xs font-medium">
          {[
            { id: 'directory', label: `Daftar Karyawan (${visibleEmployees.length})` },
            { id: 'shifts', label: `Jadwal Shift (${visibleShifts.length})` },
            { id: 'attendance', label: 'Absensi & Jam Kerja' },
            { id: 'tasks_activity', label: 'Tugas & Log Aktivitas' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-1.5 rounded-md transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            {tab === 'shifts' ? (
              <button
                type="button"
                onClick={openShiftModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Buat Jadwal Shift
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openEmpModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
              >
                <UserPlus className="w-4 h-4" />
                Tambah Karyawan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Directory */}
      {tab === 'directory' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 bg-slate-50">
                <th className="py-3 px-4 font-medium">Nama Karyawan</th>
                <th className="py-3 px-3 font-medium">Jabatan & Peran</th>
                <th className="py-3 px-3 font-medium">Outlet</th>
                <th className="py-3 px-3 font-medium">Kontak</th>
                <th className="py-3 px-3 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                    Belum ada data karyawan pada outlet ini.
                  </td>
                </tr>
              ) : (
                visibleEmployees.map((emp) => {
                  const outletName = outlets.find((o) => o.id === emp.outletId)?.name || '-';
                  const openAtt = attendance.find((a) => a.employeeId === emp.id && a.status === 'clocked_in');
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 text-xs">
                      <td className="py-3 px-4 font-semibold text-slate-900">{emp.name}</td>
                      <td className="py-3 px-3 text-slate-700">
                        {emp.position} · <span className="font-mono text-[11px] text-blue-600">{emp.role}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{outletName}</td>
                      <td className="py-3 px-3 text-slate-500">
                        {emp.phone || '-'} · {emp.email || '-'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={emp.status === 'active' ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                          {emp.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        {openAtt ? (
                          <button
                            type="button"
                            onClick={() =>
                              clockOutAttendance(openAtt)
                                .then(() => showToast(`${emp.name} Clock-Out.`, 'success'))
                                .catch((err) => showToast(formatAppError(err, 'Gagal mencatat Clock-Out.'), 'error'))
                            }
                            className="font-semibold text-amber-600 hover:underline"
                          >
                            Clock-Out
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={emp.status !== 'active'}
                            onClick={() => handleClockIn(emp)}
                            className={`font-semibold ${
                              emp.status !== 'active'
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-emerald-600 hover:underline'
                            }`}
                          >
                            Clock-In
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openEmpModal(emp)}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Shifts */}
      {tab === 'shifts' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {visibleShifts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">Belum ada jadwal shift dibuat.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleShifts.map((sh) => {
                const outletName = outlets.find((o) => o.id === sh.outletId)?.name || '-';
                return (
                  <div key={sh.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-blue-600 shrink-0" />
                        <h4 className="text-sm font-semibold text-slate-900">{sh.employeeName}</h4>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() =>
                            deleteShift(sh.id)
                              .then(() => showToast('Jadwal shift dihapus.', 'info'))
                              .catch((err) => showToast(formatAppError(err, 'Gagal menghapus jadwal shift.'), 'error'))
                          }
                          className="text-slate-400 hover:text-red-600"
                          title="Hapus shift"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 tabular-nums">
                      {sh.shiftDate} · {sh.startTime} – {sh.endTime}
                    </p>
                    <p className="text-xs text-slate-500">{outletName}</p>
                    {sh.notes && <p className="text-[11px] text-slate-400">{sh.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Attendance */}
      {tab === 'attendance' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Catatan Absensi & Jam Kerja</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Karyawan</th>
                  <th className="py-2.5 px-3 font-medium">Tanggal</th>
                  <th className="py-2.5 px-3 font-medium">Clock-In</th>
                  <th className="py-2.5 px-3 font-medium">Clock-Out</th>
                  <th className="py-2.5 px-3 font-medium text-right">Durasi</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Belum ada catatan absensi. Gunakan tombol Clock-In pada tab Daftar Karyawan.
                    </td>
                  </tr>
                ) : (
                  visibleAttendance.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 font-semibold text-slate-900">{att.employeeName}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-600">{att.date}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-700">{formatDateTimeID(att.clockIn)}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-700">
                        {att.clockOut ? formatDateTimeID(att.clockOut) : 'Sedang Bertugas'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-medium text-slate-900">
                        {typeof att.hoursWorked === 'number' ? `${att.hoursWorked} jam` : '-'}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        {att.status === 'clocked_in' && (
                          <button
                            type="button"
                            onClick={() =>
                              clockOutAttendance(att)
                                .then(() => showToast('Clock-Out dicatat.', 'success'))
                                .catch((err) => showToast(formatAppError(err, 'Gagal mencatat Clock-Out.'), 'error'))
                            }
                            className="text-amber-600 font-semibold hover:underline"
                          >
                            Clock-Out
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks & Activity Log */}
      {tab === 'tasks_activity' && (
        <div className="space-y-6">
          {/* Filter + Summary by Employee */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ringkasan Tugas & Jam Kerja per Karyawan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih karyawan untuk memfilter daftar tugas terpasang dan log aktivitas operasionalnya.
                </p>
              </div>
              <select
                value={selectedEmpFilter}
                onChange={(e) => setSelectedEmpFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium text-slate-800"
              >
                <option value="ALL">Semua Karyawan ({visibleEmployees.length})</option>
                {visibleEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.position}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Karyawan</th>
                    <th className="py-2 px-3 font-medium">Peran</th>
                    <th className="py-2 px-3 font-medium text-right">Total Jam Kerja</th>
                    <th className="py-2 px-3 font-medium text-right">Jadwal Shift</th>
                    <th className="py-2 px-3 font-medium text-right">Tugas Aktif</th>
                    <th className="py-2 pl-3 font-medium text-right">Tugas Selesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Belum ada data karyawan pada outlet ini.
                      </td>
                    </tr>
                  ) : (
                    visibleEmployees.map((emp) => {
                      const st = employeeStatsMap.get(emp.id) || {
                        hoursWorked: 0,
                        shiftCount: 0,
                        tasksPending: 0,
                        tasksDone: 0,
                      };
                      const isSelected = selectedEmpFilter === emp.id;
                      return (
                        <tr
                          key={emp.id}
                          onClick={() => setSelectedEmpFilter(isSelected ? 'ALL' : emp.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 pr-4 font-semibold text-slate-900">{emp.name}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {emp.position} · <span className="font-mono text-[11px] text-blue-600">{emp.role}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-medium text-slate-900">
                            {st.hoursWorked} jam
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{st.shiftCount}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-amber-700 font-semibold">
                            {st.tasksPending}
                          </td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-emerald-700 font-semibold">
                            {st.tasksDone}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assigned Operational Tasks */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">Tugas Operasional Terpasang ({visibleTasks.length})</h4>
              </div>
              {visibleTasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  Tidak ada tugas operasional yang ditugaskan untuk filter saat ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {visibleTasks.map((task) => (
                    <div key={task.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          PIC: {task.assignedToName || 'Belum ditetapkan'} · Kategori: {task.category}
                          {task.dueDate ? ` · Jatuh tempo ${task.dueDate}` : ''}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          task.status === 'completed'
                            ? 'text-emerald-600'
                            : task.status === 'in_progress'
                              ? 'text-blue-600'
                              : 'text-amber-600'
                        }`}
                      >
                        {task.status === 'completed' ? 'Selesai' : task.status === 'in_progress' ? 'Proses' : 'Tertunda'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unified Employee Activity Feed */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">Log Aktivitas Karyawan Terbaru</h4>
              </div>
              {activityFeed.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  Belum ada catatan aktivitas absensi, kasir, atau inventaris.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {activityFeed.map((ev) => (
                    <div key={ev.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-slate-900">
                          <span className="font-semibold">{ev.actor}</span> ·{' '}
                          <span className="text-[11px] font-medium text-blue-600">{ev.category}</span>
                        </p>
                        <p className="text-slate-600 mt-0.5">{ev.description}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {formatDateTimeID(ev.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      <Modal
        open={empModalOpen}
        onClose={() => setEmpModalOpen(false)}
        title={editingEmp ? 'Edit Profil Karyawan' : 'Tambah Karyawan Baru'}
      >
        <form onSubmit={handleSaveEmployee} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Jabatan *</label>
              <input
                type="text"
                required
                value={empPos}
                onChange={(e) => setEmpPos(e.target.value)}
                placeholder="Contoh: Barista / Kasir"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Peran Akses (RBAC)</label>
              <select
                value={empRole}
                onChange={(e) => setEmpRole(e.target.value as typeof empRole)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="OWNER">OWNER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="CASHIER">CASHIER</option>
                <option value="STAFF">STAFF</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Outlet Penugasan *</label>
              <select
                value={empOutletId}
                onChange={(e) => setEmpOutletId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Status</label>
              <select
                value={empStatus}
                onChange={(e) => setEmpStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nomor HP</label>
              <input
                type="text"
                value={empPhone}
                onChange={(e) => setEmpPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEmpModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Karyawan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Shift Modal */}
      <Modal open={shiftModalOpen} onClose={() => setShiftModalOpen(false)} title="Buat Jadwal Shift">
        <form onSubmit={handleSaveShift} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Karyawan *</label>
            <select
              value={shiftEmpId}
              onChange={(e) => setShiftEmpId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.position})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Outlet *</label>
              <select
                value={shiftOutletId}
                onChange={(e) => setShiftOutletId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tanggal *</label>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Jam Mulai</label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Jam Selesai</label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Catatan Shift</label>
            <input
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              placeholder="Contoh: Shift pagi kasir"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShiftModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Shift'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
