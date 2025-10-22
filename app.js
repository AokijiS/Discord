// ==== Firebase imports ====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  getFirestore, collection, collectionGroup, doc, addDoc, setDoc, getDoc, getDocs, updateDoc,
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
const roomListEl = $("#room-list");
const messagesEl = $("#messages");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const sendBtn = $("#send-btn");
const currentRoomEl = $("#current-room");
const roomOwnerHint = $("#room-owner-hint");

const newRoomBtn = $("#new-room-btn");
const roomPopup = $("#room-popup");
const createBtn = $("#create-room");
const roomNameInput = $("#room-name");
const roomPrivate = $("#room-private");
const friendSelect = $("#friend-select");

// (facultatif si tu as le panneau amis dans ton HTML)
// const friendsBtn = $("#friends-btn");
// const friendsDrawer = $("#friends-drawer");
// const closeFriends = $("#close-friends");
// const userListEl = $("#user-list");
// const requestListEl = $("#request-list");
// const friendsListEl = $("#friends-list");
// const badgeRequests = $("#badge-requests");

// ==== State global ====
let state = {
  user: null,
  profile: null,          // cache du profil { displayName, photoURL, ... }
  currentRoomId: null,
  unsubRooms: null,
  unsubMessages: null,
  lastVisibilityChange: Date.now()
};

// ==== Utils ====
const sanitize = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const smoothScrollBottom = (el) => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });

// Notifications (onglet en arrière-plan)
function askNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
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

// ==== Auth UI ====
function renderAuthArea(user) {
  const el = $("#auth-area");
  if (!el) return;

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
      try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert(e.message); }
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
      <img src="${user.photoURL || 'https://i.pravatar.cc/40'}" class="h-8 w-8 rounded-full" />
      <span class="text-xs text-zinc-400">${user.displayName || user.email}</span>
      <button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Quitter</button>
    `;
    $("#signout").onclick = () => signOut(auth);
  }
}

// ==== Profil utilisateur ====
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const pseudo = prompt("Choisis ton pseudo :") || user.displayName || "Utilisateur";
    const photo = user.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(pseudo)}`;
    await setDoc(ref, {
      uid: user.uid,
      displayName: pseudo,
      photoURL: photo,
      createdAt: serverTimestamp(),
    });
    await updateProfile(user, { displayName: pseudo, photoURL: photo });
    state.profile = { displayName: pseudo, photoURL: photo, uid: user.uid };
  } else {
    const data = snap.data();
    state.profile = { displayName: data.displayName, photoURL: data.photoURL, uid: user.uid };
  }
}

// ==== Salon global (test) ====
async function ensureGlobalRoom() {
  const ref = doc(db, "rooms", "global");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: "test",
      ownerUid: "system",
      createdAt: serverTimestamp(),
      private: false,
      members: [] // public → lecture/écriture autorisées selon rules
    });
  } else {
    // normaliser d'anciens docs incomplets
    const r = snap.data();
    const fix = {};
    if (!("private" in r)) fix.private = false;
    if (!("members" in r)) fix.members = [];
    if (Object.keys(fix).length) await updateDoc(ref, fix);
  }
}

// ==== Création de salon (public/privé avec amis) ====
newRoomBtn?.addEventListener("click", () => {
  if (!state.user) return alert("Connecte-toi d’abord.");
  roomPopup?.classList.toggle("hidden");
  friendSelect?.classList.add("hidden");
  roomNameInput.value = "";
  roomPrivate.checked = false;
});

roomPrivate?.addEventListener("change", () => {
  if (roomPrivate.checked) {
    friendSelect.classList.remove("hidden");
    loadFriendSelection();
  } else {
    friendSelect.classList.add("hidden");
  }
});

