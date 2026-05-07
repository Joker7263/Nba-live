module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  // Simple session storage (in-memory, reset on redeploy)
  let isAdmin = req.headers.cookie?.includes('admin=true') || false;
  
  // Handle POST requests
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = new URLSearchParams(body);
      
      // Login
      if (params.get('login') && params.get('pass') === 'nba2024live') {
        res.setHeader('Set-Cookie', 'admin=true; path=/; max-age=86400');
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }
      
      // Logout
      if (params.get('logout')) {
        res.setHeader('Set-Cookie', 'admin=; path=/; max-age=0');
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }
      
      // Save playlist
      if (params.get('save_playlist')) {
        const playlist = params.get('playlist');
        // Store in memory (Vercel has no persistent storage)
        global.playlistContent = playlist;
        global.channels = parseM3U(playlist);
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }
      
      // Play stream
      if (params.get('play_stream')) {
        const url = params.get('stream_url');
        const name = params.get('stream_name');
        global.currentUrl = '/proxy?url=' + encodeURIComponent(url);
        global.currentName = name;
        global.isLive = true;
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }
      
      // Stop stream
      if (params.get('stop')) {
        global.isLive = false;
        global.currentUrl = '';
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }
    });
    return;
  }
  
  // Handle proxy for streams
  if (req.url.startsWith('/proxy')) {
    const url = new URL(req.url, 'http://localhost');
    const streamUrl = url.searchParams.get('url');
    if (!streamUrl) {
      res.statusCode = 400;
      res.end('No URL');
      return;
    }
    
    fetch(streamUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    .then(response => response.arrayBuffer())
    .then(data => {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(Buffer.from(data));
    })
    .catch(() => {
      res.statusCode = 500;
      res.end('Proxy error');
    });
    return;
  }
  
  // Parse M3U function
  function parseM3U(content) {
    const channels = [];
    const lines = content.split('\n');
    let currentName = '';
    
    for (let line of lines) {
      line = line.trim();
      
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:[^,]*,?(.*)/);
        currentName = (match ? match[1] : 'Unknown').replace(/[^\w\s\.\-\(\)]/g, '');
      } else if (currentName && (line.startsWith('http://') || line.startsWith('https://'))) {
        channels.push({ name: currentName, url: line });
        currentName = '';
      }
    }
    return channels;
  }
  
  // Get current data
  const channels = global.channels || [];
  const currentName = global.currentName || 'No channel';
  const isLive = global.isLive || false;
  const currentUrl = global.currentUrl || '';
  
  // Render HTML
  res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NBA Live Stream - IPTV Player</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:linear-gradient(135deg,#0a0a2a,#1a1a3e);color:#fff;font-family:'Segoe UI',Arial,sans-serif}
        .navbar{background:#000;padding:1rem 2rem;border-bottom:3px solid #f39c12;display:flex;justify-content:space-between}
        .logo{font-size:1.5rem;font-weight:bold;color:#f39c12}
        .live-badge{background:#ff0000;color:#fff;padding:5px 12px;border-radius:20px;animation:pulse 1s infinite}
        @keyframes pulse{0%{opacity:1}50%{opacity:0.5}100%{opacity:1}}
        .container{max-width:1400px;margin:0 auto;padding:20px}
        .video-container{background:#000;border-radius:15px;overflow:hidden;margin-bottom:20px;min-height:400px}
        video{width:100%;background:#000;max-height:70vh}
        .offline{background:linear-gradient(135deg,#1e3c72,#2a5298);padding:60px;text-align:center;border-radius:15px}
        .now-playing{background:#111;padding:12px;border-radius:10px;margin-bottom:15px;text-align:center}
        .channel-list{background:rgba(0,0,0,0.7);border-radius:15px;padding:20px;margin-top:20px;max-height:400px;overflow-y:auto}
        .channel-item{background:#222;margin:8px 0;padding:12px;border-radius:10px;display:flex;justify-content:space-between;align-items:center}
        .channel-item:hover{background:#333}
        .play-btn{background:#f39c12;color:#000;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:bold}
        .play-btn:hover{background:#ffed4a}
        .admin-panel{background:rgba(0,0,0,0.8);border-radius:15px;padding:20px;margin-top:20px;border:1px solid #f39c12}
        textarea{width:100%;background:#222;border:1px solid #f39c12;color:#fff;padding:12px;border-radius:8px;font-family:monospace;font-size:12px}
        input{width:100%;background:#222;border:1px solid #f39c12;color:#fff;padding:12px;border-radius:8px;margin-top:10px}
        button{background:#f39c12;color:#000;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;margin-top:10px}
        .stop-btn{background:#e74c3c;color:#fff}
        hr{border-color:#333;margin:20px 0}
        .channel-count{color:#f39c12;margin-left:10px}
        @media(max-width:768px){.logo{font-size:18px}}
    </style>
</head>
<body>

<div class="navbar">
    <div class="logo">🏀 NBA LIVE - IPTV PLAYER</div>
    <div>
        ${isLive ? '<span class="live-badge">LIVE</span>' : ''}
        ${!isAdmin ? '<button onclick="showLogin()" style="background:#f39c12;padding:5px 15px;border:none;border-radius:5px;margin-left:10px">Admin</button>' : 
          '<form method="POST" style="display:inline"><button type="submit" name="logout" style="background:#e74c3c;padding:5px 15px;border:none;border-radius:5px;color:#fff;margin-left:10px">Logout</button></form>'}
    </div>
</div>

<div class="container">
    <!-- Video Player -->
    <div class="video-container">
        ${isLive && currentUrl ? 
            '<video id="videoPlayer" controls autoplay playsinline></video>' : 
            '<div class="offline"><h3>📺 No Stream Playing</h3><p>Load M3U playlist or paste direct stream URL below</p></div>'}
    </div>

    <div class="now-playing">
        📍 NOW PLAYING: <strong>${currentName}</strong>
    </div>

    <!-- Channel List -->
    ${channels.length > 0 ? `
    <div class="channel-list">
        <h3>📡 Channels <span class="channel-count">(${channels.length})</span></h3>
        ${channels.map(ch => `
        <div class="channel-item">
            <span>${escapeHtml(ch.name)}</span>
            ${isAdmin ? 
                `<form method="POST" style="margin:0">
                    <input type="hidden" name="stream_url" value="${escapeAttr(ch.url)}">
                    <input type="hidden" name="stream_name" value="${escapeAttr(ch.name)}">
                    <button type="submit" name="play_stream" class="play-btn">▶ PLAY</button>
                </form>` : 
                '<span class="play-btn" style="background:#555;cursor:not-allowed">Login to Play</span>'}
        </div>
        `).join('')}
    </div>
    ` : ''}

    <!-- Admin Panel -->
    ${isAdmin ? `
    <div class="admin-panel">
        <h3>🔧 ADMIN PANEL</h3>
        
        <form method="POST">
            <h4>Option 1: Paste M3U Playlist</h4>
            <textarea name="playlist" rows="8" placeholder="#EXTM3U&#10;#EXTINF:-1,NBA LIVE&#10;http://206.212.244.183:25461/live/4abYcSzugD/7732488130/23211.m3u8?token=..."></textarea>
            <button type="submit" name="save_playlist">💾 Save Playlist</button>
        </form>
        
        <hr>
        
        <form method="POST">
            <h4>Option 2: Direct Stream URL (with token)</h4>
            <input type="text" name="stream_url" placeholder="http://... .m3u8 or .mpd" required>
            <input type="text" name="stream_name" placeholder="Channel name (optional)">
            <button type="submit" name="play_stream">🎬 Play Stream</button>
        </form>
        
        ${isLive ? `
        <form method="POST">
            <button type="submit" name="stop" class="stop-btn">⏹ Stop Stream</button>
        </form>
        ` : ''}
        
        <div style="margin-top:20px;padding:15px;background:#222;border-radius:10px">
            <strong>📖 Instructions:</strong>
            <ol style="margin-left:20px;margin-top:10px">
                <li>Paste your M3U playlist content (like the one with NBA LIVE)</li>
                <li>Click Save Playlist - channels will appear above</li>
                <li>Click PLAY on any channel</li>
                <li>Supports .m3u8 (HLS) and .mpd (DASH)</li>
            </ol>
        </div>
    </div>
    ` : ''}
</div>

<!-- Login Modal -->
<div id="loginModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:1000">
    <div style="background:#222;margin:20% auto;width:350px;padding:25px;border-radius:15px;border:1px solid #f39c12">
        <h3 style="color:#f39c12">Admin Login</h3>
        <form method="POST">
            <input type="password" name="pass" placeholder="Password" style="width:100%;padding:12px;margin:15px 0;background:#333;border:1px solid #f39c12;color:#fff;border-radius:8px" required>
            <button type="submit" name="login" style="width:100%;padding:12px">Login</button>
            <button type="button" onclick="closeLogin()" style="width:100%;margin-top:10px;background:#555">Cancel</button>
        </form>
    </div>
</div>

<script>
let video = document.getElementById('videoPlayer');
let hls = null;

function initPlayer(url) {
    if (hls) { hls.destroy(); hls = null; }
    if (!video) return;
    
    video.removeAttribute('src');
    video.load();
    
    if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
            hls = new Hls({ debug: false });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            hls.on(Hls.Events.ERROR, (e, d) => console.error('HLS Error:', d));
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play();
        }
    } else {
        video.src = url;
        video.play();
    }
}

${isLive && currentUrl ? `initPlayer('${currentUrl}');` : ''}

function showLogin() {
    document.getElementById('loginModal').style.display = 'block';
}
function closeLogin() {
    document.getElementById('loginModal').style.display = 'none';
}

function escapeHtml(text) {
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
</script>
</body>
</html>`);
  
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
  
  function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};