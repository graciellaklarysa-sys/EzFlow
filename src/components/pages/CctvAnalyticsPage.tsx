import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Film,
  Info,
  Link2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { formatAppError } from '../../lib/firebase';
import { formatNumberID } from '../../lib/format';
import type { CctvAnalysisResult, CctvCamera, CctvCameraSourceType, CctvUpload } from '../../types/ezflow';

interface ProcessorStatus {
  connected: boolean;
  mode: string;
  engine?: string;
  message: string;
  targetCapabilities: string[];
}

const SOURCE_TYPE_LABELS: Record<CctvCameraSourceType, string> = {
  webcam: 'Webcam / Kamera USB / Capture Card',
  http_snapshot: 'IP Camera Snapshot URL (HTTP/HTTPS)',
  mjpeg_stream: 'IP Camera MJPEG Stream',
  hls_stream: 'HLS / HTTP Video Stream (.m3u8 / MP4)',
  rtsp: 'RTSP IP Camera (rtsp://)',
  upload_only: 'Unggah Rekaman Manual (DVR / NVR)',
};

// Ilustrasi sampel demo (hanya ditampilkan sebagai referensi bila belum ada hasil analisa nyata)
const DEMO_HOURLY_OCCUPANCY = [
  { hour: '08:00', occupancyPct: 38, visitors: 22 },
  { hour: '10:00', occupancyPct: 64, visitors: 37 },
  { hour: '12:00', occupancyPct: 86, visitors: 52 },
  { hour: '14:00', occupancyPct: 72, visitors: 41 },
  { hour: '16:00', occupancyPct: 78, visitors: 46 },
  { hour: '18:00', occupancyPct: 91, visitors: 56 },
  { hour: '20:00', occupancyPct: 54, visitors: 30 },
];

const DEMO_SEATING_ZONES = [
  { id: 'Z1', name: 'Meja Bar & Window (M1–M4)', capacity: 12, occupied: 11, avgDwellMin: 38, clearMin: 4, turnover: 6.2 },
  { id: 'Z2', name: 'Area Kerja Indoor (M5–M10)', capacity: 20, occupied: 17, avgDwellMin: 84, clearMin: 6, turnover: 3.1 },
  { id: 'Z3', name: 'Teras Outdoor Utara (M11–M14)', capacity: 16, occupied: 6, avgDwellMin: 45, clearMin: 5, turnover: 2.4 },
];

function isPrivateOrLocalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