async function loadFriendSelection() {
  if (!friendSelect) return;
  friendSelect.innerHTML = "<div class='text-xs text-zinc-500'>Chargement…</div>";
  try {
    const snap = await getDocs(collection(db, "users", state.user.uid, "friends"));
    if (snap.empty) {
      friendSelect.innerHTML = `<div class="text-zinc-500 text-xs italic">Aucun ami</div>`;
      return;
    }
    friendSelect.innerHTML = "";
    for (const d of snap.docs) {
      const fid = d.id;
      const u = (await getDoc(doc(db, "users", fid))).data();
      const line = document.createElement("div");
      line.innerHTML = `<label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" value="${fid}">
        <span>${u.displayName}</span>
      </label>`;
      friendSelect.appendChild(line);
    }
  } catch (e) {
    friendSelect.innerHTML = `<div class='text-red-500 text-xs'>Erreur: ${e.message}</div>`;
  }
}

createBtn?.addEventListener("click", async () => {
  if (!state.user) return alert("Connecte-toi d’abord !");
  const name = roomNameInput.value.trim() || "sans-nom";
  const id = crypto.randomUUID().slice(0, 8);
  const members = [state.user.uid]; // le créateur est toujours membre

  if (roomPrivate.checked) {
    const selected = [...friendSelect.querySelectorAll("input[type=checkbox]:checked")].map(c => c.value);
    if (selected.length === 0) {
      alert("Sélectionne au moins un ami pour créer un salon privé.");
      return;
    }
    members.push(...selected);
  }

  try {
    await setDoc(doc(db, "rooms", id), {
      name,
      ownerUid: state.user.uid,
      createdAt: serverTimestamp(),
      private: !!roomPrivate.checked,
      members
    });
    roomPopup.classList.add("hidden");
  } catch (e) {
    alert("Erreur création du salon: " + e.message);
  }
});

// ==== Liste des salons ====
function listenRooms() {
  if (state.unsubRooms) state.unsubRooms();

  const roomsRef = collection(db, "rooms");
  state.unsubRooms = onSnapshot(roomsRef, (snap) => {
    roomListEl.innerHTML = "";
    if (snap.empty) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3 italic'>Aucun salon trouvé</div>";
      return;
    }

    const items = [];
    snap.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));

    // Tri par nom
    items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

    for (const r of items) {
      // visibilité : public pour tous, privé seulement si membre
      const isMember = Array.isArray(r.members) && state.user && r.members.includes(state.user.uid);
      const visible = !r.private || isMember;
      if (!visible) continue;

      const li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML = `
        <div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">
          <button class="flex-1 text-left" data-join="${r.id}">
            <div class="text-sm font-medium"># ${r.name || r.id}</div>
            <div class="text-[11px] text-zinc-500">${r.private ? "Privé" : "Public"}</div>
          </button>
          ${r.ownerUid === state.user?.uid ? `
            <button data-del="${r.id}" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition">🗑</button>
          ` : ""}
        </div>
      `;
      li.querySelector(`[data-join="${r.id}"]`).onclick = () => joinRoom(r.id, r.name, r.ownerUid);
      if (r.ownerUid === state.user?.uid) {
        li.querySelector(`[data-del="${r.id}"]`).onclick = async () => {
          if (confirm(`Supprimer le salon "${r.name}" ?`)) {
            try { await deleteDoc(doc(db, "rooms", r.id)); } catch (e) { alert(e.message); }
          }
        };
      }
      roomListEl.appendChild(li);
    }

    if (!roomListEl.children.length) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3 italic'>Aucun salon visible</div>";
    }
  }, (err) => {
    console.error("❌ Erreur snapshot rooms:", err);
    roomListEl.innerHTML = `<div class="text-red-500 text-sm p-3">Erreur Firestore: ${err.message}</div>`;
  });
}

