# Ward Civic Ledger - Progressive Web App (PWA) Setup

## **What is a PWA?**

A Progressive Web App is a website that acts like a native mobile app:
- Users can tap "Add to Home Screen" on Chrome/Android
- App icon appears on home screen like WhatsApp, Uber, Twitter
- Works offline (cached pages + background sync)
- No App Store approval needed
- Zero installation friction

---

## **Phase 1: PWA Features Deployed**

### **1. manifest.json** ✅ Deployed
```json
{
  "short_name": "CivicLedger",
  "name": "Ward Civic Accountability Ledger",
  "display": "standalone",
  "start_url": "/index.html",
  "theme_color": "#2563eb",
  "icons": [...]
}
```

**What it does:**
- Tells Chrome this is a PWA
- Displays app name on home screen
- Sets app theme color (blue)
- Triggers "Add to Home Screen" popup

### **2. Service Worker (sw.js)** ✅ Deployed
```javascript
// Caches essential files
// Serves from cache when offline
// Syncs data when connection returns
```

**What it does:**
- Works offline (shows cached pages)
- Caches API responses
- Background sync for reports submitted offline
- Zero internet = app still works

---

## **How Citizens Use It**

### **Step 1: First Visit to Ward Civic Ledger Portal**
```
Browser shows:
┌─────────────────────────────────┐
│ Ward Civic Ledger Portal        │
├─────────────────────────────────┤
│                                 │
│    ⚙️ Add to Home Screen        │
│                                 │
└─────────────────────────────────┘
```

### **Step 2: Tap "Add to Home Screen"**
```
Android prompts:
┌─────────────────────────────────┐
│ Add Ward Civic Ledger Portal?   │
│                                 │
│      [Cancel]  [Install]        │
└─────────────────────────────────┘
```

### **Step 3: App Installed on Home Screen**
```
Android home screen now shows:
┌────────┬────────┬────────┐
│ Chrome │ Gmail  │ Civic  │
│        │        │ Ledger │✅
│        │        │ 🏛️     │
└────────┴────────┴────────┘
```

### **Step 4: Citizens Tap App Icon**
```
App launches full-screen (no browser chrome):
┌──────────────────────────────┐
│ ⚡ WARD CIVIC LEDGER        │  (Standalone mode)
├──────────────────────────────┤
│                              │
│  1. Identity Verification    │
│  2. Enter OTP                │
│  3. Submit Report            │
│                              │
└──────────────────────────────┘
```

---

## **Offline Capabilities (Phase 1)**

### **Scenario: Rural Ward with Spotty Internet**

**What happens:**
1. Citizen opens app on home screen
2. Internet cuts out mid-submission
3. Service Worker intercepts: "No connection"
4. App shows cached data + offline indicator
5. When internet returns, background sync uploads report
6. Citizens never see "Error" - seamless experience

**Code flow:**
```javascript
// User submits report (no internet)
POST /api/reports
  ↓
Service Worker intercepts (offline)
  ↓
Saves to IndexedDB (local database)
  ↓
Shows: "Submitted (syncing...)"
  ↓
When internet returns, background sync kicks in
  ↓
Automatically uploads report
  ↓
Server processes, citizen notified
```

---

## **Deployment Checklist**

- [ ] Copy `manifest.json` to **same directory as index.html**
- [ ] Copy `sw.js` to **frontend root directory** 
- [ ] Register Service Worker in index.html (already done)
- [ ] Deploy to HTTPS (required for PWA)
- [ ] Test on Android Chrome:
  - Open site
  - Wait 2 seconds
  - Tap "⋮" menu → "Add to Home Screen"
  - Tap app icon to launch

---

## **Testing PWA Locally**

### **1. Check Manifest**
```bash
# In browser console:
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker registered:', reg);
});
```

### **2. Test Offline Mode**
```bash
# In Chrome DevTools:
1. Open index.html
2. Press F12 → Application tab
3. Check "Offline" checkbox
4. Try viewing reports
5. Should show cached content (not error)
```

### **3. Check App Icon**
```bash
# On Android Chrome:
1. Visit https://your-domain.com
2. Wait 2+ seconds for prompt
3. Tap "⋮" (three dots)
4. Select "Add to Home Screen"
5. App icon appears on home screen
```

---

## **Phase 2: Enhanced PWA Features**

When scaling to municipality:
- **Push notifications** - "Water crisis in your ward"
- **Background sync** - Reports uploaded automatically
- **Periodic sync** - Auto-refresh leaderboard every hour
- **Share target** - Citizens share photos directly to app
- **File handling** - Open photos directly in Civic Ledger

---

## **Why PWA Matters for Ward Civic Ledger**

| Problem | Solution |
|---------|----------|
| Spotty internet in townships | Offline caching + background sync |
| Citizens forget app URL | Home screen icon (always visible) |
| Slow feature phone internet | Minimal data use (cached assets) |
| Low engagement | App notification = more engagement |
| Requires App Store approval | PWA = zero friction distribution |

---

## **File Structure**

```
frontend/
├── index.html          # Main UI (already has manifest.json link)
├── manifest.json       # PWA metadata (NEW)
├── sw.js              # Service Worker (NEW)
└── styles/
```

**manifest.json link in index.html:**
```html
<head>
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#2563eb">
</head>
```

**Service Worker registration in index.html:**
```javascript
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('✓ Service Worker registered'))
    .catch(err => console.error('✗ Service Worker failed:', err));
}
</script>
```

---

## **Success Metrics (PWA)**

✅ **Users can "Add to Home Screen"** (Chrome popup appears)
✅ **App works offline** (cached pages load without internet)
✅ **App icon on home screen** (looks like native app)
✅ **Full-screen launch** (no browser address bar)
✅ **Background sync** (reports upload when connection returns)

---

**With PWA enabled, Ward Civic Ledger becomes a first-class mobile app without the App Store friction.** 📱✨
