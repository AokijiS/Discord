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

const newRoomBtn = $("#new-room-btn");
const roomPopup = $("#room-popup");
const createBtn = $("#create-room");
const roomNameInput = $("#room-name");
const roomPrivate = $("#room-private");
const friendSelect = $("#friend-select");

let state = {
  user: null,
  currentRoomId: null,
  unsubMessages: null,
  unsubRooms: null,
  unsubRequests: null,
  unsubFriends: null,
  lastVisibilityChange: Date.now()
};

// ===== Notifications =====
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
      <button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Quitter</button>
    `;
    $("#signout").onclick = () => signOut(auth);
  }
}

// ===== Profile =====
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

// ===== Salons publics & privés =====
newRoomBtn.onclick = () => {
  if (!state.user) return alert("Connecte-toi d’abord.");
  roomPopup.classList.toggle("hidden");
  friendSelect.classList.add("hidden");
  roomNameInput.value = "";
  roomPrivate.checked = false;
};
roomPrivate.onchange = () => {
  if (roomPrivate.checked) {
    friendSelect.classList.remove("hidden");
    loadFriendSelection();
  } else {
    friendSelect.classList.add("hidden");
  }
};
async function loadFriendSelection() {
  friendSelect.innerHTML = "";
  const snap = await getDocs(collection(db, "users", state.user.uid, "friends"));
  if (snap.empty) {
    friendSelect.innerHTML = `<div class="text-zinc-500 text-xs italic">Aucun ami</div>`;
    return;
  }
  snap.forEach(async (d) => {
    const fid = d.id;
    const u = (await getDoc(doc(db, "users", fid))).data();
    const line = document.createElement("div");
    line.innerHTML = `<label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" value="${fid}">
      <span>${u.displayName}</span>
    </label>`;
    friendSelect.appendChild(line);
  });
}
createBtn.onclick = async () => {
  const name = roomNameInput.value.trim() || "sans-nom";
  const id = crypto.randomUUID().slice(0, 8);
  const members = [state.user.uid];
  if (roomPrivate.checked) {
    friendSelect.querySelectorAll("input[type=checkbox]:checked").forEach(c => members.push(c.value));
  }
  await setDoc(doc(db, "rooms", id), {
    name, ownerUid: state.user.uid,
    createdAt: serverTimestamp(),
    private: roomPrivate.checked,
    members
  });
  roomPopup.classList.add("hidden");
};

// ===== Listen Rooms =====

function listenRooms() {
  if (state.unsubRooms) state.unsubRooms();
  
  const roomsRef = collection(db, "rooms");
  state.unsubRooms = onSnapshot(roomsRef, (snap) => {
    // Si pas connecté, on n'affiche rien
    if (!state.user) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3'>Connecte-toi pour voir les salons</div>";
      return;
    }

    // Réinitialise la liste
    roomListEl.innerHTML = "";

    if (snap.empty) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3 italic'>Aucun salon pour le moment</div>";
      return;
    }

    snap.forEach((docSnap) => {
      const r = docSnap.data();
      const roomId = docSnap.id;

      // Vérifie la visibilité
      const isMember = Array.isArray(r.members) && r.members.includes(state.user.uid);
      const visible = !r.private || isMember;
      if (!visible) return;

      const li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML = `
        <div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">
          <button class="flex-1 text-left" data-join="${roomId}">
            <div class="text-sm font-medium"># ${r.name}</div>
            <div class="text-[11px] text-zinc-500">${r.private ? "Privé" : "Public"}</div>
          </button>
          ${r.ownerUid === state.user.uid ? `
            <button data-del="${roomId}" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition">🗑</button>
          ` : ""}
        </div>
      `;

      // Rejoindre le salon
      li.querySelector(`[data-join="${roomId}"]`).onclick = () => joinRoom(roomId, r.name, r.ownerUid);

      // Supprimer (si owner)
      if (r.ownerUid === state.user.uid) {
        li.querySelector(`[data-del="${roomId}"]`).onclick = async () => {
          if (confirm(`Supprimer le salon "${r.name}" ?`)) {
            await deleteDoc(doc(db, "rooms", roomId));
          }
        };
      }

      roomListEl.appendChild(li);
    });
  }, (err) => {
    console.error("Erreur snapshot rooms:", err);
  });
}


// ===== Join & listen messages =====

async function joinRoom(roomId, roomName, ownerUid) {
  state.currentRoomId = roomId;
  currentRoomEl.textContent = roomName  || roomId;
  await ensureMessagesSubcollection(roomId);
  roomOwnerHint.textContent = ownerUid === state.user?.uid ? "Propriétaire" : "";
  if (state.unsubMessages) state.unsubMessages();
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
  state.unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const row = document.createElement("div");
      row.className = "flex items-start gap-3 fadeUp";
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

// ===== Envoi de message =====
const text = messageInput.value.trim();


$("#message-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  console.log("Message tapé:", text);

  if (!state.user || !state.currentRoomId) return;


  if (!text) return;

  sendBtn.disabled = true;
  setTimeout(() => sendBtn.disabled = false, 400);

  try {
    // On lit le profil depuis le cache (pas Firestore à chaque fois)
    const profile = state.profile || 
      (await getDoc(doc(db, "users", state.user.uid))).data();

    // On nettoie le message pour éviter les injections HTML
    const sanitized = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    await addDoc(collection(db, "rooms", state.currentRoomId, "messages"), {
      body: sanitized,
      createdAt: serverTimestamp(),
      roomId: state.currentRoomId,
      user: {
        uid: state.user.uid,
        name: profile.displayName || state.user.displayName || state.user.email,
        photoURL: profile.photoURL || state.user.photoURL || "https://i.pravatar.cc/40"
      }
    });

    messageInput.value = "";
  } catch (err) {
    console.error("Erreur envoi message:", err);
    alert("Erreur : " + err.message);
  }
});
;

// ===== Notifications =====
function listenAllMessagesNotifications() {
  const q = query(collectionGroup(db, "messages"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      const m = ch.doc.data();
      if (!state.user || m.user.uid === state.user.uid) return;
      const t = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : Date.now();
      if (document.visibilityState === "hidden" && t >= state.lastVisibilityChange - 3000) {
        notify(`Nouveau message dans #${m.roomId}`, `${m.user.name}: ${m.body}`);
      }
    });
  });
}

