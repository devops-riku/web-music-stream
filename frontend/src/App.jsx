import { useState, useEffect, useRef } from 'react';
import {
  AppShell,
  Burger,
  Group,
  UnstyledButton,
  Text,
  TextInput,
  Button,
  Card,
  Image,
  Slider,
  Avatar,
  Badge,
  Grid,
  Stack,
  Loader,
  Paper,
  ActionIcon,
  Tooltip,
  Alert,
  Modal,
  Popover,
  Indicator,
  Progress,
  Box,
  Textarea,
  PasswordInput,
  Divider,
  FileButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSearch,
  IconHeart,
  IconHeartFilled,
  IconPlayerPlay,
  IconPlayerPause,
  IconDevices,
  IconVolume,
  IconBrandSpotify,
  IconUser,
  IconLogout,
  IconMusic,
  IconAlertCircle,
  IconCircleCheck,
  IconSettings,
  IconBell,
  IconPlus,
  IconPlayerSkipForward,
  IconPlayerSkipBack,
  IconArrowsShuffle,
  IconRepeat,
  IconMicrophone,
  IconListNumbers,
  IconMaximize,
  IconMinimize,
  IconMessage,
  IconSend,
  IconChevronLeft,
} from '@tabler/icons-react';
import './App.css';

const BACKEND_API = import.meta.env.VITE_BACKEND_API || 'http://localhost:8000';
const BACKEND_WS = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:8000';
// Backend stores naive UTC datetimes — append Z so JS parses as UTC, then convert to PH time
const fmtTime = (ts) => {
  const d = new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z');
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
};

const ALBUM_ART_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%231a1a2e' rx='8'/%3E%3Ctext x='100' y='125' font-size='90' text-anchor='middle' fill='%237c3aed'%3E%E2%99%AA%3C/text%3E%3C/svg%3E";

