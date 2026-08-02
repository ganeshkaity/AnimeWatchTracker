"use client";

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Wifi, WifiOff, QrCode, Camera, Tv, Smartphone, RefreshCw, 
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Play, 
  Settings2, Power, Layers, Film, ChevronRight, ArrowLeft,
  SmartphoneNfc, Laptop, ExternalLink, HardDrive, Check, Copy, ImagePlus, KeyRound, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalAnimes, getLocalEpisodes } from '../utils/localStore';
import ArtPlayerContainer from './ArtPlayerContainer';

const PAIRING_STORAGE_KEY = 'watchanime_stream_pairing';
const PLAYER_PREF_KEY = 'watchanime_stream_player_pref';

export default function Stream({ onBack }) {
  // Mode: 'host' (PC) or 'show' (Mobile)
  const [activeMode, setActiveMode] = useState('host');

  // ─── PC HOST STATE ────────────────────────────────────────────────────────
  const [hostOnline, setHostOnline] = useState(false);
  const [hostSession, setHostSession] = useState(null);
  const [hostNetInfo, setHostNetInfo] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [startingHost, setStartingHost] = useState(false);
  const [hostCopied, setHostCopied] = useState(false);
  const [addressQrModalOpen, setAddressQrModalOpen] = useState(false);
  const [addressQrDataUrl, setAddressQrDataUrl] = useState('');
  const [passcodeCopied, setPasscodeCopied] = useState(false);
  const [refreshingDevices, setRefreshingDevices] = useState(false);

  // ─── PASSCODE PAIRING STATE ───────────────────────────────────────────────
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [inputPasscode, setInputPasscode] = useState('');
  const [inputHostUrl, setInputHostUrl] = useState('');

  // ─── CUSTOM MODAL DIALOG STATE (Alerts & Confirmations) ─────────────────────
  const [modalConfig, setModalConfig] = useState(null);

  const showAlert = (title, message) => {
    setModalConfig({
      title,
      message,
      type: 'alert',
      confirmText: 'OK',
    });
  };

  const showConfirm = (title, message, onConfirm, { isDanger = false, confirmText = 'Confirm', cancelText = 'Cancel' } = {}) => {
    setModalConfig({
      title,
      message,
      type: 'confirm',
      onConfirm,
      confirmText,
      cancelText,
      isDanger,
    });
  };

  const closeModal = () => {
    setModalConfig(null);
  };

  // ─── MOBILE SHOW STREAM STATE ─────────────────────────────────────────────
  // connectionState: 'unpaired' | 'pairing' | 'connected' | 'host_offline' | 'disconnected'
  const [connectionState, setConnectionState] = useState('unpaired');
  const [pairingData, setPairingData] = useState(null);
  const [hostPingInfo, setHostPingInfo] = useState(null);
  const [pinging, setPinging] = useState(false);
  
  // Camera & Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrCodeRef = useRef(null);

  // Mobile Player Preference: 'artplayer' | 'html5'
  const [playerPref, setPlayerPref] = useState('artplayer');

  // Mobile Video Browsing & Playback
  const [animesList, setAnimesList] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [episodesList, setEpisodesList] = useState([]);
  const [activeEpisode, setActiveEpisode] = useState(null);

  // ─── INITIALIZATION & AUTO-DETECT MODE ──────────────────────────────────
  useEffect(() => {
    // 1. Detect device type for default mode
    if (typeof window !== 'undefined') {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobileUA) {
        setActiveMode('show');
      }

      // Read player preference
      const savedPref = localStorage.getItem(PLAYER_PREF_KEY);
      if (savedPref) setPlayerPref(savedPref);

      // Check URL query parameters for auto-pairing link (e.g. from camera scan)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const urlHost = urlParams.get('host');

      if (urlToken && urlHost) {
        setActiveMode('show');
        executePairing(urlToken, urlHost);
        return;
      }

      // Check saved pairing state in localStorage
      const savedPairing = localStorage.getItem(PAIRING_STORAGE_KEY);
      if (savedPairing) {
        try {
          const parsed = JSON.parse(savedPairing);
          if (parsed && parsed.token && parsed.hostUrl) {
            setPairingData(parsed);
            checkHostPing(parsed.token, parsed.hostUrl, parsed.deviceId);
          }
        } catch {}
      }
    }

    // Fetch initial host status
    fetchHostStatus();
    fetchNetworkInfo();
  }, []);

  // Sync animes list when mobile mode is connected
  useEffect(() => {
    if (activeMode === 'show') {
      const local = getLocalAnimes();
      setAnimesList(local);
    }
  }, [activeMode, connectionState]);

  // Load episodes when an anime is selected on mobile
  useEffect(() => {
    if (selectedAnime) {
      const eps = getLocalEpisodes(selectedAnime.id);
      setEpisodesList(eps);
    } else {
      setEpisodesList([]);
    }
  }, [selectedAnime]);

  // ─── PC HOST ACTIONS ──────────────────────────────────────────────────────
  const fetchNetworkInfo = async () => {
    try {
      const res = await fetch('/api/stream/network');
      const data = await res.json();
      if (data.success) {
        setHostNetInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch network info:', err);
    }
  };

  const fetchHostStatus = async () => {
    try {
      const res = await fetch('/api/stream/host');
      const data = await res.json();
      if (data.success && data.online && data.session) {
        setHostOnline(true);
        setHostSession(data.session);
        generateQRCodeForSession(data.session);
      } else {
        setHostOnline(false);
        setHostSession(null);
      }
    } catch (err) {
      setHostOnline(false);
    }
  };

  const generateQRCodeForSession = async (session) => {
    if (!session) return;
    try {
      const hostUrl = hostNetInfo?.baseUrl || `http://${session.hostIp}:${session.port}`;
      // Direct pairing link URL that can be opened by mobile camera or scanned by in-app scanner
      const pairingUrl = `${hostUrl}/stream?mode=mobile&token=${encodeURIComponent(session.pairingToken)}&host=${encodeURIComponent(hostUrl)}`;
      
      const qrData = await QRCode.toDataURL(pairingUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrDataUrl(qrData);

      // Plain Host URL QR Code
      const addrQr = await QRCode.toDataURL(hostUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setAddressQrDataUrl(addrQr);
    } catch (err) {
      console.error('QR code generation failed:', err);
    }
  };

  const handleStartHost = async () => {
    setStartingHost(true);
    try {
      const netRes = await fetch('/api/stream/network');
      const netData = await netRes.json();

      const res = await fetch('/api/stream/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          hostIp: netData?.primaryIp || '127.0.0.1',
          port: netData?.port || 3000,
        }),
      });

      const data = await res.json();
      if (data.success && data.session) {
        setHostOnline(true);
        setHostSession(data.session);
        setHostNetInfo(netData);
        await generateQRCodeForSession(data.session);
      } else {
        showAlert('Host Error', 'Failed to start host: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      showAlert('Host Error', 'Error starting host server: ' + err.message);
    } finally {
      setStartingHost(false);
    }
  };

  const handleStopHost = () => {
    showConfirm(
      'Disconnect Stream Host?',
      'Are you sure you want to stop Stream Host mode? All connected mobile devices will be disconnected.',
      async () => {
        try {
          await fetch('/api/stream/host', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' }),
          });
          setHostOnline(false);
          setHostSession(null);
          setQrDataUrl('');
        } catch (err) {
          console.error('Error stopping host:', err);
        }
      },
      { isDanger: true, confirmText: 'Stop Host' }
    );
  };

  const handleRevokeDevice = async (deviceId) => {
    try {
      const res = await fetch('/api/stream/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', deviceId }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setHostSession(data.session);
      }
    } catch (err) {
      console.error('Error revoking device:', err);
    }
  };

  const handleRefreshDevices = async () => {
    setRefreshingDevices(true);
    await fetchHostStatus();
    setTimeout(() => setRefreshingDevices(false), 500);
  };

  const copyHostUrl = () => {
    const url = hostNetInfo?.baseUrl || (hostSession ? `http://${hostSession.hostIp}:${hostSession.port}` : '');
    if (url) {
      navigator.clipboard.writeText(url);
      setHostCopied(true);
      setTimeout(() => setHostCopied(false), 2000);
    }
  };

  // ─── MOBILE SHOW STREAM ACTIONS ───────────────────────────────────────────
  const checkHostPing = async (token, hostUrl, deviceId) => {
    setPinging(true);
    try {
      const pingEndpoint = `${hostUrl}/api/stream/ping?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId || '')}`;
      const res = await fetch(pingEndpoint, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();

      if (data.success && data.online && data.valid) {
        setConnectionState('connected');
        setHostPingInfo(data.hostInfo);
      } else if (data.online && !data.valid) {
        setConnectionState('disconnected');
        // Revoked or invalid token
      } else {
        setConnectionState('host_offline');
      }
    } catch (err) {
      console.warn('Host ping failed (host may be offline or IP changed):', err);
      setConnectionState('host_offline');
    } finally {
      setPinging(false);
    }
  };

  const executePairing = async (token, hostUrl) => {
    setConnectionState('pairing');
    try {
      const deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
      const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone' :
                         navigator.userAgent.includes('Android') ? 'Android Mobile' : 'Mobile Device';

      const pairEndpoint = `${hostUrl}/api/stream/pair`;
      const res = await fetch(pairEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceId, deviceName }),
      });

      const data = await res.json();

      if (data.success) {
        const pairingObj = {
          token,
          hostUrl,
          deviceId: data.deviceId,
          deviceName,
          pairedAt: new Date().toISOString(),
        };
        localStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(pairingObj));
        setPairingData(pairingObj);
        setHostPingInfo(data.hostInfo);
        setConnectionState('connected');
      } else {
        showAlert('Pairing Failed', 'Pairing failed: ' + (data.error || 'Invalid QR code or token'));
        setConnectionState('unpaired');
      }
    } catch (err) {
      showAlert('Connection Failed', 'Could not connect to Host PC: ' + err.message + '\n\nMake sure your phone and PC are connected to the same hotspot network.');
      setConnectionState('unpaired');
    }
  };

  const handlePasscodeSubmit = () => {
    if (!inputPasscode || inputPasscode.trim().length < 5) {
      showAlert('Invalid Passcode', 'Please enter the 10-character passcode displayed on your PC Stream Host.');
      return;
    }
    const rawHost = inputHostUrl.trim() || hostNetInfo?.baseUrl || (hostSession ? `http://${hostSession.hostIp}:${hostSession.port}` : window.location.origin);
    
    let formattedHost = rawHost;
    if (!formattedHost.startsWith('http://') && !formattedHost.startsWith('https://')) {
      formattedHost = 'http://' + formattedHost;
    }

    setPasscodeModalOpen(false);
    executePairingWithPasscode(inputPasscode.trim().toUpperCase(), formattedHost);
  };

  const executePairingWithPasscode = async (passcode, hostUrl) => {
    setConnectionState('pairing');
    try {
      const deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
      const deviceName = navigator.userAgent.includes('iPhone') ? 'iPhone' :
                         navigator.userAgent.includes('Android') ? 'Android Mobile' : 'Mobile Device';

      const pairEndpoint = `${hostUrl}/api/stream/pair`;
      const res = await fetch(pairEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, deviceId, deviceName }),
      });

      const data = await res.json();

      if (data.success) {
        const pairingObj = {
          token: data.token,
          hostUrl,
          deviceId: data.deviceId,
          deviceName,
          pairedAt: new Date().toISOString(),
        };
        localStorage.setItem(PAIRING_STORAGE_KEY, JSON.stringify(pairingObj));
        setPairingData(pairingObj);
        setHostPingInfo(data.hostInfo);
        setConnectionState('connected');
      } else {
        showAlert('Pairing Failed', 'Pairing failed: ' + (data.error || 'Invalid 10-character passcode'));
        setConnectionState('unpaired');
      }
    } catch (err) {
      showAlert('Connection Failed', 'Could not connect to Host PC at ' + hostUrl + ': ' + err.message + '\n\nMake sure your phone and PC are connected to the same hotspot network.');
      setConnectionState('unpaired');
    }
  };

  const handleDisconnectMobile = () => {
    showConfirm(
      'Disconnect from PC Host?',
      'Disconnect from PC host and clear pairing state?',
      () => {
        localStorage.removeItem(PAIRING_STORAGE_KEY);
        setPairingData(null);
        setHostPingInfo(null);
        setConnectionState('unpaired');
        setSelectedAnime(null);
        setActiveEpisode(null);
      },
      { isDanger: true, confirmText: 'Disconnect' }
    );
  };

  // ─── CAMERA & IMAGE FILE QR SCANNER ───────────────────────────────────────
  const startCameraScanner = async () => {
    setScannerOpen(true);
    setScannerError('');

    // Dynamically import html5-qrcode
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      
      // Short delay to ensure container element `#qr-reader` is mounted
      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode('qr-reader');
          html5QrCodeRef.current = scanner;

          await scanner.start(
            { facingMode: 'environment' }, // Rear camera
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              // Successfully decoded QR code text
              stopCameraScanner();

              // Parse payload or URL
              try {
                if (decodedText.startsWith('http')) {
                  const urlObj = new URL(decodedText);
                  const token = urlObj.searchParams.get('token');
                  const host = urlObj.searchParams.get('host') || urlObj.origin;
                  if (token) {
                    executePairing(token, host);
                    return;
                  }
                }
                const parsed = JSON.parse(decodedText);
                if (parsed.pairingToken && parsed.hostUrl) {
                  executePairing(parsed.pairingToken, parsed.hostUrl);
                  return;
                }
              } catch {
                showAlert('Invalid QR Format', 'Invalid QR code format. Please scan the QR code displayed on WatchAnime Stream Host.');
              }
            },
            () => {} // Ignore scan frame failures
          );
        } catch (err) {
          const errText = err?.message || err?.name || String(err || '');
          // Handle HTTP non-secure origin restriction or camera permission error
          if (
            errText.includes('NotAllowedError') ||
            errText.includes('Permission') ||
            errText.includes('undefined') ||
            (typeof window !== 'undefined' && !window.isSecureContext)
          ) {
            setScannerError(
              'Live camera stream access is restricted by your mobile browser over HTTP network IP.\n\n' +
              'You can select / take a photo of the QR code using the button below.'
            );
          } else {
            setScannerError('Could not access live camera: ' + (errText || 'Permission denied or unsupported browser policy'));
          }
        }
      }, 300);
    } catch (err) {
      setScannerError('Failed to load scanner library: ' + (err?.message || String(err)));
    }
  };

  const handleFileUploadScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const tempScanner = new Html5Qrcode('qr-reader-file-temp', false);
      const decodedText = await tempScanner.scanFile(file, true);

      if (decodedText) {
        stopCameraScanner();
        if (decodedText.startsWith('http')) {
          const urlObj = new URL(decodedText);
          const token = urlObj.searchParams.get('token');
          const host = urlObj.searchParams.get('host') || urlObj.origin;
          if (token) {
            executePairing(token, host);
            return;
          }
        }
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed.pairingToken && parsed.hostUrl) {
            executePairing(parsed.pairingToken, parsed.hostUrl);
            return;
          }
        } catch {}
      }
    } catch (err) {
      setScannerError('Could not read QR code from the selected image file. Make sure the QR code image is clear and visible.');
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setScannerOpen(false);
  };

  const handlePlayerPrefChange = (pref) => {
    setPlayerPref(pref);
    localStorage.setItem(PLAYER_PREF_KEY, pref);
  };

  // ─── ACTIVE FULLSCREEN PLAYER ─────────────────────────────────────────────
  if (activeEpisode && selectedAnime) {
    const videoStreamUrl = `${pairingData?.hostUrl || ''}/api/video/stream?path=${encodeURIComponent(activeEpisode.filePath)}`;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
        {/* Top Floating Control Bar */}
        <div className="absolute top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
          <button
            onClick={() => setActiveEpisode(null)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full glass-chip text-white text-xs font-semibold hover:bg-white/20 transition"
          >
            <ArrowLeft size={16} /> Back to Episodes
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-300">Player:</span>
            <div className="flex bg-black/60 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => handlePlayerPrefChange('artplayer')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${playerPref === 'artplayer' ? 'bg-[#7c5cff] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                ArtPlayer
              </button>
              <button
                onClick={() => handlePlayerPrefChange('html5')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${playerPref === 'html5' ? 'bg-[#7c5cff] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                HTML5
              </button>
            </div>
          </div>
        </div>

        {/* Video Player Rendering */}
        <div className="w-full h-full flex items-center justify-center pt-14 pb-4 px-2">
          {playerPref === 'artplayer' ? (
            <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl">
              <ArtPlayerContainer
                animeId={selectedAnime.id}
                episodeId={activeEpisode.id}
                episodes={episodesList}
                onBack={() => setActiveEpisode(null)}
              />
            </div>
          ) : (
            <div className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden glass-panel border border-[#7c5cff]/30 shadow-2xl relative">
              <video
                src={videoStreamUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white px-4 md:px-8 py-6 max-w-6xl mx-auto flex flex-col gap-6">
      
      {/* ── HEADER NAVIGATION ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl glass-chip hover:bg-white/10 text-gray-300 hover:text-white transition"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-[#7c5cff] to-[#a855f7] shadow-lg shadow-[#7c5cff]/30">
            <Wifi size={24} className="text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-purple-200">
              Local Hotspot Stream
            </h1>
            <p className="text-xs text-gray-400">
              Private local video streaming from PC SSD over mobile hotspot
            </p>
          </div>
        </div>

        {/* MODE TABS TOGGLE */}
        <div className="flex items-center p-1.5 rounded-2xl glass-panel border border-white/10 self-start md:self-auto">
          <button
            onClick={() => setActiveMode('host')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
              activeMode === 'host'
                ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-lg shadow-[#7c5cff]/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Laptop size={16} /> Stream Host (PC)
          </button>
          <button
            onClick={() => setActiveMode('show')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
              activeMode === 'show'
                ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-lg shadow-[#7c5cff]/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone size={16} /> Show Stream (Mobile)
          </button>
        </div>
      </div>

      {/* ── MODE 1: STREAM HOST MODE (PC) ────────────────────────────────── */}
      {activeMode === 'host' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Left Column: QR Code & Start/Stop Controls */}
          <div className="lg:col-span-6 flex flex-col gap-5 glass-panel p-6 rounded-3xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-widest text-[#a855f7]">
                  Host Server Control
                </span>
              </div>
              
              {/* Online/Offline Status Badge */}
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                hostOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                <span className={`w-2 h-2 rounded-full ${hostOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                {hostOnline ? 'Host Online' : 'Host Offline'}
              </div>
            </div>

            {!hostOnline ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Power size={36} className="text-gray-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Start Stream Host on PC</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    Click Start Stream to generate a secure pairing QR code and activate local hotspot video endpoint.
                  </p>
                </div>
                <button
                  onClick={handleStartHost}
                  disabled={startingHost}
                  className="btn-accent px-8 py-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-[#7c5cff]/30 mt-2"
                >
                  {startingHost ? (
                    <>Starting Host Server...</>
                  ) : (
                    <>
                      <Power size={18} /> Start Stream Host
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 py-2">
                {/* QR Code Container */}
                <div className="p-4 bg-white rounded-3xl shadow-2xl shadow-purple-900/40 border-4 border-[#7c5cff]/50 relative group">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Stream Pairing QR Code" className="w-64 h-64 object-contain" />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center text-gray-800 text-xs">
                      Generating QR Code...
                    </div>
                  )}
                </div>

                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                    <QrCode size={16} className="text-[#a855f7]" /> Option 1: Scan QR Code
                  </p>
                  <p className="text-xs text-gray-400">
                    Open Show Stream on your mobile phone and scan this code to pair.
                  </p>
                </div>

                {/* 10-Character Capital Passcode Display Box */}
                {hostSession?.passcode && (
                  <div className="w-full bg-[#7c5cff]/10 p-4 rounded-2xl border border-[#7c5cff]/30 text-center space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-gray-300 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                        <KeyRound size={14} className="text-[#a855f7]" /> Option 2: 10-Letter Passcode
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(hostSession.passcode);
                          setPasscodeCopied(true);
                          setTimeout(() => setPasscodeCopied(false), 2000);
                        }}
                        className="text-[11px] font-semibold text-[#a855f7] hover:text-white transition flex items-center gap-1"
                      >
                        {passcodeCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {passcodeCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                      {hostSession.passcode.split('').map((char, idx) => (
                        <span
                          key={idx}
                          className="w-6 h-8 sm:w-8 sm:h-10 rounded-lg bg-black/60 border border-[#7c5cff]/40 font-mono font-extrabold text-xs sm:text-base text-neonCyan flex items-center justify-center shadow-inner"
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Hotspot URL Box */}
                <div className="w-full bg-black/40 p-3.5 rounded-2xl border border-white/10 flex items-center justify-between text-xs">
                  <div className="truncate pr-2">
                    <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">Hotspot Host Address</span>
                    <span className="text-neonCyan font-mono font-bold truncate">
                      {hostNetInfo?.baseUrl || `http://${hostSession?.hostIp}:${hostSession?.port}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setAddressQrModalOpen(true)}
                      className="p-2 rounded-xl glass-chip hover:bg-white/20 text-gray-300 hover:text-white transition"
                      title="Show Address QR Code"
                    >
                      <QrCode size={16} />
                    </button>
                    <button
                      onClick={copyHostUrl}
                      className="p-2 rounded-xl glass-chip hover:bg-white/20 text-gray-300 hover:text-white transition"
                      title="Copy URL"
                    >
                      {hostCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Stop Host Button */}
                <button
                  onClick={handleStopHost}
                  className="w-full py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-bold text-xs transition flex items-center justify-center gap-2"
                >
                  <Power size={16} /> Disconnect Host Server
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Active Devices & Session Metadata */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            {/* Host Details Card */}
            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <HardDrive size={18} className="text-[#7c5cff]" /> Local Network Environment
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Local IP Address</span>
                  <span className="text-white font-mono font-bold">{hostSession?.hostIp || hostNetInfo?.primaryIp || '127.0.0.1'}</span>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Port Number</span>
                  <span className="text-white font-mono font-bold">{hostSession?.port || hostNetInfo?.port || 3000}</span>
                </div>
              </div>

              {hostNetInfo?.addresses && hostNetInfo.addresses.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] text-gray-400 font-medium">Detected Network Interfaces:</span>
                  <div className="space-y-1 max-h-28 overflow-y-auto no-scrollbar">
                    {hostNetInfo.addresses.map((net, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-xl bg-black/30 border border-white/5">
                        <span className="text-gray-300 truncate max-w-[160px]">{net.interface}</span>
                        <span className="text-purple-300 font-mono font-semibold">{net.address}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Paired Devices List */}
            <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <SmartphoneNfc size={18} className="text-emerald-400" /> Paired Mobile Devices
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshDevices}
                    disabled={refreshingDevices}
                    className="p-1.5 rounded-xl glass-chip hover:bg-white/20 text-gray-300 hover:text-white transition"
                    title="Refresh Paired Devices List"
                  >
                    <RefreshCw size={14} className={refreshingDevices ? 'animate-spin text-[#7c5cff]' : ''} />
                  </button>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-bold">
                    {hostSession?.pairedDevicesCount || 0}
                  </span>
                </div>
              </div>

              {(!hostSession?.pairedDevices || hostSession.pairedDevices.length === 0) ? (
                <div className="text-center py-8 text-gray-400 text-xs space-y-2">
                  <Smartphone size={32} className="mx-auto text-gray-600" />
                  <p>No mobile devices paired yet.</p>
                  <p className="text-[11px] text-gray-500">Scan the QR code from your mobile phone to connect.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto no-scrollbar">
                  {hostSession.pairedDevices.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Smartphone size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{device.deviceName}</p>
                          <p className="text-[10px] text-gray-400">
                            Paired: {new Date(device.pairedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevokeDevice(device.deviceId)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition border border-rose-500/20"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── MODE 2: SHOW STREAM MODE (MOBILE) ────────────────────────────── */}
      {activeMode === 'show' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Status Bar Banner */}
          <div className="glass-panel p-5 rounded-3xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {connectionState === 'connected' ? (
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 size={24} />
                </div>
) : connectionState === 'host_offline' ? (
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <AlertTriangle size={24} />
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <QrCode size={24} />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    {connectionState === 'connected' ? 'Connected to Stream Host' :
                     connectionState === 'host_offline' ? 'Host PC Offline / Unreachable' :
                     connectionState === 'disconnected' ? 'Pairing Disconnected' : 'Mobile Stream Pairing'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {connectionState === 'connected'
                    ? `Paired with ${pairingData?.hostUrl || 'PC Host'} over local hotspot`
                    : connectionState === 'host_offline'
                    ? 'Check if PC Stream Host is running and both devices are on the hotspot network'
                    : 'Scan QR code from PC Stream Host to pair'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {connectionState === 'connected' ? (
                <>
                  <button
                    onClick={() => checkHostPing(pairingData?.token, pairingData?.hostUrl, pairingData?.deviceId)}
                    disabled={pinging}
                    className="p-2.5 rounded-xl glass-chip text-gray-300 hover:text-white transition"
                    title="Refresh Ping"
                  >
                    <RefreshCw size={16} className={pinging ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={handleDisconnectMobile}
                    className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={startCameraScanner}
                    className="btn-accent px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#7c5cff]/30"
                  >
                    <Camera size={15} /> Scan QR
                  </button>
                  <button
                    onClick={() => {
                      setInputHostUrl(hostNetInfo?.baseUrl || (hostSession ? `http://${hostSession.hostIp}:${hostSession.port}` : ''));
                      setPasscodeModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl glass-chip hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 border border-white/20 transition"
                  >
                    <KeyRound size={15} className="text-[#a855f7]" /> Enter Passcode
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* PAIRED STATE: MOBILE STREAMING ACTIVE */}
          {connectionState === 'connected' ? (
            <div className="space-y-6">
              {/* Player Preference Selector Bar */}
              <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-bold text-gray-300 flex items-center gap-2">
                  <Settings2 size={16} className="text-[#a855f7]" /> Mobile Video Player:
                </span>
                <div className="flex bg-black/50 p-1 rounded-xl border border-white/10 text-xs">
                  <button
                    onClick={() => handlePlayerPrefChange('artplayer')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      playerPref === 'artplayer'
                        ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ArtPlayer
                  </button>
                  <button
                    onClick={() => handlePlayerPrefChange('videojs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      playerPref === 'videojs'
                        ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Video.js
                  </button>
                  <button
                    onClick={() => handlePlayerPrefChange('html5')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      playerPref === 'html5'
                        ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    HTML5 (Native)
                  </button>
                </div>
              </div>

              {/* Paired Status Card & Browse CTA */}
              <div className="glass-panel p-8 rounded-3xl border border-emerald-500/20 text-center flex flex-col items-center gap-5 shadow-2xl">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 size={40} className="text-emerald-400" />
                </div>

                <div className="max-w-md space-y-2">
                  <h3 className="text-xl font-extrabold text-white">Mobile Streaming Active & Paired</h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Your mobile device is connected to your PC Stream Host over local hotspot. You can now select and stream any episode directly from your main Anime Tracker library!
                  </p>
                </div>

                <button
                  onClick={onBack}
                  className="btn-accent px-8 py-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl shadow-[#7c5cff]/40 cursor-pointer"
                >
                  <Film size={18} /> Open Anime Tracker Library
                </button>
              </div>
            </div>
          ) : (
            /* UNPAIRED / HOST OFFLINE STATE */
            <div className="glass-panel p-8 rounded-3xl border border-white/10 text-center flex flex-col items-center gap-5 my-6">
              <div className="w-20 h-20 rounded-full bg-[#7c5cff]/10 border border-[#7c5cff]/30 flex items-center justify-center">
                <QrCode size={36} className="text-[#a855f7]" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-lg font-bold text-white">Scan QR Code on PC Host</h3>
                <p className="text-xs text-gray-400">
                  Open WatchAnime on your PC, click "Start Stream Host", and scan the displayed QR code with your phone camera.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-1">
                <button
                  onClick={startCameraScanner}
                  className="btn-accent px-7 py-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-[#7c5cff]/40"
                >
                  <Camera size={18} /> Open Camera Scanner
                </button>
                <button
                  onClick={() => {
                    setInputHostUrl(hostNetInfo?.baseUrl || (hostSession ? `http://${hostSession.hostIp}:${hostSession.port}` : ''));
                    setPasscodeModalOpen(true);
                  }}
                  className="px-7 py-3.5 rounded-2xl glass-chip hover:bg-white/20 text-white text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 border border-white/20 transition"
                >
                  <KeyRound size={18} className="text-[#a855f7]" /> Enter 10-Letter Passcode
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── CAMERA SCANNER MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {scannerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 relative">
              <button
                onClick={stopCameraScanner}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-gray-300 hover:text-white transition"
              >
                <XCircle size={20} />
              </button>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                  <Camera size={18} className="text-[#a855f7]" /> Camera QR Scanner
                </h3>
                <p className="text-[11px] text-gray-400">
                  Align the Stream Host QR code within the frame
                </p>
              </div>

              {/* QR Reader Box */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden border-2 border-[#7c5cff] bg-black relative shadow-inner">
                <div id="qr-reader" className="w-full h-full" />
              </div>

              {scannerError && (
                <p className="text-xs text-rose-400 text-center font-medium bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 whitespace-pre-line">
                  {scannerError}
                </p>
              )}

              {/* Photo / Image File Scan Fallback Button */}
              <div className="w-full flex flex-col items-center gap-2 pt-2 border-t border-white/10">
                <span className="text-[11px] text-gray-400 font-medium">Or select / take a photo of the QR code:</span>
                <label className="w-full py-2.5 rounded-xl bg-[#7c5cff]/20 hover:bg-[#7c5cff]/30 text-[#a855f7] border border-[#7c5cff]/40 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer">
                  <ImagePlus size={16} /> Choose Photo of QR Code
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUploadScan}
                    className="hidden"
                  />
                </label>
                <div id="qr-reader-file-temp" className="hidden" />
              </div>

              <button
                onClick={stopCameraScanner}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
              >
                Cancel Scanner
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HOST ADDRESS QR CODE MODAL ───────────────────────────────────── */}
      <AnimatePresence>
        {addressQrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 relative">
              <button
                onClick={() => setAddressQrModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-gray-300 hover:text-white transition"
              >
                <XCircle size={20} />
              </button>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                  <QrCode size={18} className="text-[#a855f7]" /> Host Address QR Code
                </h3>
                <p className="text-[11px] text-gray-400">
                  Scan to open the host page directly on your phone
                </p>
              </div>

              {/* QR Image Box */}
              <div className="p-4 bg-white rounded-3xl border border-[#7c5cff]/30 shadow-2xl flex items-center justify-center aspect-square w-full max-w-[280px]">
                {addressQrDataUrl ? (
                  <img src={addressQrDataUrl} alt="Host Address QR" className="w-full h-full object-contain" />
                ) : (
                  <p className="text-xs text-gray-800 font-medium">Generating QR...</p>
                )}
              </div>

              {/* Host URL Info */}
              <div className="w-full bg-black/40 p-3 rounded-xl border border-white/15 text-center">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Address URL</span>
                <span className="text-neonCyan text-xs font-mono font-bold break-all">
                  {hostNetInfo?.baseUrl || (hostSession ? `http://${hostSession.hostIp}:${hostSession.port}` : '')}
                </span>
              </div>

              <button
                onClick={() => setAddressQrModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
              >
                Close Modal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PASSCODE PAIRING MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {passcodeModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 relative shadow-2xl"
            >
              <button
                onClick={() => setPasscodeModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-gray-300 hover:text-white transition"
              >
                <XCircle size={20} />
              </button>

              <div className="p-3.5 rounded-2xl bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/30">
                <KeyRound size={28} />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-white">Enter 10-Character Passcode</h3>
                <p className="text-xs text-gray-400">
                  Enter the 10-capital letter passcode displayed on your PC Stream Host screen
                </p>
              </div>

              <div className="w-full space-y-3 pt-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    Host Server IP / Address
                  </label>
                  <input
                    type="text"
                    value={inputHostUrl}
                    onChange={(e) => setInputHostUrl(e.target.value)}
                    placeholder="e.g. http://192.168.43.52:3000"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                    10-Character Passcode
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value.toUpperCase())}
                    placeholder="e.g. X8K9P2M4Q7"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm font-mono tracking-widest text-center font-bold uppercase text-neonCyan"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 w-full pt-2">
                <button
                  onClick={() => setPasscodeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasscodeSubmit}
                  className="flex-1 py-2.5 rounded-xl btn-accent font-bold text-xs transition shadow-lg flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={16} /> Pair Device
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CUSTOM ALERT / CONFIRMATION MODAL ─────────────────────────── */}
      <AnimatePresence>
        {modalConfig && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/20 flex flex-col items-center text-center gap-4 relative shadow-2xl"
            >
              <div className={`p-3.5 rounded-2xl border ${
                modalConfig.isDanger
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-[#7c5cff]/20 text-[#a855f7] border-[#7c5cff]/30'
              }`}>
                {modalConfig.isDanger ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">{modalConfig.title}</h3>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{modalConfig.message}</p>
              </div>

              <div className="flex items-center gap-3 w-full mt-2">
                {modalConfig.type === 'confirm' && (
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-xs transition"
                  >
                    {modalConfig.cancelText || 'Cancel'}
                  </button>
                )}
                <button
                  onClick={() => {
                    const cb = modalConfig.onConfirm;
                    closeModal();
                    if (cb) cb();
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition shadow-lg ${
                    modalConfig.isDanger
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                      : 'btn-accent'
                  }`}
                >
                  {modalConfig.confirmText || 'OK'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