// ===== Amis =====
friendsBtn.onclick = () => { friendsDrawer.classList.remove("hidden"); askNotificationPermission(); };
closeFriends.onclick = () => friendsDrawer.classList.add("hidden");

async function sendFriendRequest(targetUid) {
  if (!state.user) return alert("Connecte-toi d’abord !");
  if (targetUid === state.user.uid) return alert("Tu ne peux pas t’ajouter toi-même !");
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

// === UI amis ===
function loadAllUsers() {
  onSnapshot(collection(db, "users"), (snap) => {
    userListEl.innerHTML = "";
    snap.forEach((d) => {
      const u = d.data();
      if (!u.displayName) return;
      const li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML = `
        <div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">
          <img src="${u.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u.displayName}</div>
          ${u.uid !== state.user?.uid ? `<button data-add="${u.uid}" class="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:underline">+ Ami</button>` : ""}
        </div>`;
      if (u.uid !== state.user?.uid) li.querySelector(`[data-add="${u.uid}"]`).onclick = () => sendFriendRequest(u.uid);
      userListEl.appendChild(li);
    });
  });
}
function listenFriendRequests(uid) {
  if (state.unsubRequests) state.unsubRequests();
  state.unsubRequests = onSnapshot(collection(db, "users", uid, "friendRequests"), async (snap) => {
    requestListEl.innerHTML = "";
    badgeRequests.textContent = snap.size;
    badgeRequests.classList.toggle("hidden", snap.size === 0);
    for (const d of snap.docs) {
      const u = (await getDoc(doc(db, "users", d.id))).data();
      const li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">
          <img src="${u.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u.displayName}</div>
          <button data-acc="${u.uid}" class="px-2 py-1 text-xs bg-indigo-600 rounded">Accepter</button>
        </div>`;
      li.querySelector(`[data-acc="${u.uid}"]`).onclick = () => acceptFriendRequest(u.uid);
      requestListEl.appendChild(li);
      notify("Nouvelle demande d’ami", `${u.displayName} souhaite t’ajouter`);
    }
  });
}
function listenFriends(uid) {
  if (state.unsubFriends) state.unsubFriends();
  state.unsubFriends = onSnapshot(collection(db, "users", uid, "friends"), async (snap) => {
    friendsListEl.innerHTML = "";
    for (const d of snap.docs) {
      const u = (await getDoc(doc(db, "users", d.id))).data();
      const li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">
          <img src="${u.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u.displayName}</div>
        </div>`;
      friendsListEl.appendChild(li);
    }
  });
}

// ===== Auth flow =====
onAuthStateChanged(auth, async (u) => {
  state.user = u;
  renderAuthArea(u);
  if (u) {
    renderAuthArea(u);
    askNotificationPermission();
    await ensureUserProfile(u);
    listenRooms();
    loadAllUsers();
    listenFriendRequests(u.uid);
    listenFriends(u.uid);
    listenAllMessagesNotifications();
  } else {
    roomListEl.innerHTML = "";
    messagesEl.innerHTML = "";
    userListEl.innerHTML = "";
    requestListEl.innerHTML = "";
    friendsListEl.innerHTML = "";
  }
});


// === Crée une sous-collection messages dans un salon si elle n'existe pas ===
async function ensureMessagesSubcollection(roomId) {
  const roomRef = collection(db, "rooms", roomId, "messages");

  try {
    // On ajoute un message "système" temporaire uniquement si vide
    const snap = await getDocs(roomRef);
    if (snap.empty) {
      await addDoc(roomRef, {
        body: "Salon initialisé automatiquement ✅",
        createdAt: serverTimestamp(),
        roomId,
        user: {
          uid: "system",
          name: "Bot Système",
          photoURL: "https://i.pravatar.cc/40?u=system"
        }
      });
      console.log(`🟢 Sous-collection 'messages' créée pour ${roomId}`);
    } else {
      console.log(`✅ Sous-collection 'messages' déjà existante pour ${roomId}`);
    }
  } catch (err) {
    console.error("❌ Erreur création sous-collection messages:", err);
  }
}


async function createRandomCollection() {
  const randomName = "test_" + Math.random().toString(36).substring(2, 8);
  const docRef = doc(db, "rooms", randomName);
  await setDoc(docRef, {
    name: randomName,
    ownerUid: state.user?.uid || "system",
    createdAt: serverTimestamp(),
    private: false,
    members: [state.user?.uid || "system"]
  });
  await addDoc(collection(db, "rooms", randomName, "messages"), {
    body: "Premier message automatique",
    createdAt: serverTimestamp(),
    roomId: randomName,
    user: { uid: "system", name: "Bot", photoURL: "https://i.pravatar.cc/40?u=bot" }
  });
  console.log(`✅ Salon '${randomName}' + sous-collection 'messages' créés !`);
}