function TotalUnreadBadge({ counts }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (!total) return null;
  return (
    <div style={{
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: '#7c3aed',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 5px',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {total > 99 ? '99+' : total}
      </span>
    </div>
  );
}

function App() {
  // Mobile / Desktop navigation controllers
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [authModalOpened, { open: openAuthModal, close: closeAuthModal }] = useDisclosure(false);

  // Auth State
  const [accessToken, setAccessToken] = useState(localStorage.getItem('Rikupy_token') || null);
  const [userProfile, setUserProfile] = useState(null);

  // Auth Form State
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Application View Tabs
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [likedTracks, setLikedTracks] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [shuffleActive, setShuffleActive] = useState(false);
  const [repeatActive, setRepeatActive] = useState(false);

  // Loading States & Messages
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const SEARCH_PAGE_SIZE = 20;
  const [playbackMessage, setPlaybackMessage] = useState(null);

  // Playback States
  const [currentTrack, setCurrentTrack] = useState(null);
  const [activeQueue, setActiveQueue] = useState([]); // the list currently being played from
  const [homeTracks, setHomeTracks] = useState([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLocalPreview, setIsLocalPreview] = useState(true);
  const [volume, setVolume] = useState(70);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Messaging State
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null); // username string
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newChatUsername, setNewChatUsername] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});   // { [username]: bool }
  const [readBy, setReadBy] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);

  // Settings
  const [settingsData, setSettingsData] = useState(null);   // loaded from API
  const [settingsSource, setSettingsSource] = useState('soundcloud');
  const [settingsYtFormat, setSettingsYtFormat] = useState('bestaudio/best');
  const [settingsCookies, setSettingsCookies] = useState(null);    // null = not changed
  const [settingsSpotifyId, setSettingsSpotifyId] = useState('');
  const [settingsSpotifySecret, setSettingsSpotifySecret] = useState(null); // null = not changed
  const [savingSettings, setSavingSettings] = useState(false);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const [remoteTyping, setRemoteTyping] = useState(false);

  // Jam Session State
  const [jamRoom, setJamRoom] = useState(null);
  const [isJamHost, setIsJamHost] = useState(false);
  const [jamMemberCount, setJamMemberCount] = useState(0);
  const [jamLinkCopied, setJamLinkCopied] = useState(false);
  const [joiningJam, setJoiningJam] = useState(false);
  const [jamJoinInput, setJamJoinInput] = useState('');
  const [showJamJoin, setShowJamJoin] = useState(false);
  const [jamNeedsPlay, setJamNeedsPlay] = useState(false);
  const jamWsRef = useRef(null);
  const isJamHostRef = useRef(false);
  const jamRoomIdRef = useRef(null);
  const handleJamMessageRef = useRef(null);
  const jamSyncIntervalRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Audio elements (local previews)
  const audioRef = useRef(null);
  const currentTrackRef = useRef(null);
  const activeQueueRef = useRef([]);
  const shuffleActiveRef = useRef(false);
  const repeatActiveRef = useRef(false);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { activeQueueRef.current = activeQueue; }, [activeQueue]);
  useEffect(() => { shuffleActiveRef.current = shuffleActive; }, [shuffleActive]);
  useEffect(() => { repeatActiveRef.current = repeatActive; }, [repeatActive]);
  useEffect(() => { isJamHostRef.current = isJamHost; }, [isJamHost]);
  useEffect(() => { jamRoomIdRef.current = jamRoom?.room_id || null; }, [jamRoom]);
  // Keep handleJamMessageRef always pointing to the latest closure (avoids stale captures in WebSocket)
  useEffect(() => { handleJamMessageRef.current = handleJamMessage; });

  // Host broadcasts position every 2s so guests stay in sync
  useEffect(() => {
    if (!isJamHost || !jamRoom) {
      clearInterval(jamSyncIntervalRef.current);
      return;
    }
    jamSyncIntervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused && jamWsRef.current?.readyState === WebSocket.OPEN) {
        jamWsRef.current.send(JSON.stringify({
          type: 'sync',
          position_ms: Math.floor(audioRef.current.currentTime * 1000),
        }));
      }
    }, 2000);
    return () => clearInterval(jamSyncIntervalRef.current);
  }, [isJamHost, jamRoom]);

  // 1. Load profile on mount if token exists
  useEffect(() => {
    if (accessToken) {
      fetchUserProfile();
    }
  }, [accessToken]);

  // Fetch local DB user profile
  const fetchUserProfile = async () => {
    try {
      const res = await fetch(`${BACKEND_API}/api/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.status === 401) {
        handleLogout();
      } else {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error('Error fetching user profile', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('Rikupy_token');
    setAccessToken(null);
    setUserProfile(null);
    setLikedTracks([]);
  };

  const handleAuthSubmit = async () => {
    setAuthError('');
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Username and password are required.');
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login'
        ? { username: authUsername.trim(), password: authPassword }
        : { username: authUsername.trim(), password: authPassword, display_name: authDisplayName.trim() };

      const res = await fetch(`${BACKEND_API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.detail || 'Authentication failed.');
        return;
      }

      localStorage.setItem('Rikupy_token', data.access_token);
      setAccessToken(data.access_token);
      setUserProfile(data.user);
      closeAuthModal();
      setAuthUsername('');
      setAuthPassword('');
      setAuthDisplayName('');
    } catch (err) {
      setAuthError('Could not connect to server.');
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Fetch Liked Tracks (Local SQLite DB)
  const fetchLikedTracks = async () => {
    setLoadingLikes(true);
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch(`${BACKEND_API}/api/tracks/likes`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLikedTracks(data);
      }
    } catch (err) {
      console.error('Error loading likes', err);
    } finally {
      setLoadingLikes(false);
    }
  };

  useEffect(() => {
    fetchLikedTracks();
  }, [activeTab, accessToken]);

  const fetchHomeTracks = async () => {
    try {
      const res = await fetch(`${BACKEND_API}/api/home`);
      if (res.ok) {
        const data = await res.json();
        setHomeTracks(data);
      }
    } catch (err) {
      console.error('Error loading home tracks', err);
    } finally {
      setLoadingHome(false);
    }
  };

  useEffect(() => {
    fetchHomeTracks();
  }, []);


  // 3. Fetch Spotify Devices (Disabled since no Spotify)
  const fetchDevices = async () => {
    setDevices([]);
  };

  // Messaging helpers
  const fetchConversations = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${BACKEND_API}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        const counts = {};
        data.forEach(c => { counts[c.other_username] = c.unread_count || 0; });
        setUnreadCounts(counts);
      }
    } catch (err) {
      console.error('Error loading conversations', err);
    }
  };

  // ── Jam helpers ──────────────────────────────────────────────────────────────
  const sendJamEvent = (type, extra = {}) => {
    if (jamWsRef.current?.readyState === WebSocket.OPEN && isJamHostRef.current) {
      jamWsRef.current.send(JSON.stringify({ type, ...extra }));
    }
  };

  const connectJamWs = (roomId) => {
    jamWsRef.current?.close();
    let jamRetryDelay = 1000;
    let jamRetryTimer = null;

    const connect = () => {
      if (!jamRoomIdRef.current) return; // room gone, stop retrying
      const ws = new WebSocket(`${BACKEND_WS}/ws/jam/${roomId}?token=${accessToken}`);

      ws.onopen = () => {
        jamWsRef.current = ws;
        jamRetryDelay = 1000;
      };
      ws.onmessage = (e) => {
        try { handleJamMessageRef.current?.(JSON.parse(e.data)); } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = (e) => {
        jamWsRef.current = null;
        // 4001 = auth failed, 4004 = room not found — don't retry
        if (jamRoomIdRef.current && e.code !== 4001 && e.code !== 4004) {
          jamRetryTimer = setTimeout(() => {
            jamRetryDelay = Math.min(jamRetryDelay * 2, 15000);
            connect();
          }, jamRetryDelay);
        } else {
          setJamRoom(null);
          setIsJamHost(false);
        }
      };
    };

    connect();
    return () => clearTimeout(jamRetryTimer);
  };

  const handleJamMessage = (msg) => {
    if (msg.type === 'jam_state') {
      setJamRoom(msg.room);
      setIsJamHost(msg.is_host);
      isJamHostRef.current = msg.is_host;
      setJamMemberCount(msg.member_count);
      if (!msg.is_host && msg.room.track) {
        setJamNeedsPlay(true);
        playTrack(msg.room.track, msg.position_ms || 0);
      }
    } else if (msg.type === 'member_update') {
      setJamMemberCount(msg.member_count);
    } else if (msg.type === 'track_change') {
      if (!isJamHostRef.current) {
        setJamNeedsPlay(true);
        playTrack(msg.track, 0);
      }
    } else if (msg.type === 'play') {
      if (!isJamHostRef.current && audioRef.current) {
        if (msg.position_ms != null) audioRef.current.currentTime = msg.position_ms / 1000;
        audioRef.current.play()
          .then(() => { setIsPlaying(true); setJamNeedsPlay(false); })
          .catch(() => { setJamNeedsPlay(true); });
      }
    } else if (msg.type === 'pause') {
      if (!isJamHostRef.current && audioRef.current) {
        if (msg.position_ms != null) audioRef.current.currentTime = msg.position_ms / 1000;
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else if (msg.type === 'seek') {
      if (!isJamHostRef.current && audioRef.current) {
        audioRef.current.currentTime = (msg.position_ms || 0) / 1000;
      }
    } else if (msg.type === 'sync') {
      // Drift correction: if guest is >1s off from host, re-sync
      if (!isJamHostRef.current && audioRef.current && !audioRef.current.paused) {
        const hostPos = (msg.position_ms || 0) / 1000;
        const drift = Math.abs(audioRef.current.currentTime - hostPos);
        if (drift > 1.0) {
          audioRef.current.currentTime = hostPos + 0.15; // +150ms to compensate network latency
        }
      }
    } else if (msg.type === 'jam_ended') {
      leaveJam(false);
      setJamNeedsPlay(false);
      setPlaybackMessage({ type: 'info', text: 'The jam session has ended.' });
    }
  };

  const startJam = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${BACKEND_API}/api/jam`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const room = await res.json();
        setJamRoom(room);
        setIsJamHost(true);
        isJamHostRef.current = true;
        setJamMemberCount(1);
        connectJamWs(room.room_id);
      }
    } catch {}
  };

  const joinJam = async (roomId) => {
    if (!accessToken || !roomId.trim()) return;
    setJoiningJam(true);
    try {
      const res = await fetch(`${BACKEND_API}/api/jam/${roomId.trim()}`);
      if (!res.ok) { setPlaybackMessage({ type: 'error', text: 'Jam room not found.' }); return; }
      const room = await res.json();
      setJamRoom(room);
      setIsJamHost(false);
      isJamHostRef.current = false;
      setShowJamJoin(false);
      setJamJoinInput('');
      connectJamWs(room.room_id);
    } catch {
      setPlaybackMessage({ type: 'error', text: 'Could not join jam room.' });
    } finally {
      setJoiningJam(false);
    }
  };

  const leaveJam = async (notify = true) => {
    if (notify && isJamHost && jamRoom) {
      await fetch(`${BACKEND_API}/api/jam/${jamRoom.room_id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(() => {});
    }
    clearInterval(jamSyncIntervalRef.current);
    jamWsRef.current?.close();
    jamWsRef.current = null;
    setJamRoom(null);
    setIsJamHost(false);
    isJamHostRef.current = false;
    setJamMemberCount(0);
    setJamNeedsPlay(false);
  };

  // Check URL for ?jam= on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jamCode = params.get('jam');
    if (jamCode && accessToken) joinJam(jamCode);
  }, [accessToken]);

  // WebSocket: connect when logged in, reconnect with exponential backoff on drop
  useEffect(() => {
    if (!accessToken) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let cancelled = false;
    let retryDelay = 1000;
    let retryTimer = null;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(`${BACKEND_WS}/ws/messages?token=${accessToken}`);

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        wsRef.current = ws;
        retryDelay = 1000;
        setWsConnected(true);
      };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'new_message') {
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            setRemoteTyping(false);
            fetchConversations();
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            // If they replied, they clearly saw our last message
            setReadBy(prev => ({ ...prev, [msg.sender_username]: true }));
          } else if (msg.type === 'typing') {
            setRemoteTyping(true);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setRemoteTyping(false), 3000);
          } else if (msg.type === 'messages_read') {
            setReadBy(prev => ({ ...prev, [msg.reader_username]: true }));
          } else if (msg.type === 'user_status') {
            setOnlineUsers(prev => ({ ...prev, [msg.username]: msg.online }));
          } else if (msg.type === 'unread_update') {
            setUnreadCounts(prev => ({ ...prev, [msg.sender_username]: msg.count }));
          }
        } catch {}
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
        if (!cancelled) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000);
            connect();
          }, retryDelay);
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [accessToken]);

  const openConversation = async (username) => {
    setReplyingTo(null);
    setLoadingMessages(true);
    try {
      const res = await fetch(`${BACKEND_API}/api/messages/${username}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.status === 404) {
        setPlaybackMessage({ type: 'error', text: `User "@${username}" not found.` });
        return;
      }
      if (res.ok) {
        setActiveConversation(username);
        setMessages(await res.json());
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        // Tell the other user their messages have been read
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'mark_read', sender_username: username }));
        }
        setUnreadCounts(prev => ({ ...prev, [username]: 0 }));
        // Restore read receipt state from server
        fetch(`${BACKEND_API}/api/messages/${username}/read-state`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then(r => r.json())
          .then(d => {
            if (d.partner_has_read) setReadBy(prev => ({ ...prev, [username]: true }));
          })
          .catch(() => {});
        // Fetch initial online status
        fetch(`${BACKEND_API}/api/users/${username}/online`)
          .then(r => r.json())
          .then(d => setOnlineUsers(prev => ({ ...prev, [username]: d.online })))
          .catch(() => {});
      }
    } catch (err) {
      console.error('Error loading messages', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || sendingMessage) return;
    setSendingMessage(true);
    const content = newMessage.trim();
    const replyId = replyingTo?.id ?? null;
    setNewMessage('');
    setReplyingTo(null);
    try {
      const res = await fetch(`${BACKEND_API}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ recipient_username: activeConversation, content, reply_to_id: replyId })
      });
      if (!res.ok) {
        const err = await res.json();
        setNewMessage(content);
        setReplyingTo(replyingTo);
        setPlaybackMessage({ type: 'error', text: err.detail || 'Failed to send message.' });
      }
      // WS echo from backend will append the message via onmessage handler
    } finally {
      setSendingMessage(false);
    }
  };

  const loadSettings = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${BACKEND_API}/api/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const d = await res.json();
        setSettingsData(d);
        setSettingsSource(d.music_source);
        setSettingsYtFormat(d.yt_format);
        setSettingsSpotifyId(d.spotify_client_id || '');
        setSettingsCookies(null);
        setSettingsSpotifySecret(null);
      }
    } catch {}
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch(`${BACKEND_API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          music_source: settingsSource,
          yt_format: settingsYtFormat || 'bestaudio/best',
          yt_cookies: settingsCookies,
          yt_cookies_changed: settingsCookies !== null,
          spotify_client_id: settingsSpotifyId || null,
          spotify_client_secret: settingsSpotifySecret,
          spotify_secret_changed: settingsSpotifySecret !== null,
        })
      });
      if (res.ok) {
        const d = await res.json();
        setSettingsData(d);
        setSettingsCookies(null);
        setSettingsSpotifySecret(null);
        setPlaybackMessage({ type: 'success', text: 'Settings saved.' });
      } else {
        const err = await res.json();
        setPlaybackMessage({ type: 'error', text: err.detail || 'Failed to save settings.' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const searchUsers = async (q) => {
    if (!q.trim() || !accessToken) { setUserSearchResults([]); return; }
    try {
      const res = await fetch(`${BACKEND_API}/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) setUserSearchResults(await res.json());
    } catch { setUserSearchResults([]); }
  };

  useEffect(() => {
    if (activeTab === 'messages' && accessToken) fetchConversations();
    if (activeTab === 'settings' && accessToken) loadSettings();
  }, [activeTab, accessToken]);

  // 4. Search Handler
  const handleSearch = async (queryToUse, page = 1) => {
    const term = queryToUse || searchQuery;
    if (!term.trim()) return;

    setLoadingSearch(true);
    setPlaybackMessage(null);
    const offset = (page - 1) * SEARCH_PAGE_SIZE;
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch(
        `${BACKEND_API}/api/search?q=${encodeURIComponent(term)}&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setSearchPage(page);
        setSearchHasMore(data.length === SEARCH_PAGE_SIZE);
        setActiveTab('search');
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setLoadingSearch(false);
    }
  };

  // 5. Toggle Like local database
  const toggleLike = async (track) => {
    const isCurrentlyLiked = track.is_liked || likedTracks.some(t => t.track_id === track.track_id);
    const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

    try {
      if (isCurrentlyLiked) {
        const res = await fetch(`${BACKEND_API}/api/tracks/like?track_id=${encodeURIComponent(track.track_id)}`, {
          method: 'DELETE',
          headers: authHeaders
        });
        if (res.ok) {
          setLikedTracks(prev => prev.filter(t => t.track_id !== track.track_id));
          setSearchResults(prev => prev.map(t => t.track_id === track.track_id ? { ...t, is_liked: false } : t));
          if (currentTrack?.track_id === track.track_id) {
            setCurrentTrack(prev => ({ ...prev, is_liked: false }));
          }
        }
      } else {
        const res = await fetch(`${BACKEND_API}/api/tracks/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            track_id: track.track_id,
            name: track.name,
            artist: track.artist,
            album: track.album,
            album_art: track.album_art,
            preview_url: track.preview_url,
            duration_ms: track.duration_ms
          })
        });
        if (res.ok) {
          const newLike = await res.json();
          setLikedTracks(prev => [newLike, ...prev]);
          setSearchResults(prev => prev.map(t => t.track_id === track.track_id ? { ...t, is_liked: true } : t));
          if (currentTrack?.track_id === track.track_id) {
            setCurrentTrack(prev => ({ ...prev, is_liked: true }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle like', err);
    }
  };

  const playTrackFromQueue = async (queue, track) => {
    setActiveQueue(queue);

    // Resolve stream URL first so we can share it with jam guests.
    // SoundCloud CDN URLs are not IP-locked, so all guests can use the same URL.
    if (!track.track_id.startsWith('mock_') && !track.track_id.startsWith('trend_') && !track.track_id.startsWith('hero_')) {
      try {
        const res = await fetch(`${BACKEND_API}/api/player/resolve?id=${encodeURIComponent(track.track_id)}`);
        if (res.ok) {
          const { url } = await res.json();
          if (url) {
            const resolved = { ...track, preview_url: url };
            playLocalPreview(resolved, null, 0);
            setCurrentTrack(resolved);
            sendJamEvent('track_change', { track: resolved });
            return;
          }
        }
      } catch {}
    }

    // Fallback: no pre-resolution (guests will resolve themselves)
    playTrack(track);
    sendJamEvent('track_change', { track });
  };

  const skipTrack = (direction) => {
    if (!currentTrack || activeQueue.length === 0) return;
    const idx = activeQueue.findIndex(t => t.track_id === currentTrack.track_id);
    if (idx === -1) return;
    let next;
    if (shuffleActive) {
      let randIdx;
      do { randIdx = Math.floor(Math.random() * activeQueue.length); } while (randIdx === idx && activeQueue.length > 1);
      next = activeQueue[randIdx];
    } else {
      next = activeQueue[(idx + direction + activeQueue.length) % activeQueue.length];
    }
    if (jamRoom && isJamHostRef.current) {
      playTrackFromQueue(activeQueue, next);
    } else {
      playTrack(next);
    }
  };

  // 6. Play Track
  const playTrack = async (track, startPositionMs = 0) => {
    setPlaybackMessage(null);
    setCurrentTrack(track);

    // Stop active audio
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (track.track_id.startsWith('mock_') || track.track_id.startsWith('trend_') || track.track_id.startsWith('hero_')) {
      playLocalPreview(track, null, startPositionMs);
      return;
    }

    // If preview_url already resolved (e.g. from jam host broadcast), play directly
    if (track.preview_url) {
      playLocalPreview(track, null, startPositionMs);
      return;
    }

    try {
      // 1) Ask backend to resolve a direct audio URL (backend calls Piped/Invidious server-to-server, no CORS)
      const resolveRes = await fetch(
        `${BACKEND_API}/api/player/resolve?id=${encodeURIComponent(track.track_id)}`
      );
      if (resolveRes.ok) {
        const { url } = await resolveRes.json();
        if (url) {
          console.log('[Stream] Resolved via backend');
          playLocalPreview({ ...track, preview_url: url }, null, startPositionMs);
          return;
        }
      }
    } catch (err) {
      console.warn('[Stream] Resolve failed, trying full proxy', err);
    }

    // 2) Fall back to full backend proxy stream (proxies the entire audio through the backend)
    const backendUrl = `${BACKEND_API}/api/player/stream?id=${encodeURIComponent(track.track_id)}`;
    playLocalPreview({ ...track, preview_url: backendUrl }, null, startPositionMs);
  };


  const playLocalPreview = (track, reason = null, startPositionMs = 0) => {
    if (!track.preview_url) {
      setPlaybackMessage({
        type: 'error',
        text: reason ? `${reason} (And no preview URL available for this track)` : 'No preview available for this track.'
      });
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = track.preview_url;
    audioRef.current.volume = volume / 100;
    
    audioRef.current.ontimeupdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
      }
    };

    audioRef.current.onended = () => {
      setProgress(0);
      setCurrentTime(0);
      const queue = activeQueueRef.current;
      const track = currentTrackRef.current;
      if (!queue.length || !track) { setIsPlaying(false); return; }
      if (repeatActiveRef.current) {
        // replay same track
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setIsPlaying(false));
        return;
      }
      const idx = queue.findIndex(t => t.track_id === track.track_id);
      let next;
      if (shuffleActiveRef.current) {
        let r;
        do { r = Math.floor(Math.random() * queue.length); } while (r === idx && queue.length > 1);
        next = queue[r];
      } else {
        const nextIdx = idx + 1;
        if (nextIdx >= queue.length) { setIsPlaying(false); return; }
        next = queue[nextIdx];
      }
      playTrack(next);
    };

    audioRef.current.play()
      .then(() => {
        setIsPlaying(true);
        setIsLocalPreview(true);
        setJamNeedsPlay(false);
        if (startPositionMs > 0 && audioRef.current) {
          audioRef.current.currentTime = startPositionMs / 1000;
        }
        if (reason) setPlaybackMessage({ type: 'info', text: reason });
      })
      .catch(err => {
        console.error('Audio playback failed', err);
        setIsPlaying(false);
      });
  };

  const handlePlayPauseToggle = () => {
    if (!currentTrack) return;
    const posMs = audioRef.current ? Math.floor(audioRef.current.currentTime * 1000) : 0;

    if (isLocalPreview && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        sendJamEvent('pause', { position_ms: posMs });
      } else {
        audioRef.current.play()
          .then(() => { setIsPlaying(true); sendJamEvent('play', { position_ms: posMs }); })
          .catch(() => setIsPlaying(false));
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleVolumeChange = (value) => {
    setVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value / 100;
    }
  };

  const handleProgressChange = (value) => {
    setProgress(value);
    if (isLocalPreview && audioRef.current && audioRef.current.duration) {
      const newTime = (value / 100) * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      sendJamEvent('seek', { position_ms: Math.floor(newTime * 1000) });
    }
  };

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const saveDbSettings = (e) => {
    e.preventDefault();
    setDbSettingsSaved(true);
    setTimeout(() => {
      setDbSettingsSaved(false);
      closeSettings();
    }, 1500);
  };

  // ── If not authenticated, show the full-screen auth page ───────────────────
  if (!accessToken) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a0f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Ambient background glows */}
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%', width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(109,40,217,0.15) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-10%', width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none'
        }} />

        <div style={{ width: '100%', maxWidth: '420px', padding: '1.5rem', position: 'relative', zIndex: 1 }}>
          {/* Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '64px', height: '64px',
              background: 'linear-gradient(135deg, #6d28d9, #7c3aed)',
              borderRadius: '20px', marginBottom: '1rem',
              boxShadow: '0 0 40px rgba(124,58,237,0.4)'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <Text fw={900} size="32px" style={{ letterSpacing: '-1px', color: '#ffffff', lineHeight: 1 }}>Rikupy</Text>
            <Text size="xs" style={{ letterSpacing: '4px', textTransform: 'uppercase', color: '#6d28d9', marginTop: 8, fontWeight: 700 }}>
              Music Streaming
            </Text>
          </div>

          {/* Auth Card */}
          <Paper radius="2xl" p={0} style={{
            backgroundColor: '#0f0f13',
            border: '1px solid #1e1e28',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(109,40,217,0.1)',
            overflow: 'hidden'
          }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e1e28' }}>
              {['login', 'register'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setAuthMode(mode); setAuthError(''); }}
                  style={{
                    flex: 1, padding: '1rem', border: 'none', cursor: 'pointer', fontWeight: 700,
                    fontSize: '14px', transition: 'all 0.2s',
                    background: authMode === mode
                      ? 'linear-gradient(135deg, #1a0a2e, #1e0f35)'
                      : 'transparent',
                    color: authMode === mode ? '#a78bfa' : '#52525b',
                    borderBottom: authMode === mode ? '2px solid #7c3aed' : '2px solid transparent'
                  }}
                >
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            {/* Form */}
            <Stack gap="md" p="xl">
              {authError && (
                <Alert color="red" radius="md" py="xs" px="sm" styles={{ message: { fontSize: '13px' } }}>
                  {authError}
                </Alert>
              )}

              <TextInput
                label="Username"
                placeholder="Enter your username"
                value={authUsername}
                onChange={(e) => { setAuthUsername(e.target.value); setAuthError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                radius="xl"
                styles={{
                  input: { backgroundColor: '#1a1a1f', border: '1px solid #27272a', color: '#fff', fontSize: '14px', height: '44px' },
                  label: { color: '#a1a1aa', fontSize: '12px', fontWeight: 600, marginBottom: 6 }
                }}
              />

              {authMode === 'register' && (
                <TextInput
                  label="Display Name"
                  placeholder="How should we call you?"
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                  radius="xl"
                  styles={{
                    input: { backgroundColor: '#1a1a1f', border: '1px solid #27272a', color: '#fff', fontSize: '14px', height: '44px' },
                    label: { color: '#a1a1aa', fontSize: '12px', fontWeight: 600, marginBottom: 6 }
                  }}
                />
              )}

              <TextInput
                label="Password"
                placeholder="Enter your password"
                type="password"
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                radius="xl"
                styles={{
                  input: { backgroundColor: '#1a1a1f', border: '1px solid #27272a', color: '#fff', fontSize: '14px', height: '44px' },
                  label: { color: '#a1a1aa', fontSize: '12px', fontWeight: 600, marginBottom: 6 }
                }}
              />

              <Button
                fullWidth radius="xl" size="md" color="violet" fw={700}
                loading={authLoading}
                onClick={handleAuthSubmit}
                mt="xs"
                style={{ height: '48px', fontSize: '15px', background: 'linear-gradient(135deg, #6d28d9, #7c3aed)', boxShadow: '0 4px 24px rgba(124,58,237,0.35)' }}
              >
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </Stack>
          </Paper>

          <Text ta="center" size="xs" color="dimmed" mt="xl">
            Stream any song, for free. Powered by YouTube Music.
          </Text>
        </div>
      </div>
    );
  }

  // ── Authenticated: render the full app ──────────────────────────────────────
  return (
    <>
    <AppShell
      layout="alt"
      header={{ height: 70 }}
      footer={{ height: 100 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="md"
    >
      {/* SIDEBAR LOGO & NAVIGATION */}
      <AppShell.Navbar p="md" className="sidebar-container">
        <Stack gap="xl" h="100%">
          <Group px="xs" mt="xs" justify="space-between">
            <Stack gap={1}>
              <Text fw={900} size="24px" style={{ letterSpacing: '-0.5px', color: '#ffffff' }}>
                Rikupy
              </Text>
              <Text size="9px" fw={700} color="dimmed" style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>
                Music Streaming
              </Text>
            </Stack>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
          </Group>

          <Stack gap={4}>
            <div
              className={`nav-item ${activeTab === 'home' ? 'nav-item-active' : ''}`}
              onClick={() => { setActiveTab('home'); toggleMobile(); }}
            >
              <Group gap="md">
                <IconMusic size={18} />
                <span>Home</span>
              </Group>
            </div>

            <div
              className={`nav-item ${activeTab === 'search' ? 'nav-item-active' : ''}`}
              onClick={() => { setActiveTab('search'); toggleMobile(); }}
            >
              <Group gap="md">
                <IconSearch size={18} />
                <span>Search</span>
              </Group>
            </div>

            <div
              className={`nav-item ${activeTab === 'likes' ? 'nav-item-active' : ''}`}
              onClick={() => {
                if (!accessToken) {
                  setAuthMode('login');
                  openAuthModal();
                } else {
                  setActiveTab('likes');
                  toggleMobile();
                }
              }}
              style={{ opacity: 1 }}
            >
              <Group gap="md" justify="space-between" style={{ width: '100%' }}>
                <Group gap="md">
                  <IconHeart size={18} />
                  <span>Your Library</span>
                </Group>
                {accessToken && likedTracks.length > 0 && (
                  <Badge color="violet" variant="light" size="xs">
                    {likedTracks.length}
                  </Badge>
                )}
              </Group>
            </div>

            <div
              className="nav-item"
              onClick={() => {
                if (!accessToken) {
                  setAuthMode('login');
                  openAuthModal();
                } else {
                  setActiveTab('likes');
                  setPlaybackMessage({
                    type: 'success',
                    text: 'Playlist feature coming soon!'
                  });
                }
              }}
              style={{ opacity: 1 }}
            >
              <Group gap="md">
                <IconPlus size={18} />
                <span>Create Playlist</span>
              </Group>
            </div>

            <div
              className={`nav-item ${activeTab === 'settings' ? 'nav-item-active' : ''}`}
              onClick={() => {
                if (!accessToken) {
                  setAuthMode('login');
                  openAuthModal();
                } else {
                  setActiveTab('settings');
                  loadSettings();
                  toggleMobile();
                }
              }}
            >
              <Group gap="md">
                <IconSettings size={18} />
                <span>Settings</span>
              </Group>
            </div>

            <div
              className={`nav-item ${activeTab === 'messages' ? 'nav-item-active' : ''}`}
              onClick={() => {
                if (!accessToken) {
                  setAuthMode('login');
                  openAuthModal();
                } else {
                  setActiveConversation(null);
                  setNewChatUsername('');
                  setUserSearchResults([]);
                  setActiveTab('messages');
                  toggleMobile();
                }
              }}
            >
              <Group gap="md" style={{ flex: 1 }}>
                <IconMessage size={18} />
                <span style={{ flex: 1 }}>Messages</span>
                <TotalUnreadBadge counts={unreadCounts} />
              </Group>
            </div>
          </Stack>

          {/* User Account Panel */}
          {accessToken ? (
            <Paper p="md" mt="auto" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1f1f23' }}>
              <Stack gap="xs">
                <Group gap="xs">
                  <Avatar src={userProfile?.profile_image} radius="xl" size="sm">
                    <IconUser size={14} />
                  </Avatar>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="xs" fw={700} truncate="end">
                      {userProfile?.display_name || userProfile?.auth_id || 'User'}
                    </Text>
                    <Text size="9px" color="dimmed" truncate="end">
                      Signed in
                    </Text>
                  </Stack>
                </Group>
                <Button size="xs" variant="light" color="red" radius="xl" fullWidth onClick={handleLogout}>
                  Sign Out
                </Button>
              </Stack>
            </Paper>
          ) : (
            <Paper p="md" mt="auto" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1f1f23' }}>
              <Stack gap="xs">
                <Text size="xs" color="dimmed" ta="center">Sign in to save your liked tracks</Text>
                <Button
                  size="xs" color="violet" radius="xl" fullWidth
                  onClick={() => { setAuthMode('login'); openAuthModal(); }}
                >
                  Sign In
                </Button>
                <Button
                  size="xs" variant="light" color="violet" radius="xl" fullWidth
                  onClick={() => { setAuthMode('register'); openAuthModal(); }}
                >
                  Create Account
                </Button>
              </Stack>
            </Paper>
          )}
        </Stack>
      </AppShell.Navbar>

      {/* TOP HEADER */}
      <AppShell.Header className="main-container" style={{ border: 'none' }}>
        <Group h="100%" px={{ base: 'sm', sm: 'xl' }} justify="space-between">
          <Group gap="xs" style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="sm" />

            {/* Pill Search Input */}
            <TextInput
              leftSection={loadingSearch ? <Loader size={14} color="violet" /> : <IconSearch size={16} color="#71717a" />}
              placeholder="Search artists, songs, podcasts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              style={{ flex: 1, maxWidth: 300 }}
              size="sm"
              radius="xl"
              disabled={loadingSearch}
              styles={{
                input: { backgroundColor: '#18181b', border: 'none', color: '#fff', fontSize: '13px' }
              }}
            />
          </Group>

          {/* Right Header Panel Actions */}
          <Group gap="md">

            {userProfile ? (
              <Popover width={180} position="bottom-end" withArrow shadow="md">
                <Popover.Target>
                  <Avatar src={userProfile?.profile_image} radius="xl" size="md" style={{ cursor: 'pointer' }}>
                    <IconUser size={18} />
                  </Avatar>
                </Popover.Target>
                <Popover.Dropdown style={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                  <Stack gap="xs">
                    <Text size="sm" fw={700}>{userProfile.display_name || userProfile.auth_id}</Text>
                    <Text size="xs" color="dimmed">@{userProfile.auth_id}</Text>
                    <Button size="xs" color="red" variant="light" radius="xl" fullWidth onClick={handleLogout} leftSection={<IconLogout size={14} />}>
                      Sign Out
                    </Button>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            ) : (
              <Button
                size="sm" color="violet" radius="xl" variant="filled"
                onClick={() => { setAuthMode('login'); openAuthModal(); }}
              >
                Sign In
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      {/* MAIN LAYOUT */}
      <AppShell.Main className="main-container" style={{ paddingRight: '24px' }}>
        
        {/* Playback Toast Alerts */}
        {playbackMessage && (
          <Alert
            icon={playbackMessage.type === 'error' ? <IconAlertCircle size={16} /> : <IconCircleCheck size={16} />}
            color={playbackMessage.type === 'error' ? 'red' : (playbackMessage.type === 'success' ? 'green' : 'violet')}
            withCloseButton
            onClose={() => setPlaybackMessage(null)}
            mb="md"
            radius="md"
          >
            {playbackMessage.text}
          </Alert>
        )}

        {/* VIEW 1: HOME PANEL */}
        {activeTab === 'home' && (
          <Stack gap="xl">
            
            {/* HERO SPOTLIGHT BANNER */}
            {homeTracks.length > 0 ? (
            <div className="hero-banner" style={{
              minHeight: '180px',
              height: 'clamp(180px, 35vw, 300px)',
              borderRadius: '24px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'flex-end',
              padding: '2rem'
            }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundImage: `url(${homeTracks[0].album_art || ''})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 0
              }}></div>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(to right, rgba(15,15,19,0.95) 0%, rgba(15,15,19,0.7) 40%, rgba(15,15,19,0) 100%)',
                zIndex: 1
              }}></div>

              <div className="hero-content" style={{ zIndex: 2 }}>
                <Stack gap="md" align="flex-start">
                  <Badge variant="filled" color="violet" size="sm" radius="sm" fw={700} px="md" style={{ letterSpacing: '0.5px' }}>
                    #1 TRENDING
                  </Badge>
                  
                  <Stack gap={4}>
                    <Text fw={900} size="clamp(20px, 4vw, 36px)" style={{ letterSpacing: '-1px', color: '#ffffff', lineHeight: 1.1 }}>
                      {homeTracks[0].name}
                    </Text>
                    <Text fw={600} size="md" color="dimmed">
                      {homeTracks[0].artist}
                    </Text>
                  </Stack>

                  <Group gap="sm" mt="sm" style={{ zIndex: 10 }} wrap="wrap">
                    <Button
                      onClick={() => playTrackFromQueue(homeTracks, homeTracks[0])}
                      leftSection={<IconPlayerPlay size={14} />}
                      color="violet"
                      radius="xl"
                      size="sm"
                      px="lg"
                      fw={700}
                    >
                      Play Now
                    </Button>
                    <Button
                      onClick={() => toggleLike(homeTracks[0])}
                      leftSection={<IconPlus size={14} />}
                      variant="default"
                      radius="xl"
                      size="sm"
                      px="lg"
                      fw={700}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.15)'
                        }
                      }}
                    >
                      Add to Library
                    </Button>
                  </Group>
                </Stack>
              </div>
            </div>
            ) : (
              <Loader color="violet" mt="xl" />
            )}

            {/* MADE FOR YOU GRID */}
            {homeTracks.length > 1 && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={800} size="xl" style={{ letterSpacing: '-0.5px' }}>Made For You</Text>
                  <Text size="xs" color="dimmed">Trending tracks based on global charts</Text>
                </Stack>
                <UnstyledButton onClick={() => {
                  setSearchResults(homeTracks);
                  setSearchPage(1);
                  setSearchHasMore(false);
                  setActiveTab('search');
                }}>
                  <Text size="xs" color="violet" fw={700}>Show all</Text>
                </UnstyledButton>
              </Group>

              <Grid gutter="md">
                {homeTracks.slice(1, 5).map((track) => (
                  <Grid.Col span={{ base: 6, sm: 3 }} key={track.track_id}>
                    <Card className="music-card" radius="lg" p="md" onClick={() => playTrackFromQueue(homeTracks, track)} style={{ border: currentTrack?.track_id === track.track_id ? '1px solid #a78bfa' : undefined }}>
                      <Card.Section p="xs">
                        <Image src={track.album_art || ALBUM_ART_FALLBACK} radius="md" style={{ aspectRatio: '1/1', objectFit: 'cover' }} />
                      </Card.Section>
                      <Stack gap={2} mt="xs">
                        <Text fw={700} size="sm" truncate="end">{track.name}</Text>
                        <Text size="xs" color="dimmed" lineClamp={2}>{track.artist}</Text>
                      </Stack>
                    </Card>
                  </Grid.Col>
                ))}
              </Grid>
            </Stack>
            )}

            {/* TRENDING TRACKS LIST */}
            {homeTracks.length > 5 && (
            <Stack gap="xs" mt="sm">
              <Group justify="space-between">
                <Text fw={800} size="xl" style={{ letterSpacing: '-0.5px' }}>Trending Tracks</Text>
              </Group>

              <Stack gap="xs">
                {homeTracks.slice(5).map((track, i) => (
                  <Paper
                    key={track.track_id}
                    p="sm"
                    radius="md"
                    style={{ backgroundColor: currentTrack?.track_id === track.track_id ? '#1a1030' : '#131316', border: currentTrack?.track_id === track.track_id ? '1px solid #a78bfa' : '1px solid #1e1e24', cursor: 'pointer' }}
                    onClick={() => playTrackFromQueue(homeTracks, track)}
                  >
                    <Grid align="center" gutter="md">
                      <Grid.Col span={1} align="center">
                        <Text size="sm" fw={700} color="dimmed">{i+6 < 10 ? `0${i+6}` : i+6}</Text>
                      </Grid.Col>
                      <Grid.Col span={{ base: 10, xs: 7 }}>
                        <Group gap="md" wrap="nowrap">
                          <Image src={track.album_art || ALBUM_ART_FALLBACK} w={40} h={40} radius="sm" style={{ flexShrink: 0, objectFit: 'cover' }} />
                          <Stack gap={1} style={{ minWidth: 0 }}>
                            <Text fw={700} size="sm" truncate="end" color={currentTrack?.track_id === track.track_id ? '#a78bfa' : '#fff'}>
                              {track.name}
                            </Text>
                            <Text size="xs" color="dimmed" truncate="end">{track.artist}</Text>
                          </Stack>
                        </Group>
                      </Grid.Col>
                      <Grid.Col span={3} visibleFrom="xs">
                        <Text size="xs" color="dimmed">{track.album}</Text>
                      </Grid.Col>
                      <Grid.Col span={1} align="right">
                        <ActionIcon
                          variant="subtle"
                          color={likedTracks.some(t => t.track_id === track.track_id) ? 'violet' : 'gray'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(track);
                          }}
                        >
                          {likedTracks.some(t => t.track_id === track.track_id) ? (
                            <IconHeartFilled size={18} color="#a78bfa" />
                          ) : (
                            <IconHeart size={18} />
                          )}
                        </ActionIcon>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            </Stack>
            )}

          </Stack>
        )}

        {/* VIEW 2: SEARCH PANEL */}
        {activeTab === 'search' && (
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={800} size="xl" style={{ letterSpacing: '-0.5px' }}>Search Results</Text>
                <Text size="xs" color="dimmed">
                  {searchResults.length > 0
                    ? `Page ${searchPage} · ${searchResults.length} tracks`
                    : loadingSearch ? 'Searching...' : 'No results'}
                </Text>
              </Stack>
            </Group>

            {loadingSearch ? (
              <Group justify="center" py="xl">
                <Loader color="violet" type="dots" />
              </Group>
            ) : searchResults.length > 0 ? (
              <>
                <Stack gap="xs">
                  {searchResults.map((track, index) => {
                    const isLiked = track.is_liked || likedTracks.some(t => t.track_id === track.track_id);
                    const globalIndex = (searchPage - 1) * SEARCH_PAGE_SIZE + index + 1;
                    return (
                      <Paper
                        key={track.track_id}
                        p="sm"
                        radius="md"
                        style={{ backgroundColor: currentTrack?.track_id === track.track_id ? '#1a1030' : '#131316', border: currentTrack?.track_id === track.track_id ? '1px solid #a78bfa' : '1px solid #1e1e24', cursor: 'pointer' }}
                        onClick={() => playTrackFromQueue(searchResults, track)}
                      >
                        <Grid align="center" gutter="md">
                          <Grid.Col span={1} style={{ textAlign: 'center' }}>
                            <Text size="sm" fw={700} color="dimmed">
                              {globalIndex < 10 ? `0${globalIndex}` : globalIndex}
                            </Text>
                          </Grid.Col>

                          <Grid.Col span={{ base: 8, sm: 6 }}>
                            <Group gap="sm" wrap="nowrap">
                              <Image
                                src={track.album_art || ALBUM_ART_FALLBACK}
                                w={40} h={40} radius="sm"
                                style={{ objectFit: 'cover', flexShrink: 0, background: '#27272a' }}
                              />
                              <Stack gap={1} style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm" truncate="end" color={currentTrack?.track_id === track.track_id ? '#a78bfa' : '#fff'}>
                                  {track.name}
                                </Text>
                                <Text size="xs" color="dimmed" truncate="end">{track.artist}</Text>
                              </Stack>
                            </Group>
                          </Grid.Col>

                          <Grid.Col span={3} visibleFrom="sm">
                            <Text size="xs" color="dimmed" truncate="end">{track.album}</Text>
                          </Grid.Col>

                          <Grid.Col span={{ base: 3, sm: 2 }} style={{ textAlign: 'right' }}>
                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                              <ActionIcon
                                visibleFrom="sm"
                                variant="subtle" color="violet" size="md"
                                onClick={(e) => { e.stopPropagation(); playTrackFromQueue(searchResults, track); }}
                              >
                                <IconPlayerPlay size={18} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle" color={isLiked ? 'violet' : 'gray'} size="md"
                                onClick={(e) => { e.stopPropagation(); toggleLike(track); }}
                              >
                                {isLiked ? <IconHeartFilled size={18} color="#a78bfa" /> : <IconHeart size={18} />}
                              </ActionIcon>
                            </Group>
                          </Grid.Col>
                        </Grid>
                      </Paper>
                    );
                  })}
                </Stack>

                <Group justify="center" gap="sm" mt="sm">
                  <Button
                    variant="light" color="violet" radius="xl" size="sm"
                    disabled={searchPage === 1 || loadingSearch}
                    onClick={() => handleSearch(searchQuery, searchPage - 1)}
                  >
                    ← Prev
                  </Button>
                  <Text size="sm" color="dimmed" style={{ lineHeight: '32px' }}>Page {searchPage}</Text>
                  <Button
                    variant="light" color="violet" radius="xl" size="sm"
                    disabled={!searchHasMore || loadingSearch}
                    onClick={() => handleSearch(searchQuery, searchPage + 1)}
                  >
                    Next →
                  </Button>
                </Group>
              </>
            ) : (
              <Paper p="xl" ta="center" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1e1e24' }}>
                <Text color="dimmed" size="sm">Type in the header search input and press Enter to find music.</Text>
              </Paper>
            )}
          </Stack>
        )}

        {/* VIEW 3: LIBRARY PANEL (LIKED SONGS) */}
        {activeTab === 'likes' && (
          <Stack gap="md">
            <Paper
              p="xl"
              radius="lg"
              style={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%)',
                color: '#fff',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.1 }}>
                <IconHeartFilled size={150} color="#fff" />
              </div>
              <Stack gap="xs">                
                <Text fw={900} size="32px" style={{ lineHeight: 1.1 }}>Your Library</Text>
                <Text size="sm" fw={500}>
                  {likedTracks.length} song{likedTracks.length === 1 ? '' : 's'} saved to Library
                </Text>
              </Stack>
            </Paper>

            {loadingLikes ? (
              <Group justify="center" py="xl">
                <Loader color="violet" type="dots" />
              </Group>
            ) : likedTracks.length > 0 ? (
              <Stack gap="xs">
                {likedTracks.map((track, index) => (
                  <Paper
                    key={track.id}
                    p="sm"
                    radius="md"
                    style={{
                      backgroundColor: currentTrack?.track_id === track.track_id ? '#1a1030' : '#131316',
                      border: currentTrack?.track_id === track.track_id ? '1px solid #a78bfa' : '1px solid #1e1e24',
                      cursor: 'pointer'
                    }}
                    onClick={() => playTrackFromQueue(likedTracks, track)}
                  >
                    <Grid align="center" gutter="md">
                      <Grid.Col span={1} align="center">
                        <Text size="sm" color="dimmed" fw={700}>
                          {index + 1}
                        </Text>
                      </Grid.Col>

                      <Grid.Col span={{ base: 9, sm: 6 }}>
                        <Group gap="sm" wrap="nowrap">
                          <Image src={track.album_art || ALBUM_ART_FALLBACK} w={40} h={40} radius="sm" style={{ flexShrink: 0, objectFit: 'cover' }} />
                          <Stack gap={1} style={{ minWidth: 0 }}>
                            <Text fw={700} size="sm" truncate="end" color={currentTrack?.track_id === track.track_id ? '#a78bfa' : '#fff'}>
                              {track.name}
                            </Text>
                            <Text size="xs" color="dimmed" truncate="end">
                              {track.artist}
                            </Text>
                          </Stack>
                        </Group>
                      </Grid.Col>

                      <Grid.Col span={3} visibleFrom="sm">
                        <Text size="xs" color="dimmed" truncate="end">
                          {track.album}
                        </Text>
                      </Grid.Col>

                      <Grid.Col span={{ base: 2, sm: 2 }} style={{ textAlign: 'right' }}>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Text size="xs" color="dimmed" visibleFrom="sm">
                            {formatMs(track.duration_ms)}
                          </Text>
                          <ActionIcon
                            variant="subtle"
                            color="violet"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLike(track);
                            }}
                          >
                            <IconHeartFilled size={18} color="#a78bfa" />
                          </ActionIcon>
                        </Group>
                      </Grid.Col>
                    </Grid>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Paper p="xl" align="center" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1e1e24' }}>
                <Text color="dimmed" mb="sm" size="sm">No liked songs stored in database yet.</Text>
                <Button variant="light" color="violet" radius="xl" onClick={() => setActiveTab('home')}>
                  Browse Home
                </Button>
              </Paper>
            )}
          </Stack>
        )}

        {/* VIEW: SETTINGS */}
        {activeTab === 'settings' && (
          <Stack gap="lg">
            <Text fw={800} size="xl" style={{ letterSpacing: '-0.5px' }}>Settings</Text>

            {/* ── Music Source ── */}
            <Stack gap="xs">
              <Text fw={700} size="sm" style={{ color: '#a78bfa' }}>Music Source</Text>
              <Group gap="sm">
                {[
                  { value: 'soundcloud', label: 'SoundCloud', icon: '🎵', desc: 'No auth needed' },
                  { value: 'youtube', label: 'YouTube Music', icon: '▶', desc: 'Cookies optional' },
                  { value: 'spotify', label: 'Spotify', icon: '🎧', desc: 'API key required' },
                ].map(src => (
                  <Paper
                    key={src.value}
                    p="md"
                    radius="lg"
                    onClick={() => setSettingsSource(src.value)}
                    style={{
                      flex: 1, cursor: 'pointer', textAlign: 'center',
                      backgroundColor: settingsSource === src.value ? '#3b0764' : '#131316',
                      border: `2px solid ${settingsSource === src.value ? '#7c3aed' : '#1f1f23'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <Text size="xl">{src.icon}</Text>
                    <Text size="sm" fw={700} style={{ color: '#fff' }}>{src.label}</Text>
                    <Text size="xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{src.desc}</Text>
                  </Paper>
                ))}
              </Group>
            </Stack>

            <Divider color="#1f1f23" />

            {/* ── yt-dlp Settings ── */}
            <Stack gap="sm">
              <Text fw={700} size="sm" style={{ color: '#a78bfa' }}>yt-dlp Settings</Text>
              <TextInput
                label="Format string"
                description="Passed to yt-dlp -f. E.g. bestaudio/best, bestaudio[ext=m4a]/best"
                value={settingsYtFormat}
                onChange={e => setSettingsYtFormat(e.target.value)}
                placeholder="bestaudio/best"
                styles={{ input: { backgroundColor: '#18181b', border: '1px solid #27272a', color: '#fff' }, label: { color: 'rgba(255,255,255,0.7)' }, description: { color: 'rgba(255,255,255,0.35)' } }}
              />
            </Stack>

            {/* ── YouTube Cookies ── */}
            {(settingsSource === 'youtube' || settingsSource === 'spotify') && (
              <Stack gap="sm">
                <Text fw={700} size="sm" style={{ color: '#a78bfa' }}>YouTube Cookies</Text>
                <Text size="xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Paste the content of your <code>cookies.txt</code> file (Netscape format), or upload it.
                  Used for yt-dlp authentication to unlock age-restricted / region-locked tracks.
                </Text>
                <Group gap="xs" align="flex-start">
                  <Textarea
                    style={{ flex: 1 }}
                    placeholder={settingsData?.has_yt_cookies ? '● cookies saved — paste new content to replace' : 'Paste cookies.txt content here…'}
                    value={settingsCookies === null ? '' : settingsCookies}
                    onChange={e => setSettingsCookies(e.target.value)}
                    minRows={3}
                    maxRows={6}
                    autosize
                    styles={{ input: { backgroundColor: '#18181b', border: '1px solid #27272a', color: '#fff', fontFamily: 'monospace', fontSize: 11 } }}
                  />
                  <Stack gap="xs">
                    <FileButton
                      accept=".txt"
                      onChange={file => {
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = e => setSettingsCookies(e.target.result);
                        reader.readAsText(file);
                      }}
                    >
                      {props => (
                        <Button {...props} size="xs" variant="light" color="violet">
                          Upload
                        </Button>
                      )}
                    </FileButton>
                    {(settingsCookies !== null || settingsData?.has_yt_cookies) && (
                      <Button size="xs" variant="subtle" color="red" onClick={() => setSettingsCookies('')}>
                        Clear
                      </Button>
                    )}
                  </Stack>
                </Group>
                {settingsData?.has_yt_cookies && settingsCookies === null && (
                  <Text size="xs" style={{ color: '#4ade80' }}>✓ Cookies currently saved on server</Text>
                )}
              </Stack>
            )}

            {/* ── Spotify Credentials ── */}
            {settingsSource === 'spotify' && (
              <Stack gap="sm">
                <Divider color="#1f1f23" />
                <Text fw={700} size="sm" style={{ color: '#a78bfa' }}>Spotify API Credentials</Text>
                <Text size="xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Create an app at <strong>developer.spotify.com</strong> → Dashboard. Use the Client ID and Secret below.
                </Text>
                <TextInput
                  label="Client ID"
                  value={settingsSpotifyId}
                  onChange={e => setSettingsSpotifyId(e.target.value)}
                  placeholder="Enter Spotify Client ID"
                  styles={{ input: { backgroundColor: '#18181b', border: '1px solid #27272a', color: '#fff' }, label: { color: 'rgba(255,255,255,0.7)' } }}
                />
                <PasswordInput
                  label="Client Secret"
                  placeholder={settingsData?.has_spotify_secret ? '● saved — type to replace' : 'Enter Spotify Client Secret'}
                  value={settingsSpotifySecret === null ? '' : settingsSpotifySecret}
                  onChange={e => setSettingsSpotifySecret(e.target.value)}
                  styles={{ input: { backgroundColor: '#18181b', border: '1px solid #27272a', color: '#fff' }, label: { color: 'rgba(255,255,255,0.7)' } }}
                />
                {settingsData?.has_spotify_secret && settingsSpotifySecret === null && (
                  <Text size="xs" style={{ color: '#4ade80' }}>✓ Client secret currently saved on server</Text>
                )}
              </Stack>
            )}

            <Button
              color="violet"
              radius="xl"
              loading={savingSettings}
              onClick={saveSettings}
              style={{ alignSelf: 'flex-start' }}
            >
              Save Settings
            </Button>
          </Stack>
        )}

        {/* VIEW 4: MESSAGES PANEL */}
        {activeTab === 'messages' && (
          <>
            {!activeConversation ? (
              /* Conversation list + new chat */
              <Stack gap="md">
                <Stack gap={2}>
                  <Text fw={800} size="xl" style={{ letterSpacing: '-0.5px' }}>Messages</Text>
                  <Text size="xs" color="dimmed">Chat with other Rikupy users</Text>
                </Stack>

                <Paper p="md" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1e1e24' }}>
                  <Stack gap="xs">
                    <Text size="xs" fw={700} color="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>New Message</Text>
                    <Group gap="xs">
                      <TextInput
                        placeholder="Search by username..."
                        value={newChatUsername}
                        onChange={(e) => { setNewChatUsername(e.target.value); searchUsers(e.target.value); }}
                        style={{ flex: 1 }}
                        size="sm"
                        radius="xl"
                        styles={{ input: { backgroundColor: '#0f0f13', border: '1px solid #27272a', color: '#fff' } }}
                      />
                      <Button
                        size="sm" color="violet" radius="xl"
                        disabled={!newChatUsername.trim()}
                        loading={loadingMessages}
                        onClick={() => {
                          const target = newChatUsername.trim().toLowerCase();
                          setNewChatUsername('');
                          setUserSearchResults([]);
                          openConversation(target);
                        }}
                      >
                        Open
                      </Button>
                    </Group>
                    {userSearchResults.length > 0 && (
                      <Stack gap={4}>
                        {userSearchResults.map(u => (
                          <Paper
                            key={u.username} p="xs" radius="md"
                            style={{ backgroundColor: '#0f0f13', border: '1px solid #27272a', cursor: 'pointer' }}
                            onClick={() => { setNewChatUsername(''); setUserSearchResults([]); openConversation(u.username); }}
                          >
                            <Group gap="xs">
                              <Avatar src={u.profile_image} size="sm" radius="xl"><IconUser size={12} /></Avatar>
                              <Stack gap={0}>
                                <Text size="xs" fw={700}>{u.display_name || u.username}</Text>
                                <Text size="10px" color="dimmed">@{u.username}</Text>
                              </Stack>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Paper>

                {conversations.length === 0 ? (
                  <Paper p="xl" ta="center" radius="lg" style={{ backgroundColor: '#131316', border: '1px solid #1e1e24' }}>
                    <Text color="dimmed" size="sm">No conversations yet. Search for a user above to start chatting.</Text>
                  </Paper>
                ) : (
                  <Stack gap="xs">
                    {conversations.map(conv => {
                      const unread = unreadCounts[conv.other_username] || 0;
                      return (
                        <Paper
                          key={conv.other_user_id} p="md" radius="md"
                          style={{ backgroundColor: unread ? '#1a1025' : '#131316', border: `1px solid ${unread ? '#6d28d9' : '#1e1e24'}`, cursor: 'pointer' }}
                          onClick={() => openConversation(conv.other_username)}
                        >
                          <Group gap="md" wrap="nowrap">
                            <Indicator
                              color={onlineUsers[conv.other_username] ? 'green' : 'gray'}
                              position="bottom-end" size={9} offset={3}
                              withBorder processing={onlineUsers[conv.other_username]}
                            >
                              <Avatar src={conv.other_profile_image} radius="xl"><IconUser size={16} /></Avatar>
                            </Indicator>
                            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                              <Text size="sm" fw={unread ? 800 : 700} truncate="end">{conv.other_display_name || conv.other_username}</Text>
                              <Text size="xs" color="dimmed" truncate="end">@{conv.other_username}</Text>
                              <Text size="xs" truncate="end" style={{ color: unread ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: unread ? 600 : 400 }}>{conv.last_message}</Text>
                            </Stack>
                            <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                              <Text size="10px" color="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                {fmtTime(conv.last_message_at)}
                              </Text>
                              {unread > 0 && (
                                <div style={{ background: '#7c3aed', borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                                  <Text size="10px" fw={700} style={{ color: '#fff', lineHeight: 1 }}>{unread > 99 ? '99+' : unread}</Text>
                                </div>
                              )}
                            </Stack>
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            ) : (
              /* Active conversation thread — fixed layout so input is always visible */
              <div style={{ position: 'relative', height: 'calc(100dvh - var(--app-shell-header-height, 70px) - var(--app-shell-footer-height, 100px) - 48px)' }}>
                {/* Header */}
                <Group gap="xs" mb="sm">
                  <ActionIcon variant="subtle" color="gray" onClick={() => { setActiveConversation(null); setMessages([]); setRemoteTyping(false); clearTimeout(typingTimeoutRef.current); }}>
                    <IconChevronLeft size={18} />
                  </ActionIcon>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: onlineUsers[activeConversation] ? '#4ade80' : '#6b7280',
                      boxShadow: onlineUsers[activeConversation] ? '0 0 6px #4ade80' : 'none',
                      flexShrink: 0,
                    }} />
                    <Text fw={700} size="md">@{activeConversation}</Text>
                    <Text size="xs" color={onlineUsers[activeConversation] ? 'green' : 'dimmed'}>
                      {onlineUsers[activeConversation] ? 'Online' : 'Offline'}
                    </Text>
                  </div>
                  {!wsConnected && (
                    <Badge color="orange" variant="dot" size="sm" style={{ marginLeft: 'auto' }}>
                      Reconnecting…
                    </Badge>
                  )}
                </Group>

                {/* Scrollable messages */}
                <div style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: replyingTo ? 92 : 56, overflowY: 'auto', backgroundColor: '#0f0f13', border: '1px solid #1e1e24', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {loadingMessages ? (
                    <Group justify="center" py="xl"><Loader color="violet" type="dots" /></Group>
                  ) : messages.length === 0 ? (
                    <Text size="sm" color="dimmed" ta="center" mt="xl">No messages yet. Say hello!</Text>
                  ) : (
                    <>
                      {messages.map(msg => {
                        const isMine = msg.sender_username === userProfile?.auth_id;
                        const lastMineId = messages.filter(m => m.sender_username === userProfile?.auth_id).at(-1)?.id;
                        const isLast = msg.id === lastMineId;
                        const isHovered = hoveredMsgId === msg.id;
                        return (
                          <div
                            key={msg.id}
                            style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 4 }}
                            onMouseEnter={() => setHoveredMsgId(msg.id)}
                            onMouseLeave={() => setHoveredMsgId(null)}
                          >
                            {isMine && (
                              <ActionIcon
                                size="xs" variant="subtle" color="gray" radius="xl"
                                style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0, marginBottom: 4 }}
                                onClick={() => setReplyingTo({ id: msg.id, content: msg.content, sender_username: msg.sender_username })}
                                title="Reply"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                              </ActionIcon>
                            )}
                            <div style={{
                              maxWidth: '70%',
                              backgroundColor: isMine ? '#6d28d9' : '#1e1e28',
                              borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              padding: '8px 14px',
                            }}>
                              {msg.reply_to_content && (
                                <div style={{
                                  borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.4)' : '#6d28d9'}`,
                                  paddingLeft: 8,
                                  marginBottom: 6,
                                  opacity: 0.85,
                                }}>
                                  <Text size="10px" fw={600} style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#a78bfa' }}>
                                    @{msg.reply_to_sender}
                                  </Text>
                                  <Text size="xs" style={{ color: isMine ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                                    {msg.reply_to_content}
                                  </Text>
                                </div>
                              )}
                              <Text size="sm" style={{ color: '#fff', wordBreak: 'break-word' }}>{msg.content}</Text>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
                                <Text size="10px" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                  {fmtTime(msg.created_at)}
                                </Text>
                                {isMine && isLast && (
                                  <Text size="10px" style={{ color: readBy[activeConversation] ? '#4ade80' : 'rgba(255,255,255,0.5)', lineHeight: 1 }}>
                                    {readBy[activeConversation] ? '✓✓' : '✓'}
                                  </Text>
                                )}
                              </div>
                            </div>
                            {!isMine && (
                              <ActionIcon
                                size="xs" variant="subtle" color="gray" radius="xl"
                                style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0, marginBottom: 4 }}
                                onClick={() => setReplyingTo({ id: msg.id, content: msg.content, sender_username: msg.sender_username })}
                                title="Reply"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                              </ActionIcon>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                  {remoteTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{ backgroundColor: '#1e1e28', borderRadius: '18px 18px 18px 4px', padding: '10px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{
                            width: 7, height: 7, borderRadius: '50%', backgroundColor: '#a78bfa',
                            animation: 'typingBounce 1.2s infinite',
                            animationDelay: `${i * 0.2}s`,
                          }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input pinned at bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {replyingTo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: '6px 12px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" style={{ flexShrink: 0 }}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text size="10px" fw={600} style={{ color: '#a78bfa' }}>@{replyingTo.sender_username}</Text>
                      <Text size="xs" style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyingTo.content}</Text>
                    </div>
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setReplyingTo(null)}>✕</ActionIcon>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    placeholder={wsConnected ? 'Type a message…' : 'Reconnecting…'}
                    value={newMessage}
                    disabled={!wsConnected}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      if (wsRef.current?.readyState === WebSocket.OPEN && activeConversation) {
                        wsRef.current.send(JSON.stringify({ type: 'typing', recipient_username: activeConversation }));
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    style={{ flex: 1 }}
                    size="sm"
                    radius="xl"
                    styles={{ input: { backgroundColor: '#18181b', border: '1px solid #27272a', color: '#fff' } }}
                  />
                  <ActionIcon
                    size="lg" color="violet" variant="filled" radius="xl"
                    onClick={sendMessage}
                    loading={sendingMessage}
                    disabled={!newMessage.trim() || !wsConnected}
                  >
                    <IconSend size={16} />
                  </ActionIcon>
                </div>
                </div>
              </div>
            )}
          </>
        )}

      </AppShell.Main>

      {/* JAM STATUS BAR */}
      {jamRoom && (
        <div style={{ position: 'fixed', bottom: 100, left: 0, right: 0, zIndex: 999, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'linear-gradient(135deg, #6d28d9, #a21caf)', borderRadius: 24, padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'all', boxShadow: '0 4px 24px rgba(109,40,217,0.5)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', animation: 'typingBounce 1.5s infinite' }} />
            <Text size="xs" fw={700} color="#fff">
              🎵 Jamming · {jamMemberCount} {jamMemberCount === 1 ? 'listener' : 'listeners'}
              {isJamHost ? ' · You are host' : ` · Hosted by @${jamRoom.host_username}`}
            </Text>
            {jamNeedsPlay && !isJamHost && (
              <button
                onClick={() => {
                  audioRef.current?.play()
                    .then(() => { setIsPlaying(true); setJamNeedsPlay(false); })
                    .catch(() => {});
                }}
                style={{ background: 'rgba(74,222,128,0.35)', border: '1px solid rgba(74,222,128,0.5)', borderRadius: 12, padding: '2px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
              >
                ▶ Tap to Play
              </button>
            )}
            <button
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?jam=${jamRoom.room_id}`;
                navigator.clipboard.writeText(url);
                setJamLinkCopied(true);
                setTimeout(() => setJamLinkCopied(false), 2000);
              }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 12, padding: '2px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
            >
              {jamLinkCopied ? '✓ Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={() => leaveJam(true)}
              style={{ background: 'rgba(255,0,0,0.25)', border: 'none', borderRadius: 12, padding: '2px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
            >
              {isJamHost ? 'End Jam' : 'Leave'}
            </button>
          </div>
        </div>
      )}

      {/* JOIN JAM PANEL */}
      {showJamJoin && !jamRoom && (
        <div style={{ position: 'fixed', bottom: 108, right: 16, zIndex: 1001, background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: 16, width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <Text size="sm" fw={700} mb="xs">Join a Jam</Text>
          <Group gap="xs">
            <TextInput
              placeholder="Room code..."
              value={jamJoinInput}
              onChange={e => setJamJoinInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && joinJam(jamJoinInput)}
              size="xs" radius="xl" style={{ flex: 1 }}
              styles={{ input: { backgroundColor: '#0f0f13', border: '1px solid #27272a', color: '#fff' } }}
            />
            <Button size="xs" color="violet" radius="xl" loading={joiningJam} onClick={() => joinJam(jamJoinInput)}>Join</Button>
          </Group>
          <Text size="10px" color="dimmed" mt={6}>Or open the shared link directly.</Text>
        </div>
      )}

      {/* BOTTOM PLAYBACK CONTROL FOOTER */}
      <AppShell.Footer className="player-footer" style={{ zIndex: 1000 }} p={0}>

        {/* ── MOBILE LAYOUT (hidden on sm+) ── */}
        <Box hiddenFrom="sm" px="sm" py={8} style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', justifyContent: 'center' }}>
          {/* Row 1: Art + Title + Controls */}
          <Group gap="sm" wrap="nowrap" align="center">
            <Image src={currentTrack?.album_art || ALBUM_ART_FALLBACK} w={36} h={36} radius="sm" style={{ flexShrink: 0, objectFit: 'cover' }} />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} size="xs" truncate="end" color="#fff">{currentTrack?.name || 'No Track'}</Text>
              <Text size="10px" color="dimmed" truncate="end">{currentTrack?.artist || ''}</Text>
            </Stack>
            <Group gap={4} wrap="nowrap">
              <ActionIcon variant="subtle" color={likedTracks.some(t => t.track_id === currentTrack?.track_id) ? 'violet' : 'gray'} size="sm" onClick={() => currentTrack && toggleLike(currentTrack)}>
                {likedTracks.some(t => t.track_id === currentTrack?.track_id) ? <IconHeartFilled size={15} color="#a78bfa" /> : <IconHeart size={15} />}
              </ActionIcon>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => skipTrack(-1)} disabled={activeQueue.length === 0}>
                <IconPlayerSkipBack size={16} />
              </ActionIcon>
              <div className="play-btn-circle" style={{ width: 34, height: 34, flexShrink: 0 }} onClick={handlePlayPauseToggle}>
                {isPlaying ? <IconPlayerPause size={17} fill="#000" /> : <IconPlayerPlay size={17} fill="#000" />}
              </div>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => skipTrack(1)} disabled={activeQueue.length === 0}>
                <IconPlayerSkipForward size={16} />
              </ActionIcon>
            </Group>
          </Group>
          {/* Row 2: Progress */}
          <Group gap="xs" wrap="nowrap">
            <Text size="9px" color="dimmed" style={{ flexShrink: 0, width: 28, textAlign: 'right' }}>
              {isLocalPreview ? formatTime(currentTime) : '0:00'}
            </Text>
            <Slider style={{ flexGrow: 1 }} size="xs" color="violet" value={progress} onChange={handleProgressChange} label={null} thumbSize={8} disabled={!currentTrack || !isLocalPreview} />
            <Text size="9px" color="dimmed" style={{ flexShrink: 0, width: 28 }}>
              {isLocalPreview && audioRef.current?.duration ? formatTime(audioRef.current.duration) : '0:00'}
            </Text>
          </Group>
        </Box>

        {/* ── DESKTOP LAYOUT (hidden on mobile) ── */}
        <Box visibleFrom="sm" px="md" py="sm" h="100%">
          <Grid align="center" h="100%">
            {/* Left: Track Info */}
            <Grid.Col span={4} style={{ display: 'flex', alignItems: 'center' }}>
              {currentTrack ? (
                <Group gap="md" wrap="nowrap" style={{ minWidth: 0, width: '100%' }}>
                  <Image src={currentTrack.album_art || ALBUM_ART_FALLBACK} w={44} h={44} radius="sm" style={{ flexShrink: 0, objectFit: 'cover' }} />
                  <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={700} size="sm" truncate="end" color="#fff">{currentTrack?.name}</Text>
                    <Text size="xs" color="dimmed" truncate="end">{currentTrack?.artist}</Text>
                  </Stack>
                  <ActionIcon variant="subtle" color={likedTracks.some(t => t.track_id === currentTrack.track_id) ? 'violet' : 'gray'} onClick={() => toggleLike(currentTrack)} style={{ flexShrink: 0 }} className="action-icon-hover">
                    {likedTracks.some(t => t.track_id === currentTrack.track_id) ? <IconHeartFilled size={18} color="#a78bfa" /> : <IconHeart size={18} />}
                  </ActionIcon>
                </Group>
              ) : (
                <Group gap="md">
                  <Paper w={44} h={44} radius="sm" style={{ backgroundColor: '#1c1c1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconMusic size={20} color="#71717a" />
                  </Paper>
                  <Stack gap={1}>
                    <Text fw={700} size="sm" color="dimmed">No Active Track</Text>
                    <Text size="xs" color="dimmed">-</Text>
                  </Stack>
                </Group>
              )}
            </Grid.Col>

            {/* Center: Controls + Progress */}
            <Grid.Col span={4}>
              <Stack gap={6} align="center">
                <Group gap="md" align="center">
                  <ActionIcon variant="subtle" color={shuffleActive ? 'violet' : 'gray'} size="sm" onClick={() => setShuffleActive(!shuffleActive)} className={shuffleActive ? 'action-icon-active' : 'action-icon-hover'}>
                    <IconArrowsShuffle size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" size="sm" className="action-icon-hover" onClick={() => skipTrack(-1)} disabled={activeQueue.length === 0}>
                    <IconPlayerSkipBack size={18} />
                  </ActionIcon>
                  <div className="play-btn-circle" onClick={handlePlayPauseToggle}>
                    {isPlaying ? <IconPlayerPause size={22} fill="#000" /> : <IconPlayerPlay size={22} fill="#000" />}
                  </div>
                  <ActionIcon variant="subtle" color="gray" size="sm" className="action-icon-hover" onClick={() => skipTrack(1)} disabled={activeQueue.length === 0}>
                    <IconPlayerSkipForward size={18} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color={repeatActive ? 'violet' : 'gray'} size="sm" onClick={() => setRepeatActive(!repeatActive)} className={repeatActive ? 'action-icon-active' : 'action-icon-hover'}>
                    <IconRepeat size={16} />
                  </ActionIcon>
                </Group>
                <Group w="100%" gap="xs" wrap="nowrap">
                  <Text size="10px" color="dimmed" w={30} style={{ textAlign: 'right' }}>{isLocalPreview ? formatTime(currentTime) : '0:00'}</Text>
                  <Slider style={{ flexGrow: 1 }} size="xs" color="violet" value={progress} onChange={handleProgressChange} label={null} thumbSize={8} disabled={!currentTrack || !isLocalPreview} />
                  <Text size="10px" color="dimmed" w={30}>{isLocalPreview && audioRef.current?.duration ? formatTime(audioRef.current.duration) : '0:00'}</Text>
                </Group>
              </Stack>
            </Grid.Col>

            {/* Right: Volume + Fullscreen */}
            <Grid.Col span={4}>
              <Group justify="flex-end" gap="sm">
                {/* Jam button */}
                {accessToken && (
                  jamRoom ? (
                    <Badge color="violet" variant="filled" size="sm" style={{ cursor: 'pointer' }}
                      onClick={() => { const url = `${window.location.origin}${window.location.pathname}?jam=${jamRoom.room_id}`; navigator.clipboard.writeText(url); setJamLinkCopied(true); setTimeout(() => setJamLinkCopied(false), 2000); }}>
                      🎵 {jamLinkCopied ? 'Copied!' : `Jam · ${jamMemberCount}`}
                    </Badge>
                  ) : (
                    <Group gap={4}>
                      <Button size="xs" variant="light" color="violet" radius="xl" onClick={startJam} style={{ fontSize: 11, padding: '2px 10px' }}>
                        🎵 Start Jam
                      </Button>
                      <Button size="xs" variant="subtle" color="violet" radius="xl" onClick={() => setShowJamJoin(v => !v)} style={{ fontSize: 11, padding: '2px 8px' }}>
                        Join
                      </Button>
                    </Group>
                  )
                )}

                <Group gap="xs" style={{ width: 120 }}>
                  <IconVolume size={16} color="#71717a" />
                  <Slider style={{ flexGrow: 1 }} size="xs" color="violet" value={volume} onChange={handleVolumeChange} min={0} max={100} label={null} thumbSize={6} />
                </Group>
                <ActionIcon variant="subtle" color="gray" className="action-icon-hover" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                  {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
                </ActionIcon>
              </Group>
            </Grid.Col>
          </Grid>
        </Box>
      </AppShell.Footer>

      {/* SETTINGS MODAL */}
      <Modal
        opened={settingsOpened}
        onClose={closeSettings}
        title="Settings"
        centered
        styles={{
          content: { backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a' },
          header: { backgroundColor: '#18181b', color: '#fff' }
        }}
      >
        <Stack gap="md">
          <Text size="xs" color="dimmed">
            Rikupy is powered by YouTube Music. No API keys or accounts required.
          </Text>

          <Paper p="md" radius="md" style={{ backgroundColor: '#131316', border: '1px solid #27272a' }}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" color="dimmed" fw={600}>Backend</Text>
                <Badge color="green" variant="dot" size="sm">Running</Badge>
              </Group>
              <Text size="xs" color="dimmed">http://localhost:8000</Text>
            </Stack>
          </Paper>

          <Paper p="md" radius="md" style={{ backgroundColor: '#131316', border: '1px solid #27272a' }}>
            <Stack gap="xs">
              <Text size="xs" fw={700}>Streaming</Text>
              <Text size="xs" color="dimmed">Full tracks streamed via YouTube Music + yt-dlp</Text>
            </Stack>
          </Paper>

          {userProfile && (
            <Paper p="md" radius="md" style={{ backgroundColor: '#131316', border: '1px solid #27272a' }}>
              <Stack gap="xs">
                <Text size="xs" fw={700}>Account</Text>
                <Text size="xs" color="dimmed">Signed in as <strong style={{ color: '#a78bfa' }}>@{userProfile.auth_id}</strong></Text>
                <Button size="xs" color="red" variant="light" radius="xl" onClick={() => { handleLogout(); closeSettings(); }}>
                  Sign Out
                </Button>
              </Stack>
            </Paper>
          )}

          <Button color="violet" variant="light" radius="xl" size="xs" fullWidth onClick={closeSettings}>
            Close
          </Button>
        </Stack>
      </Modal>

    </AppShell>
    </>
  );
}

const formatMs = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export default App;