// ==== Rejoindre un salon & écouter ses messages ====
async function joinRoom(roomId, roomName, ownerUid) {
  state.currentRoomId = roomId;
  currentRoomEl.textContent = roomName || roomId;
  roomOwnerHint.textContent = ownerUid === state.user?.uid ? "Propriétaire" : "";
  localStorage.setItem("lastRoom", roomId);

  // stop ancien listener
  if (state.unsubMessages) state.unsubMessages();

  // feedback UI
  messagesEl.innerHTML = "<div class='text-zinc-500 text-sm p-3 italic'>Chargement des messages…</div>";

  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
  state.unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    if (snap.empty) {
      messagesEl.innerHTML = "<div class='text-zinc-500 text-sm p-3 italic'>Aucun message (encore)</div>";
      return;
    }
    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const row = document.createElement("div");
      row.className = "flex items-start gap-3 fadeUp";
      const time = m.createdAt?.toDate ? new Date(m.createdAt.toDate()).toLocaleTimeString() : "";
      row.innerHTML = `
        <img src="${m.user.photoURL}" class="h-8 w-8 rounded-full" />
        <div class="bg-zinc-800 rounded-2xl px-4 py-2 max-w-[85%]">
          <div class="text-xs text-zinc-400">${m.user.name} • ${time}</div>
          <div class="text-sm whitespace-pre-wrap break-words">${sanitize(m.body)}</div>
        </div>
      `;
      messagesEl.appendChild(row);
    });
    smoothScrollBottom(messagesEl);
  }, (err) => {
    console.error("❌ Erreur snapshot messages:", err);
    messagesEl.innerHTML = `<div class="text-red-500 text-sm p-3">Erreur Firestore: ${err.message}</div>`;
  });
}

// ==== Envoi d'un message (UN SEUL handler) ====
messageInput.addEventListener("input", () => {
  sendBtn.disabled = messageInput.value.trim().length === 0;
});

messageForm.onsubmit = async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  if (!state.user || !state.currentRoomId) {
    alert("Sélectionne d’abord un salon !");
    return;
  }

  sendBtn.disabled = true;
  setTimeout(() => (sendBtn.disabled = false), 400);

  try {
    const me = state.user;
    const profile = state.profile || {
      displayName: me.displayName || me.email,
      photoURL: me.photoURL || "https://i.pravatar.cc/40",
      uid: me.uid
    };

    await addDoc(collection(db, "rooms", state.currentRoomId, "messages"), {
      body: sanitize(text),
      createdAt: serverTimestamp(),
      roomId: state.currentRoomId,
      user: { uid: profile.uid, name: profile.displayName, photoURL: profile.photoURL }
    });

    messageInput.value = "";
    messageInput.focus();
  } catch (err) {
    console.error("Erreur envoi message:", err);
    alert("Erreur : " + err.message);
  }
};

// ==== Notifications (nouveaux messages) globales ====
function listenAllMessagesNotifications() {
  const q = query(collectionGroup(db, "messages"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      const m = ch.doc.data();
      if (!state.user || m.user?.uid === state.user.uid) return;
      const t = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : Date.now();
      if (document.visibilityState === "hidden" && t >= state.lastVisibilityChange - 3000) {
        notify(`Nouveau message`, `${m.user?.name || "Quelqu’un"}: ${m.body}`);
      }
    });
  });
}

// ==== Auth flow ====
onAuthStateChanged(auth, async (u) => {
  state.user = u;
  renderAuthArea(u);

  if (u) {
    askNotificationPermission();
    await ensureUserProfile(u);
    await ensureGlobalRoom();     // on s'assure que "test" existe
    listenRooms();                // afficher salons
    // restaurer dernier salon si dispo
    const last = localStorage.getItem("lastRoom");
    if (last) {
      // on essaie d’en déduire le nom (sinon id)
      const snap = await getDoc(doc(db, "rooms", last));
      const name = snap.exists() ? (snap.data().name || last) : last;
      joinRoom(last, name, snap.data()?.ownerUid);
    }
    listenAllMessagesNotifications();
  } else {
    // reset UI
    if (state.unsubRooms) state.unsubRooms();
    if (state.unsubMessages) state.unsubMessages();
    roomListEl.innerHTML = "";
    messagesEl.innerHTML = "";
    currentRoomEl.textContent = "(aucun)";
    roomOwnerHint.textContent = "";
  }
});
// ==== Initial setup ====
renderAuthArea(null); // par défaut pas connecté  