// ==== Firebase imports ====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  getFirestore, collection, collectionGroup, doc, addDoc, setDoc, getDoc, getDocs,
  onSnapshot, serverTimestamp, query, orderBy, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// ==== Config ====
const firebaseConfig = {
  apiKey: "AIzaSyB1vs_NTPr1Z524r7nmAA6o8YU8mrUwBGg",
  authDomain: "discord-a8797.firebaseapp.com",
  projectId: "discord-a8797",
  appId: "1:720230156937:web:8669ee2d96b7c0c06fd458"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==== DOM helpers ====
const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const roomListEl = $("#room-list");
const messageInput = $("#message-input");
const sendBtn = $("#send-btn");
const currentRoomEl = $("#current-room");
const roomOwnerHint = $("#room-owner-hint");

const friendsBtn = $("#friends-btn");
const friendsDrawer = $("#friends-drawer");
const closeFriends = $("#close-friends");
const userListEl = $("#user-list");
const requestListEl = $("#request-list");
const friendsListEl = $("#friends-list");
const badgeRequests = $("#badge-requests");

let state = {
  user: null,
  currentRoomId: null,
  unsubMessages: null,
  unsubRooms: null,
  unsubRequests: null,
  unsubFriends: null,
  lastVisibilityChange: Date.now()
};

// ===== Anim helpers =====
function bounce(el) {
  el.classList.remove("animate-ping");
  void el.offsetWidth;
  el.classList.add("animate-ping");
}

// ===== Notifications (Web Notifications API) =====
function askNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(()=>{});
  }
}
function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted" && document.visibilityState === "hidden") {
    new Notification(title, { body });
  }
}
document.addEventListener("visibilitychange", () => {
  state.lastVisibilityChange = Date.now();
});

// ===== Auth UI =====
function renderAuthArea(user) {
  const el = $("#auth-area");
  if (!user) {
    el.innerHTML = `
      <div class="flex items-center gap-2">
        <button id="signin-google" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Google</button>
        <details class="relative">
          <summary class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 cursor-pointer select-none">Email</summary>
          <form id="email-form" class="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
            <input id="email" type="email" required placeholder="Email" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />
            <input id="pwd" type="password" required placeholder="Mot de passe" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />
            <div class="flex gap-2">
              <button data-mode="signin" class="flex-1 px-2 py-1 rounded-lg bg-indigo-600">Connexion</button>
              <button data-mode="signup" class="flex-1 px-2 py-1 rounded-lg bg-zinc-700">Créer</button>
            </div>
          </form>
        </details>
      </div>
    `;
    $("#signin-google").onclick = async () => {
      try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e){ alert(e.message); }
    };
    const f = $("#email-form");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const email = f.querySelector("#email").value;
      const pwd = f.querySelector("#pwd").value;
      const mode = ev.submitter?.dataset.mode;
      try {
        if (mode === "signup") await createUserWithEmailAndPassword(auth, email, pwd);
        else await signInWithEmailAndPassword(auth, email, pwd);
      } catch (e) { alert(e.message); }
    };
  } else {
    el.innerHTML = `
      <img src="${user.photoURL || 'https://i.pravatar.cc/40'}" class="h-8 w-8 rounded-full">
      <span class="text-xs text-zinc-400">${user.displayName || user.email}</span>
      <button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Déconnexion</button>
    `;
    $("#signout").onclick = () => signOut(auth);
  }
}