export function CctvAnalyticsPage() {
  const { activeOutletId, getIdToken } = useAuth();
  const {
    outlets,
    cctvCameras,
    cctvUploads,
    currentMemberRole,
    saveCctvCamera,
    deleteCctvCamera,
    createCctvUploadRecord,
    updateCctvUploadRecord,
    deleteCctvUpload,
  } = useBusinessData();
  const { showToast } = useToast();

  const activeOutlets = useMemo(() => outlets.filter((o) => !o.isArchived), [outlets]);
  const defaultOutletId = activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '';
  const canDeleteRecords = currentMemberRole === 'OWNER' || currentMemberRole === 'SUPER_ADMIN';

  const [processorStatus, setProcessorStatus] = useState<ProcessorStatus | null>(null);
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>(defaultOutletId || 'ALL');
  const [activeTab, setActiveTab] = useState<'upload' | 'live'>('upload');

  // Upload & Video Analysis state
  const [uploadCameraId, setUploadCameraId] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string>('');
  const [autoAnalyzeOnUpload, setAutoAnalyzeOnUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingUploadId, setAnalyzingUploadId] = useState<string | null>(null);

  // Active CV Analysis Result View
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [videoPlaybackUrl, setVideoPlaybackUrl] = useState<string>('');
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const [showDemoPreview, setShowDemoPreview] = useState(false);

  // Live Camera Connection state (Webcam/USB OR IP/RTSP/Snapshot URL)
  const [liveCameraId, setLiveCameraId] = useState<string>('');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string>('');
  const [recordingClip, setRecordingClip] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(0);
  const [autoScanIntervalSec, setAutoScanIntervalSec] = useState<0 | 30 | 60>(0);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [remotePreviewFrame, setRemotePreviewFrame] = useState<string>('');
  const [lanDirectMode, setLanDirectMode] = useState(false);
  const [capturingLive, setCapturingLive] = useState(false);
  const [liveSnapshotPreview, setLiveSnapshotPreview] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const lanImgRef = useRef<HTMLImageElement | null>(null);

  // Camera Add/Edit Modal state
  const [camModalOpen, setCamModalOpen] = useState(false);
  const [editingCam, setEditingCam] = useState<CctvCamera | null>(null);
  const [camName, setCamName] = useState('');
  const [camArea, setCamArea] = useState('');
  const [camOutletId, setCamOutletId] = useState(defaultOutletId);
  const [camSourceType, setCamSourceType] = useState<CctvCameraSourceType>('webcam');
  const [camStreamUrl, setCamStreamUrl] = useState('');
  const [camTableCapacity, setCamTableCapacity] = useState(20);
  const [camRetention, setCamRetention] = useState(14);
  const [camPrivacyNotice, setCamPrivacyNotice] = useState(true);
  const [savingCam, setSavingCam] = useState(false);

  const stopWebcamStream = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setWebcamActive(false);
    setRecordingClip(false);
    setRecordCountdown(0);
  }, []);

  useEffect(() => {
    return () => {
      stopWebcamStream();
    };
  }, [stopWebcamStream]);

  useEffect(() => {
    if (!videoFile) {
      setLocalVideoPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setLocalVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    return () => {
      if (videoPlaybackUrl) URL.revokeObjectURL(videoPlaybackUrl);
    };
  }, [videoPlaybackUrl]);

  useEffect(() => {
    const nextOutlet = activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || 'ALL';
    setSelectedOutletFilter(nextOutlet);
    if (activeOutletId !== 'ALL') {
      setCamOutletId(activeOutletId);
    }
    setUploadCameraId('');
    setLiveCameraId('');
  }, [activeOutletId, activeOutlets]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/cctv/processor-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && mounted) {
          setProcessorStatus(await res.json());
        }
      } catch {
        // Handled by UI fallback
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getIdToken]);

  const filteredCameras = useMemo(
    () =>
      cctvCameras.filter(
        (c) => !selectedOutletFilter || selectedOutletFilter === 'ALL' || c.outletId === selectedOutletFilter
      ),
    [cctvCameras, selectedOutletFilter]
  );

  const filteredUploads = useMemo(
    () =>
      cctvUploads.filter(
        (u) => !selectedOutletFilter || selectedOutletFilter === 'ALL' || u.outletId === selectedOutletFilter
      ),
    [cctvUploads, selectedOutletFilter]
  );

  const activeLiveCamera = useMemo(
    () => filteredCameras.find((c) => c.id === liveCameraId) || filteredCameras[0] || null,
    [filteredCameras, liveCameraId]
  );

  useEffect(() => {
    if (activeLiveCamera) {
      setRemoteUrlInput(activeLiveCamera.streamUrl || '');
      setLanDirectMode(Boolean(activeLiveCamera.streamUrl && isPrivateOrLocalUrl(activeLiveCamera.streamUrl)));
    }
  }, [activeLiveCamera?.id]);

  // Select most recent completed upload by default when available
  const displayedUpload = useMemo(() => {
    if (selectedUploadId) {
      const found = filteredUploads.find((u) => u.id === selectedUploadId);
      if (found) return found;
    }
    return filteredUploads.find((u) => u.jobStatus === 'completed' && u.analysisResult) || filteredUploads[0] || null;
  }, [filteredUploads, selectedUploadId]);

  const refreshVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoInputs);
      if (!selectedDeviceId && videoInputs[0]?.deviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch {
      // Ignore permission constraints prior to getUserMedia
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshVideoDevices();
  }, [refreshVideoDevices]);

  const openNewCam = () => {
    setEditingCam(null);
    setCamName('');
    setCamArea('Area Duduk Utama');
    setCamOutletId(
      selectedOutletFilter !== 'ALL' ? selectedOutletFilter : defaultOutletId || activeOutlets[0]?.id || ''
    );
    setCamSourceType('webcam');
    setCamStreamUrl('');
    setCamTableCapacity(20);
    setCamRetention(14);
    setCamPrivacyNotice(true);
    setCamModalOpen(true);
  };

  const openEditCam = (cam: CctvCamera) => {
    setEditingCam(cam);
    setCamName(cam.name);
    setCamArea(cam.locationArea);
    setCamOutletId(cam.outletId);
    setCamSourceType(cam.sourceType || 'upload_only');
    setCamStreamUrl(cam.streamUrl || '');
    setCamTableCapacity(cam.tableCapacity ?? 20);
    setCamRetention(cam.retentionDays);
    setCamPrivacyNotice(cam.privacyNoticeEnabled !== false);
    setCamModalOpen(true);
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camName.trim() || !camArea.trim() || !camOutletId) {
      showToast('Nama kamera, area lokasi, dan outlet wajib diisi.', 'error');
      return;
    }
    if (
      ['http_snapshot', 'mjpeg_stream', 'hls_stream', 'rtsp'].includes(camSourceType) &&
      !camStreamUrl.trim()
    ) {
      showToast('URL stream / snapshot kamera wajib diisi untuk tipe kamera jaringan.', 'error');
      return;
    }
    setSavingCam(true);
    try {
      const savedId = await saveCctvCamera(
        {
          outletId: camOutletId,
          name: camName.trim(),
          locationArea: camArea.trim(),
          retentionDays: Number(camRetention) || 14,
          privacyNoticeEnabled: camPrivacyNotice,
          sourceType: camSourceType,
          streamUrl: camStreamUrl.trim() || undefined,
          tableCapacity: Math.max(0, Math.min(500, Number(camTableCapacity) || 0)),
          connectionStatus: editingCam?.connectionStatus || 'standby',
        },
        editingCam?.id
      );
      showToast(editingCam ? 'Konfigurasi kamera diperbarui.' : 'Kamera CCTV baru ditambahkan.', 'success');
      setLiveCameraId(savedId);
      setUploadCameraId(savedId);
      setCamModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan kamera.'), 'error');
    } finally {
      setSavingCam(false);
    }
  };

  const analyzeStoredVideoRecord = useCallback(
    async (upload: CctvUpload, cam?: CctvCamera | null) => {
      if (!upload.storedFileName) {
        showToast('File video tidak tersedia di server untuk rekaman ini. Silakan unggah ulang video.', 'error');
        return;
      }
      setAnalyzingUploadId(upload.id);
      setSelectedUploadId(upload.id);
      try {
        await updateCctvUploadRecord(upload.id, {
          jobStatus: 'processing',
          processorMessage: 'Sedang mengekstrak frame & menganalisa rekaman dengan Computer Vision...',
        });

        const token = await getIdToken();
        const outletName = outlets.find((o) => o.id === upload.outletId)?.name || 'Outlet';
        const res = await fetch('/api/cctv/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            storedFileName: upload.storedFileName,
            cameraName: upload.cameraName || cam?.name || 'Kamera CCTV',
            locationArea: cam?.locationArea || 'Area Outlet',
            outletName,
            tableCapacity: cam?.tableCapacity,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.analysisResult) {
          throw new Error(data.error || 'Gagal menjalankan analisa Computer Vision pada video.');
        }

        const result: CctvAnalysisResult = data.analysisResult;
        const analyzedAt: string = data.analyzedAt || new Date().toISOString();

        await updateCctvUploadRecord(upload.id, {
          jobStatus: 'completed',
          processorMessage: `Analisa selesai (${result.framesAnalyzed} frame): ${result.peopleCount} orang, okupansi ${result.occupancyPercent}%.`,
          analysisResult: result,
          analyzedAt,
        });

        if (cam) {
          await saveCctvCamera(
            {
              outletId: cam.outletId,
              name: cam.name,
              locationArea: cam.locationArea,
              retentionDays: cam.retentionDays,
              privacyNoticeEnabled: cam.privacyNoticeEnabled,
              sourceType: cam.sourceType,
              streamUrl: cam.streamUrl,
              deviceLabel: cam.deviceLabel,
              connectionStatus: 'connected',
              tableCapacity: cam.tableCapacity,
              lastAnalyzedAt: analyzedAt,
              lastSummary: result.summary,
            },
            cam.id
          );
        }

        showToast('Analisa Computer Vision selesai dan tersimpan!', 'success');
      } catch (err) {
        const msg = formatAppError(err, 'Gagal menganalisa video.');
        try {
          await updateCctvUploadRecord(upload.id, {
            jobStatus: 'failed',
            processorMessage: msg,
          });
        } catch {
          // ignore secondary failure
        }
        showToast(msg, 'error');
      } finally {
        setAnalyzingUploadId(null);
      }
    },
    [getIdToken, outlets, saveCctvCamera, showToast, updateCctvUploadRecord]
  );

  const uploadAndOptionallyAnalyzeFile = useCallback(
    async (file: File, targetCam: CctvCamera, runAnalyzeNow: boolean) => {
      setUploading(true);
      try {
        const token = await getIdToken();
        const formData = new FormData();
        formData.append('video', file);

        const res = await fetch('/api/cctv/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal mengunggah video CCTV ke server.');
        }

        const newUploadId = await createCctvUploadRecord({
          outletId: targetCam.outletId,
          cameraId: targetCam.id,
          cameraName: targetCam.name,
          fileName: data.originalName || file.name,
          storedFileName: data.storedFileName,
          fileSizeBytes: data.fileSizeBytes || file.size,
          mimeType: data.mimeType || file.type || 'video/mp4',
          jobStatus: runAnalyzeNow ? 'processing' : 'uploaded',
          processorMessage: runAnalyzeNow
            ? 'Video terunggah. Menjalankan analisa Computer Vision...'
            : data.processorMessage || 'Video tersimpan aman dan siap dianalisa.',
        });

        setSelectedUploadId(newUploadId);
        setVideoFile(null);

        if (runAnalyzeNow) {
          await analyzeStoredVideoRecord(
            {
              id: newUploadId,
              businessId: targetCam.businessId,
              outletId: targetCam.outletId,
              ownerUid: targetCam.ownerUid,
              memberUids: targetCam.memberUids,
              cameraId: targetCam.id,
              cameraName: targetCam.name,
              fileName: data.originalName || file.name,
              storedFileName: data.storedFileName,
              fileSizeBytes: data.fileSizeBytes || file.size,
              mimeType: data.mimeType || file.type || 'video/mp4',
              jobStatus: 'processing',
            },
            targetCam
          );
        } else {
          showToast('Video berhasil diunggah. Klik "Analisa CV" kapan saja untuk memprosesnya.', 'success');
        }
      } catch (err) {
        showToast(formatAppError(err, 'Gagal mengunggah video.'), 'error');
      } finally {
        setUploading(false);
      }
    },
    [analyzeStoredVideoRecord, createCctvUploadRecord, getIdToken, showToast]
  );

  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      showToast('Pilih file rekaman video terlebih dahulu.', 'error');
      return;
    }
    const targetCam = filteredCameras.find((c) => c.id === uploadCameraId) || filteredCameras[0];
    if (!targetCam) {
      showToast('Tambahkan minimal satu kamera CCTV terlebih dahulu.', 'error');
      return;
    }
    await uploadAndOptionallyAnalyzeFile(videoFile, targetCam, autoAnalyzeOnUpload);
  };

  // Connect local webcam / USB camera / HDMI capture card
  const handleStartWebcam = async () => {
    setWebcamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Browser ini tidak mendukung akses kamera langsung (getUserMedia).');
      return;
    }
    stopWebcamStream();
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamActive(true);
      await refreshVideoDevices();
      showToast('Kamera berhasil terhubung untuk pratinjau langsung.', 'success');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Izin kamera ditolak atau kamera sedang dipakai aplikasi lain.';
      setWebcamError(`Tidak dapat mengakses kamera: ${msg}`);
      showToast('Gagal menghubungkan kamera perangkat.', 'error');
    }
  };

  const analyzeDataUrlSnapshot = useCallback(
    async (imageDataUrl: string, targetCam: CctvCamera, sourceLabel: string) => {
      setCapturingLive(true);
      setLiveSnapshotPreview(imageDataUrl);
      try {
        const token = await getIdToken();
        const outletName = outlets.find((o) => o.id === targetCam.outletId)?.name || 'Outlet';
        const res = await fetch('/api/cctv/analyze-frame', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageDataUrl,
            cameraName: targetCam.name,
            locationArea: targetCam.locationArea,
            outletName,
            tableCapacity: targetCam.tableCapacity,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.analysisResult) {
          throw new Error(data.error || 'Gagal menganalisa snapshot kamera.');
        }

        const result: CctvAnalysisResult = data.analysisResult;
        const analyzedAt: string = data.analyzedAt || new Date().toISOString();
        const stamp = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/[:.]/g, '-');
        const approxBytes = Math.max(1024, Math.round((imageDataUrl.length * 3) / 4));

        const newId = await createCctvUploadRecord({
          outletId: targetCam.outletId,
          cameraId: targetCam.id,
          cameraName: targetCam.name,
          fileName: `${sourceLabel}_${stamp}.jpg`,
          fileSizeBytes: approxBytes,
          mimeType: 'image/jpeg',
          jobStatus: 'completed',
          processorMessage: `Analisa snapshot langsung: ${result.peopleCount} orang, okupansi ${result.occupancyPercent}%.`,
          analysisResult: result,
          analyzedAt,
        });

        await saveCctvCamera(
          {
            outletId: targetCam.outletId,
            name: targetCam.name,
            locationArea: targetCam.locationArea,
            retentionDays: targetCam.retentionDays,
            privacyNoticeEnabled: targetCam.privacyNoticeEnabled,
            sourceType: targetCam.sourceType || 'webcam',
            streamUrl: targetCam.streamUrl,
            deviceLabel:
              availableDevices.find((d) => d.deviceId === selectedDeviceId)?.label || targetCam.deviceLabel,
            connectionStatus: 'connected',
            tableCapacity: targetCam.tableCapacity,
            lastAnalyzedAt: analyzedAt,
            lastSummary: result.summary,
          },
          targetCam.id
        );

        setSelectedUploadId(newId);
        showToast('Analisa frame kamera langsung selesai!', 'success');
      } catch (err) {
        showToast(formatAppError(err, 'Gagal menganalisa frame kamera.'), 'error');
      } finally {
        setCapturingLive(false);
      }
    },
    [availableDevices, createCctvUploadRecord, getIdToken, outlets, saveCctvCamera, selectedDeviceId, showToast]
  );

  const captureWebcamFrameAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !webcamActive) {
      showToast('Hubungkan kamera terlebih dahulu.', 'error');
      return;
    }
    if (!activeLiveCamera) {
      showToast('Tambahkan atau pilih kamera tujuan terlebih dahulu.', 'error');
      return;
    }

    const vid = videoRef.current;
    const width = vid.videoWidth || 1280;
    const height = vid.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    await analyzeDataUrlSnapshot(dataUrl, activeLiveCamera, 'live_webcam');
  }, [activeLiveCamera, analyzeDataUrlSnapshot, showToast, webcamActive]);

  // Auto-scan interval when live webcam is active
  useEffect(() => {
    if (!webcamActive || autoScanIntervalSec === 0) return;
    const id = window.setInterval(() => {
      if (!capturingLive) {
        captureWebcamFrameAndAnalyze();
      }
    }, autoScanIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [autoScanIntervalSec, captureWebcamFrameAndAnalyze, capturingLive, webcamActive]);

  // Record 8-second video clip directly from connected webcam & analyze
  const handleRecordAndAnalyzeClip = async () => {
    if (!mediaStreamRef.current || !webcamActive) {
      showToast('Hubungkan kamera terlebih dahulu sebelum merekam.', 'error');
      return;
    }
    if (!activeLiveCamera) {
      showToast('Pilih kamera tujuan terlebih dahulu.', 'error');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      showToast('Browser tidak mendukung perekaman video langsung (MediaRecorder).', 'error');
      return;
    }

    const chunks: BlobPart[] = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setRecordingClip(false);
      setRecordCountdown(0);
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const clipFile = new File([blob], `rekaman_kamera_${stamp}.webm`, { type: 'video/webm' });
      await uploadAndOptionallyAnalyzeFile(clipFile, activeLiveCamera, true);
    };

    setRecordingClip(true);
    setRecordCountdown(8);
    recorder.start(500);

    recordTimerRef.current = window.setInterval(() => {
      setRecordCountdown((prev) => {
        if (prev <= 1) {
          if (recorder.state !== 'inactive') recorder.stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStopRecordingEarly = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Remote IP Camera / RTSP / HLS / Snapshot URL capture & analyze
  const handleRemoteCameraCapture = async (analyzeNow: boolean) => {
    if (!activeLiveCamera) {
      showToast('Tambahkan atau pilih kamera terlebih dahulu.', 'error');
      return;
    }
    const targetUrl = (remoteUrlInput || activeLiveCamera.streamUrl || '').trim();
    if (!targetUrl) {
      showToast('Masukkan URL kamera (HTTP Snapshot, MJPEG, HLS .m3u8, atau RTSP) terlebih dahulu.', 'error');
      return;
    }

    if (isPrivateOrLocalUrl(targetUrl)) {
      if (/^rtsps?:/i.test(targetUrl)) {
        setLanDirectMode(false);
        showToast(
          'Stream RTSP di IP lokal/LAN tidak dapat diputar langsung oleh browser. Gunakan URL HTTP Snapshot/MJPEG kamera (mis. http://192.168.x.x/snapshot.jpg), hubungkan via HDMI-to-USB Capture Card, pakai DDNS publik, atau unggah klip rekaman.',
          'error'
        );
        return;
      }
      setLanDirectMode(true);
      if (!analyzeNow) {
        setRemotePreviewFrame(targetUrl);
        showToast(
          'Alamat HTTP lokal LAN terdeteksi. Memuat pratinjau langsung lewat browser jaringan Wi-Fi lokal Anda.',
          'info'
        );
        return;
      }
      // Try capturing from the browser-loaded LAN image via canvas
      const img = lanImgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            await analyzeDataUrlSnapshot(dataUrl, activeLiveCamera, 'lan_snapshot');
            return;
          }
        } catch {
          showToast(
            'Kamera LAN tidak mengizinkan pembacaan piksel lintas-origin (CORS). Gunakan kamera USB/Capture Card atau unggah file rekaman klip dari NVR.',
            'error'
          );
          return;
        }
      }
      showToast(
        'Klik "Muat Pratinjau" terlebih dahulu untuk memverifikasi gambar dari jaringan LAN lokal, atau gunakan kamera USB/Unggah Video.',
        'error'
      );
      return;
    }

    setLanDirectMode(false);
    setCapturingLive(true);
    try {
      const token = await getIdToken();
      const outletName = outlets.find((o) => o.id === activeLiveCamera.outletId)?.name || 'Outlet';
      const res = await fetch('/api/cctv/capture-remote-frame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          streamUrl: targetUrl,
          analyze: analyzeNow,
          cameraName: activeLiveCamera.name,
          locationArea: activeLiveCamera.locationArea,
          outletName,
          tableCapacity: activeLiveCamera.tableCapacity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.isPrivateLan) {
          setLanDirectMode(true);
        }
        throw new Error(data.error || 'Gagal mengambil frame dari URL kamera.');
      }

      if (data.frameDataUrl) {
        setRemotePreviewFrame(data.frameDataUrl);
        setLiveSnapshotPreview(data.frameDataUrl);
      }

      // Persist streamUrl update if edited inline
      if (targetUrl !== activeLiveCamera.streamUrl) {
        await saveCctvCamera(
          {
            outletId: activeLiveCamera.outletId,
            name: activeLiveCamera.name,
            locationArea: activeLiveCamera.locationArea,
            retentionDays: activeLiveCamera.retentionDays,
            privacyNoticeEnabled: activeLiveCamera.privacyNoticeEnabled,
            sourceType: activeLiveCamera.sourceType || 'http_snapshot',
            streamUrl: targetUrl,
            connectionStatus: 'connected',
            tableCapacity: activeLiveCamera.tableCapacity,
          },
          activeLiveCamera.id
        );
      }

      if (analyzeNow && data.analysisResult) {
        const result: CctvAnalysisResult = data.analysisResult;
        const analyzedAt: string = data.analyzedAt || new Date().toISOString();
        const stamp = new Date().toLocaleTimeString('id-ID', { hour12: false }).replace(/[:.]/g, '-');
        const newId = await createCctvUploadRecord({
          outletId: activeLiveCamera.outletId,
          cameraId: activeLiveCamera.id,
          cameraName: activeLiveCamera.name,
          fileName: `remote_stream_${stamp}.jpg`,
          fileSizeBytes: Math.max(1024, Math.round((String(data.frameDataUrl || '').length * 3) / 4)),
          mimeType: 'image/jpeg',
          jobStatus: 'completed',
          processorMessage: `Analisa kamera jaringan: ${result.peopleCount} orang, okupansi ${result.occupancyPercent}%.`,
          analysisResult: result,
          analyzedAt,
        });
        setSelectedUploadId(newId);
        showToast('Frame kamera jaringan berhasil diambil dan dianalisa!', 'success');
      } else {
        showToast('Koneksi kamera berhasil! Pratinjau frame terbaru ditampilkan.', 'success');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menghubungkan ke kamera jaringan.'), 'error');
    } finally {
      setCapturingLive(false);
    }
  };

  const handleLoadStoredVideoPlayback = async (storedFileName: string) => {
    setLoadingPlayback(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/cctv/video/${encodeURIComponent(storedFileName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('File video tidak lagi tersedia di penyimpanan server.');
      }
      const blob = await res.blob();
      if (videoPlaybackUrl) URL.revokeObjectURL(videoPlaybackUrl);
      setVideoPlaybackUrl(URL.createObjectURL(blob));
    } catch (err) {
      showToast(formatAppError(err, 'Gagal memuat pemutar video.'), 'error');
    } finally {
      setLoadingPlayback(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const densityBadgeText = (d: CctvAnalysisResult['crowdDensity']) => {
    if (d === 'padat') return { label: 'Padat', cls: 'text-red-700 bg-red-50 border-red-200' };
    if (d === 'ramai') return { label: 'Ramai', cls: 'text-amber-700 bg-amber-50 border-amber-200' };
    if (d === 'sedang') return { label: 'Sedang', cls: 'text-blue-700 bg-blue-50 border-blue-200' };
    return { label: 'Sepi', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  };

  const activeResult = displayedUpload?.analysisResult || null;

  return (
    <div className="space-y-6">
      {/* CV Pipeline Status Banner */}
      <div
        className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          processorStatus?.connected === false
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              processorStatus?.connected === false
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {processorStatus?.connected === false ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </div>
          <div className="text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display font-bold text-sm text-slate-900">
                {processorStatus?.connected === false
                  ? 'Pipeline Computer Vision Menunggu Konfigurasi'
                  : processorStatus?.engine || 'Gemini 4 Computer Vision + FFmpeg Aktif'}
              </p>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span
                className={`text-xs font-semibold ${
                  processorStatus?.connected === false ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {processorStatus?.connected === false ? 'Belum Aktif' : 'Terhubung'}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {processorStatus?.message ||
                'Hubungkan kamera langsung (Webcam/USB/Capture Card/IP Stream/RTSP) atau unggah rekaman video CCTV untuk analisa Computer Vision nyata.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Filter Outlet CCTV"
            value={selectedOutletFilter}
            onChange={(e) => {
              setSelectedOutletFilter(e.target.value);
              setUploadCameraId('');
              setLiveCameraId('');
            }}
            className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-medium text-slate-800"
          >
            <option value="ALL">Semua Outlet ({activeOutlets.length})</option>
            {activeOutlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openNewCam}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Kamera
          </button>
        </div>
      </div>

      {/* Main Input Workspace: Mode Switcher + Registered Cameras */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Source Panel (Upload Video OR Connect Any Camera) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md transition-all whitespace-nowrap ${
                  activeTab === 'upload'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Unggah & Analisa Video
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md transition-all whitespace-nowrap ${
                  activeTab === 'live'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Hubungkan Kamera Langsung
              </button>
            </div>

            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Zero Facial Recognition
            </span>
          </div>

          {activeTab === 'upload' ? (
            <form onSubmit={handleUploadVideo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kamera Sumber</label>
                  <select
                    value={uploadCameraId || filteredCameras[0]?.id || ''}
                    onChange={(e) => setUploadCameraId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {filteredCameras.length === 0 ? (
                      <option value="">Belum ada kamera terdaftar</option>
                    ) : (
                      filteredCameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.locationArea})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    File Rekaman Video (maks. 50 MB)
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>

              {localVideoPreviewUrl && videoFile && (
                <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden">
                  <video src={localVideoPreviewUrl} controls className="w-full max-h-56 object-contain" />
                  <div className="px-3 py-2 bg-slate-900 text-slate-300 text-[11px] flex items-center justify-between tabular-nums">
                    <span className="truncate">{videoFile.name}</span>
                    <span>{formatBytes(videoFile.size)}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAnalyzeOnUpload}
                    onChange={(e) => setAutoAnalyzeOnUpload(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Langsung jalankan analisa Computer Vision setelah unggah
                </label>

                <button
                  type="submit"
                  disabled={uploading || Boolean(analyzingUploadId) || !videoFile || filteredCameras.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  {uploading
                    ? 'Mengunggah...'
                    : analyzingUploadId
                      ? 'Menganalisa Video...'
                      : autoAnalyzeOnUpload
                        ? 'Unggah & Analisa Video'
                        : 'Unggah ke Antrean'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Select camera profile for live connection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Profil Kamera Outlet</label>
                  <select
                    value={activeLiveCamera?.id || ''}
                    onChange={(e) => setLiveCameraId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {filteredCameras.length === 0 ? (
                      <option value="">Belum ada kamera</option>
                    ) : (
                      filteredCameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {SOURCE_TYPE_LABELS[c.sourceType || 'webcam']}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Perangkat Webcam / USB / Capture Card
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white truncate"
                    >
                      {availableDevices.length === 0 ? (
                        <option value="">Kamera Default Perangkat</option>
                      ) : (
                        availableDevices.map((d, idx) => (
                          <option key={d.deviceId || idx} value={d.deviceId}>
                            {d.label || `Kamera #${idx + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={refreshVideoDevices}
                      title="Muat ulang daftar kamera perangkat"
                      className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 1: Local Webcam / USB / HDMI Capture Card Live Feed */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950">
                <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-contain ${webcamActive ? 'block' : 'hidden'}`}
                  />
                  {!webcamActive && (
                    <div className="text-center p-6 space-y-2">
                      {liveSnapshotPreview ? (
                        <img
                          src={liveSnapshotPreview}
                          alt="Snapshot kamera terakhir"
                          className="max-h-48 mx-auto rounded-lg border border-slate-800 object-contain"
                        />
                      ) : (
                        <>
                          <VideoOff className="w-8 h-8 text-slate-500 mx-auto" />
                          <p className="text-xs text-slate-300 font-medium">
                            Kamera USB/Webcam belum aktif
                          </p>
                          <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                            Hubungkan kamera laptop, webcam eksternal, atau DVR/CCTV via HDMI-to-USB Capture Card, atau gunakan koneksi URL IP Camera di bawah.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {recordingClip && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-bold tabular-nums">
                      REC · {recordCountdown}s
                    </div>
                  )}
                </div>

                {webcamError && (
                  <div className="px-3 py-2 bg-red-950 text-red-200 text-xs border-t border-red-900">
                    {webcamError}
                  </div>
                )}

                <div className="p-3 bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!webcamActive ? (
                      <button
                        type="button"
                        onClick={handleStartWebcam}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Hubungkan Kamera Lokal
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={stopWebcamStream}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg whitespace-nowrap"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                          Putuskan
                        </button>
                        <button
                          type="button"
                          disabled={capturingLive || !activeLiveCamera}
                          onClick={captureWebcamFrameAndAnalyze}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg disabled:opacity-50 whitespace-nowrap"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {capturingLive ? 'Menganalisa...' : 'Capture & Analisa'}
                        </button>
                        {!recordingClip ? (
                          <button
                            type="button"
                            disabled={uploading || Boolean(analyzingUploadId) || !activeLiveCamera}
                            onClick={handleRecordAndAnalyzeClip}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap"
                          >
                            <Film className="w-3.5 h-3.5" />
                            Rekam 8 dtk & Analisa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStopRecordingEarly}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                          >
                            <Square className="w-3.5 h-3.5" />
                            Stop Rekam
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {webcamActive && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                      <span>Auto-Scan:</span>
                      <select
                        value={autoScanIntervalSec}
                        onChange={(e) => setAutoScanIntervalSec(Number(e.target.value) as 0 | 30 | 60)}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                      >
                        <option value={0}>Manual</option>
                        <option value={30}>Tiap 30 dtk</option>
                        <option value={60}>Tiap 60 dtk</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Connect IP Camera / CCTV URL (RTSP / HLS / MJPEG / HTTP Snapshot) */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Hubungkan IP Camera / RTSP / HLS / Snapshot URL
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">RTSP · HLS .m3u8 · MJPEG · JPG</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={remoteUrlInput}
                    onChange={(e) => setRemoteUrlInput(e.target.value)}
                    placeholder="Contoh: rtsp://cam.domain.com:554/stream1 atau https://.../snapshot.jpg"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                  <button
                    type="button"
                    disabled={capturingLive || !activeLiveCamera}
                    onClick={() => handleRemoteCameraCapture(false)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    Muat Pratinjau
                  </button>
                  <button
                    type="button"
                    disabled={capturingLive || !activeLiveCamera}
                    onClick={() => handleRemoteCameraCapture(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {capturingLive ? 'Memproses...' : 'Ambil & Analisa CV'}
                  </button>
                </div>

                {remotePreviewFrame && (
                  <div className="rounded-lg border border-slate-200 bg-slate-950 overflow-hidden p-2">
                    <img
                      ref={lanImgRef}
                      src={remotePreviewFrame}
                      crossOrigin={lanDirectMode ? 'anonymous' : undefined}
                      alt="Pratinjau kamera jaringan"
                      className="max-h-48 mx-auto rounded object-contain"
                    />
                  </div>
                )}

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Mendukung kamera publik/DDNS (`rtsp://`, `https://`, HLS `.m3u8`, MJPEG) via server, maupun snapshot HTTP pada jaringan Wi-Fi lokal (LAN). Untuk kamera DVR lokal tertutup tanpa akses publik, Anda juga dapat menghubungkan via HDMI-to-USB Capture Card atau mengunggah klip MP4.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Registered Cameras & Upload/Analysis History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Camera List */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Kamera Terdaftar ({filteredCameras.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={openNewCam}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + Tambah
              </button>
            </div>

            {filteredCameras.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Belum ada kamera CCTV dikonfigurasi. Klik "+ Tambah" untuk menghubungkan kamera.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {filteredCameras.map((cam) => {
                  const outletName = outlets.find((o) => o.id === cam.outletId)?.name || 'Outlet';
                  const isSelected = activeLiveCamera?.id === cam.id;
                  return (
                    <div
                      key={cam.id}
                      className={`py-3 flex items-start justify-between gap-3 first:pt-1 last:pb-1 ${
                        isSelected ? 'bg-blue-50/40 -mx-2 px-2 rounded-lg' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-slate-900 truncate">{cam.name}</p>
                          {cam.connectionStatus === 'connected' && (
                            <span className="text-[10px] font-semibold text-emerald-700 shrink-0">Aktif</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {outletName} · {cam.locationArea}
                          {typeof cam.tableCapacity === 'number' && cam.tableCapacity > 0
                            ? ` · ${cam.tableCapacity} kursi`
                            : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {SOURCE_TYPE_LABELS[cam.sourceType || 'upload_only']}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setLiveCameraId(cam.id);
                            setUploadCameraId(cam.id);
                            setActiveTab(cam.sourceType === 'upload_only' ? 'upload' : 'live');
                          }}
                          className="text-[11px] font-semibold text-blue-600 hover:underline"
                        >
                          Pilih
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditCam(cam)}
                          className="text-[11px] font-medium text-slate-600 hover:underline"
                        >
                          Ubah
                        </button>
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteCctvCamera(cam.id)
                                .then(() => showToast('Kamera dihapus.', 'info'))
                                .catch((err) => showToast(formatAppError(err, 'Gagal menghapus kamera.'), 'error'))
                            }
                            aria-label="Hapus kamera"
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload & Analysis History */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Riwayat Rekaman & Analisa ({filteredUploads.length})
            </h3>
            {filteredUploads.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Belum ada rekaman video atau snapshot yang dianalisa.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {filteredUploads.slice(0, 15).map((u) => {
                  const isBusy = analyzingUploadId === u.id || u.jobStatus === 'processing';
                  const isSelected = displayedUpload?.id === u.id;
                  const cam = cctvCameras.find((c) => c.id === u.cameraId) || null;
                  return (
                    <div
                      key={u.id}
                      className={`py-3 flex items-start justify-between gap-3 first:pt-1 last:pb-1 ${
                        isSelected ? 'bg-blue-50/50 -mx-2 px-2 rounded-lg' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{u.fileName}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {u.cameraName || 'Kamera'} · {formatBytes(u.fileSizeBytes)}
                        </p>
                        <p
                          className={`text-[11px] font-semibold mt-1 ${
                            u.jobStatus === 'completed'
                              ? 'text-emerald-700'
                              : u.jobStatus === 'failed'
                                ? 'text-red-600'
                                : 'text-amber-700'
                          }`}
                        >
                          {u.jobStatus === 'completed'
                            ? `Selesai · ${u.analysisResult?.peopleCount ?? 0} orang · Okupansi ${u.analysisResult?.occupancyPercent ?? 0}%`
                            : isBusy
                              ? 'Sedang menganalisa CV...'
                              : u.jobStatus === 'failed'
                                ? 'Gagal dianalisa'
                                : 'Siap dianalisa'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {u.analysisResult && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUploadId(u.id);
                              setVideoPlaybackUrl('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold"
                          >
                            <Eye className="w-3 h-3" />
                            Hasil
                          </button>
                        )}
                        {u.storedFileName && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => analyzeStoredVideoRecord(u, cam)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold disabled:opacity-50"
                          >
                            <Sparkles className="w-3 h-3" />
                            {isBusy ? 'Proses...' : u.analysisResult ? 'Analisa Ulang' : 'Analisa CV'}
                          </button>
                        )}
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteCctvUpload(u.id)
                                .then(() => showToast('Riwayat rekaman dihapus.', 'info'))
                                .catch((err) => showToast(formatAppError(err, 'Gagal menghapus rekaman.'), 'error'))
                            }
                            aria-label="Hapus riwayat"
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real Computer Vision Analysis Results */}
      {activeResult && displayedUpload ? (
        <div className="space-y-5 border-t border-slate-200 pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Hasil Analisa Computer Vision (Aktual)
                </h3>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-xs font-semibold text-emerald-700">
                  Dari Rekaman Nyata
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Sumber: <span className="font-semibold text-slate-700">{displayedUpload.fileName}</span> ·{' '}
                {displayedUpload.cameraName || 'Kamera'}
                {displayedUpload.analyzedAt &&
                  ` · Dianalisa ${new Date(displayedUpload.analyzedAt).toLocaleString('id-ID')}`}
              </p>
            </div>

            {displayedUpload.storedFileName && (
              <button
                type="button"
                disabled={loadingPlayback}
                onClick={() => handleLoadStoredVideoPlayback(displayedUpload.storedFileName!)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {loadingPlayback ? 'Memuat Video...' : 'Putar Rekaman Video'}
              </button>
            )}
          </div>

          {videoPlaybackUrl && (
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
              <video src={videoPlaybackUrl} controls className="w-full max-h-80 object-contain" />
            </div>
          )}

          {/* Real KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              label="Pengunjung Terdeteksi"
              value={`${formatNumberID(activeResult.peopleCount)} org`}
              subtext={`Puncak terlihat: ${activeResult.peakPeopleCount} orang`}
              icon={<Users className="w-4 h-4 text-blue-600" />}
            />
            <MetricCard
              label="Okupansi Kursi"
              value={`${activeResult.occupancyPercent}%`}
              subtext={`${activeResult.occupiedSeats} / ${activeResult.estimatedTotalSeats} kursi terisi`}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            />
            <MetricCard
              label="Antrean Kasir / Bar"
              value={`${formatNumberID(activeResult.queueCount)} org`}
              subtext={`Est. tunggu ${formatNumberID(activeResult.estimatedQueueMinutes)} menit`}
              icon={<Clock className="w-4 h-4 text-amber-600" />}
            />
            <MetricCard
              label="Kepadatan Area"
              value={densityBadgeText(activeResult.crowdDensity).label}
              subtext={`${activeResult.framesAnalyzed} frame dianalisa`}
              icon={<Activity className="w-4 h-4 text-indigo-600" />}
            />
            <MetricCard
              label="Durasi Rekaman"
              value={activeResult.videoDurationSec > 0 ? `${activeResult.videoDurationSec} dtk` : 'Snapshot'}
              subtext={activeResult.videoDurationSec > 0 ? 'Klip video diproses FFmpeg' : 'Analisa frame langsung'}
              icon={<Video className="w-4 h-4 text-slate-700" />}
            />
          </div>

          {/* Summary & Honest Confidence */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-2">
            <p className="text-sm font-bold text-slate-900">Ringkasan Visual</p>
            <p className="text-sm text-slate-700 leading-relaxed">{activeResult.summary}</p>
            <p className="text-xs text-slate-500 flex items-start gap-1.5 pt-1">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{activeResult.confidenceNote}</span>
            </p>
          </div>

          {/* Timeline Chart + Zone Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5">
              <h4 className="text-sm font-bold text-slate-900">Timeline Aktivitas & Okupansi Rekaman</h4>
              <p className="text-xs text-slate-500 mb-4">
                Jumlah pengunjung dan tingkat hunian kursi berdasarkan timestamp frame video
              </p>
              {activeResult.timeline.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-slate-400">
                  Data timeline tersedia untuk rekaman multi-frame.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeResult.timeline} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cvOccGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="timestampLabel" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} width={40} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="peopleCount"
                        name="Pengunjung (org)"
                        stroke="#2563EB"
                        strokeWidth={2}
                        fill="url(#cvOccGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="occupancyPercent"
                        name="Okupansi (%)"
                        stroke="#D97706"
                        strokeWidth={1.75}
                        fill="none"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Heatmap & Utilisasi Zona Terdeteksi</h4>
                <p className="text-xs text-slate-500">Distribusi kepadatan pada area pandang kamera</p>
              </div>
              {activeResult.zones.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Tidak ada sub-zona terpisah terdeteksi.</p>
              ) : (
                <div className="space-y-3">
                  {activeResult.zones.map((z, idx) => {
                    const tone =
                      z.status === 'padat'
                        ? 'bg-red-50/80 border-red-200 text-red-900'
                        : z.status === 'optimal'
                          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                          : 'bg-emerald-50/80 border-emerald-200 text-emerald-900';
                    const bar =
                      z.status === 'padat' ? 'bg-red-600' : z.status === 'optimal' ? 'bg-amber-600' : 'bg-emerald-600';
                    return (
                      <div key={idx} className={`p-3 rounded-lg border ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{z.zoneName}</span>
                          <span className="text-xs font-bold tabular-nums">{z.occupancyPercent}% · {z.peopleCount} org</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden my-2">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${z.occupancyPercent}%` }} />
                        </div>
                        {z.note && <p className="text-[11px] opacity-85">{z.note}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Observations & Actionable Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Temuan Operasional Visual</h4>
              {activeResult.observations.length === 0 ? (
                <p className="text-xs text-slate-400">Tidak ada temuan khusus tercatat.</p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-700">
                  {activeResult.observations.map((obs, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-slate-200/90 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Rekomendasi Tindakan Outlet</h4>
              {activeResult.recommendations.length === 0 ? (
                <p className="text-xs text-slate-400">Tidak ada rekomendasi tambahan saat ini.</p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-700">
                  {activeResult.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-xl p-8 text-center space-y-3">
          <Video className="w-9 h-9 text-blue-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">Belum Ada Rekaman yang Dianalisa</h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
            Unggah video rekaman CCTV (MP4/WebM/MOV/AVI/MKV) atau hubungkan kamera langsung pada panel di atas untuk melihat hasil penghitungan pengunjung, okupansi meja, antrean kasir, dan heatmap zona nyata.
          </p>
        </div>
      )}

      {/* Optional Sample / Demo Reference Section */}
      <div className="border-t border-slate-200 pt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Contoh Ilustrasi Analitik Okupansi (Mode Demo)</h4>
            <p className="text-xs text-slate-500">
              Referensi visualisasi jam ramai dan utilisasi meja (bukan hasil dari rekaman Anda)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDemoPreview((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            {showDemoPreview ? 'Sembunyikan Contoh Demo' : 'Lihat Contoh Demo'}
          </button>
        </div>

        {showDemoPreview && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5">
              <h4 className="text-sm font-bold text-slate-900">Jam Ramai & Okupansi Kursi Harian (Sampel Demo)</h4>
              <p className="text-xs text-slate-500 mb-4">Persentase hunian kursi per jam</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={DEMO_HOURLY_OCCUPANCY} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="%" width={44} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="occupancyPct" name="Okupansi (%)" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Heatmap Area Duduk (Sampel Demo)</h4>
              {DEMO_SEATING_ZONES.map((zone) => {
                const pct = Math.round((zone.occupied / zone.capacity) * 100);
                const heatColor =
                  pct >= 80
                    ? 'bg-red-50/80 border-red-200 text-red-900'
                    : pct >= 55
                      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-900';
                const barColor = pct >= 80 ? 'bg-red-600' : pct >= 55 ? 'bg-amber-600' : 'bg-emerald-600';
                return (
                  <div key={zone.id} className={`p-3 rounded-lg border ${heatColor}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{zone.name}</span>
                      <span className="text-xs font-bold tabular-nums">{pct}% terisi</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden my-1.5">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] opacity-85 tabular-nums">
                      {zone.occupied}/{zone.capacity} kursi · Dwell {zone.avgDwellMin} mnt · Turnover {formatNumberID(zone.turnover)}x
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Camera Add/Edit Modal */}
      <Modal
        open={camModalOpen}
        onClose={() => setCamModalOpen(false)}
        title={editingCam ? 'Ubah Konfigurasi Kamera CCTV' : 'Tambah & Hubungkan Kamera Baru'}
      >
        <form onSubmit={handleSaveCamera} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Outlet</label>
            <select
              value={camOutletId}
              onChange={(e) => setCamOutletId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              required
            >
              {activeOutlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kamera</label>
            <input
              type="text"
              value={camName}
              onChange={(e) => setCamName(e.target.value)}
              placeholder="Contoh: Kamera 01 — Area Duduk & Kasir"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Area Lokasi</label>
              <input
                type="text"
                value={camArea}
                onChange={(e) => setCamArea(e.target.value)}
                placeholder="Contoh: Area Duduk Indoor"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kapasitas Kursi Area</label>
              <input
                type="number"
                min={0}
                max={500}
                value={camTableCapacity}
                onChange={(e) => setCamTableCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipe Koneksi Kamera</label>
            <select
              value={camSourceType}
              onChange={(e) => setCamSourceType(e.target.value as CctvCameraSourceType)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {(Object.keys(SOURCE_TYPE_LABELS) as CctvCameraSourceType[]).map((key) => (
                <option key={key} value={key}>
                  {SOURCE_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {['http_snapshot', 'mjpeg_stream', 'hls_stream', 'rtsp'].includes(camSourceType) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">URL Stream / Snapshot Kamera</label>
              <input
                type="text"
                value={camStreamUrl}
                onChange={(e) => setCamStreamUrl(e.target.value)}
                placeholder={
                  camSourceType === 'rtsp'
                    ? 'rtsp://user:pass@domain-kamera:554/stream1'
                    : camSourceType === 'hls_stream'
                      ? 'https://domain-kamera/live/stream.m3u8'
                      : 'https://domain-kamera/snapshot.jpg'
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Retensi Video (Hari)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={camRetention}
              onChange={(e) => setCamRetention(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={camPrivacyNotice}
              onChange={(e) => setCamPrivacyNotice(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            Aktifkan pemberitahuan privasi area CCTV tanpa pengenalan wajah
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCamModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingCam}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingCam ? 'Menyimpan...' : 'Simpan Kamera'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ez-card-interactive bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-slate-100/90 flex items-center justify-center shrink-0">{icon}</div>
      </div>
      <p className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
        {value}
      </p>
      <p className="text-[11px] text-slate-500 mt-1.5 truncate">{subtext}</p>
    </div>
  );
}