// ===== Profiles =====
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const pseudo = prompt("Choisis ton pseudo :") || user.displayName || "Utilisateur";
    const photo = user.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(pseudo)}`;
    await setDoc(ref, {
      uid: user.uid, displayName: pseudo, photoURL: photo, createdAt: serverTimestamp()
    });
    await updateProfile(user, { displayName: pseudo, photoURL: photo });
  }
}

// ===== Rooms (public, creator can delete) =====
const newRoomBtn = $("#new-room-btn");
newRoomBtn.onclick = async () => {
  if (!state.user) return alert("Connecte-toi d’abord.");
  const name = prompt("Nom du salon ? (ex: test)");
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-") || crypto.randomUUID().slice(0,8);
  await setDoc(doc(db, "rooms", id), {
    name, ownerUid: state.user.uid, createdAt: serverTimestamp()
  });
};

function listenRooms() {
  if (state.unsubRooms) state.unsubRooms();
  state.unsubRooms = onSnapshot(collection(db, "rooms"), (snap) => {
    roomListEl.innerHTML = "";
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    items.sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
    for (const r of items) {
      const li = document.createElement("li");
      li.className = "anim-fade-up";
      li.innerHTML = `
        <div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">
          <button class="flex-1 text-left" data-join="${r.id}">
            <div class="text-sm font-medium"># ${r.name || r.id}</div>
            <div class="text-[11px] text-zinc-500">${r.ownerUid === state.user?.uid ? "Créé par toi" : "Public"}</div>
          </button>
          ${r.ownerUid === state.user?.uid ? `
            <button title="Supprimer" data-del="${r.id}" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition">🗑</button>
          ` : ""}
        </div>
      `;
      li.querySelector(`[data-join="${r.id}"]`).onclick = () => joinRoom(r.id, r.name, r.ownerUid);
      if (r.ownerUid === state.user?.uid) {
        li.querySelector(`[data-del="${r.id}"]`).onclick = async () => {
          if (confirm(`Supprimer le salon #${r.name} ?\n(tout le monde perdra l’historique)`)) {
            // Firestore Rules empêcheront la suppression si ce n’est pas l’owner
            await deleteDoc(doc(db, "rooms", r.id));
          }
        };
      }
      roomListEl.appendChild(li);
    }
  });
}

async function joinRoom(roomId, roomName, ownerUid) {
  state.currentRoomId = roomId;
  currentRoomEl.textContent = roomName || roomId;
  roomOwnerHint.textContent = ownerUid === state.user?.uid ? "Vous êtes le propriétaire de ce salon" : "";

  // Unsub previous
  if (state.unsubMessages) state.unsubMessages();
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
  state.unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const row = document.createElement("div");
      row.className = "flex items-start gap-3 anim-fade-up";
      const avatar = `<img src="${m.user.photoURL}" class="h-8 w-8 rounded-full">`;
      const time = m.createdAt?.toDate ? new Date(m.createdAt.toDate()).toLocaleTimeString() : "";
      row.innerHTML = `
        ${avatar}
        <div class="bg-zinc-800 rounded-2xl px-4 py-2 max-w-[85%] transition">
          <div class="text-xs text-zinc-400">${m.user.name} • ${time}</div>
          <div class="text-sm whitespace-pre-wrap break-words">${m.body}</div>
        </div>
      `;
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ===== Send message =====
$("#message-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user || !state.currentRoomId) return;
  const text = messageInput.value.trim();
  if (!text) return;
  sendBtn.disabled = true; setTimeout(()=> sendBtn.disabled=false, 500);

  const profile = (await getDoc(doc(db, "users", state.user.uid))).data();
  await addDoc(collection(db, "rooms", state.currentRoomId, "messages"), {
    body: text,
    createdAt: serverTimestamp(),
    roomId: state.currentRoomId,
    user: { uid: state.user.uid, name: profile.displayName, photoURL: profile.photoURL }
  });
  messageInput.value = "";
});

// ===== Global notifications: messages & friend requests =====
// (1) Messages (tous salons) → via collectionGroup
function listenAllMessagesNotifications() {
  // Écoute tous les messages, notifie si page en arrière-plan et auteur ≠ moi
  const q = query(collectionGroup(db, "messages"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      const m = ch.doc.data();
      if (!m?.user?.uid || !state.user) return;
      if (m.user.uid === state.user.uid) return;
      // Réduire le bruit : ne notifier que si l’onglet est caché et message récent
      const t = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : Date.now();
      if (document.visibilityState === "hidden" && t >= state.lastVisibilityChange - 2000) {
        notify(`Nouveau message dans #${m.roomId}`, `${m.user.name}: ${m.body}`);
      }
    });
  });
}

// (2) Friend requests (pour l’utilisateur courant)
function listenFriendRequests(uid) {
  if (state.unsubRequests) state.unsubRequests();
  state.unsubRequests = onSnapshot(collection(db, "users", uid, "friendRequests"), (snap) => {
    requestListEl.innerHTML = "";
    const count = snap.size;
    badgeRequests.textContent = String(count);
    badgeRequests.classList.toggle("hidden", count === 0);
    snap.forEach(async (d) => {
      const fromUid = d.id;
      const u = (await getDoc(doc(db, "users", fromUid))).data();
      const li = document.createElement("li");
      li.className = "anim-fade-up";
      li.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">
          <img src="${u?.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u?.displayName || fromUid}</div>
          <button data-accept="${fromUid}" class="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 transition">Accepter</button>
        </div>`;
      li.querySelector(`[data-accept="${fromUid}"]`).onclick = () => acceptFriendRequest(fromUid);
      requestListEl.appendChild(li);
      notify("Nouvelle demande d’ami", `${u?.displayName || "Un utilisateur"} souhaite vous ajouter`);
    });
  });
}

// Friends list
function listenFriends(uid) {
  if (state.unsubFriends) state.unsubFriends();
  state.unsubFriends = onSnapshot(collection(db, "users", uid, "friends"), async (snap) => {
    friendsListEl.innerHTML = "";
    for (const d of snap.docs) {
      const friendUid = d.id;
      const u = (await getDoc(doc(db, "users", friendUid))).data();
      const li = document.createElement("li");
      li.className = "anim-fade-up";
      li.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">
          <img src="${u?.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u?.displayName || friendUid}</div>
        </div>`;
      friendsListEl.appendChild(li);
    }
  });
}

// Friends drawer open/close
friendsBtn.onclick = () => {
  friendsDrawer.classList.remove("hidden");
  askNotificationPermission();
};
closeFriends.onclick = () => friendsDrawer.classList.add("hidden");

// Users list to add friends
function loadAllUsers() {
  onSnapshot(collection(db, "users"), (snap) => {
    userListEl.innerHTML = "";
    snap.forEach((d) => {
      const u = d.data();
      if (!u.displayName) return;
      const li = document.createElement("li");
      li.className = "anim-fade-up";
      li.innerHTML = `
        <div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer transition">
          <img src="${u.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u.displayName}</div>
          ${u.uid !== state.user?.uid ? `<button data-add="${u.uid}" class="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:underline transition">+ Ami</button>` : ""}
        </div>`;
      if (u.uid !== state.user?.uid) {
        li.querySelector(`[data-add="${u.uid}"]`).onclick = () => sendFriendRequest(u.uid);
      }
      userListEl.appendChild(li);
    });
  });
}

// ===== Friends actions =====
async function sendFriendRequest(targetUid) {
  if (!state.user) return alert("Connecte-toi d’abord.");
  if (targetUid === state.user.uid) return alert("Impossible de t’ajouter toi-même 😅");
  await setDoc(doc(db, "users", targetUid, "friendRequests", state.user.uid), {
    from: state.user.uid, sentAt: serverTimestamp()
  });
  alert("Demande envoyée !");
}
async function acceptFriendRequest(fromUid) {
  const me = state.user.uid;
  await Promise.all([
    setDoc(doc(db, "users", me, "friends", fromUid), { since: serverTimestamp() }),
    setDoc(doc(db, "users", fromUid, "friends", me), { since: serverTimestamp() }),
    deleteDoc(doc(db, "users", me, "friendRequests", fromUid))
  ]);
}

// ===== Auth flow =====
onAuthStateChanged(auth, async (u) => {
  state.user = u;
  renderAuthArea(u);
  if (u) {
    askNotificationPermission();
    await ensureUserProfile(u);
    listenRooms();
    loadAllUsers();
    listenFriendRequests(u.uid);
    listenFriends(u.uid);
    listenAllMessagesNotifications();
  } else {
    // reset UI
    roomListEl.innerHTML = "";
    messagesEl.innerHTML = "";
    requestListEl.innerHTML = "";
    friendsListEl.innerHTML = "";
    badgeRequests.classList.add("hidden");
  }
});
