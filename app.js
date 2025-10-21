// === Imports Firebase ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDocs, getDoc,
  onSnapshot, serverTimestamp, query, orderBy, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// === Config Firebase ===
const firebaseConfig = {
  apiKey: "AIzaSyB1vs_NTPr1Z524r7nmAA6o8YU8mrUwBGg",
  authDomain: "discord-a8797.firebaseapp.com",
  projectId: "discord-a8797",
  appId: "1:720230156937:web:8669ee2d96b7c0c06fd458"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === Sélecteurs ===
const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const messageInput = $("#message-input");
const sendBtn = $("#send-btn");
const userListEl = $("#user-list");

// === État ===
let state = { user: null, unsubscribeMessages: null, unsubscribeUsers: null };

// === Auth ===
function renderAuthArea(user) {
  const el = $("#auth-area");
  if (!user) {
    el.innerHTML = `<button id="signin" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Connexion Google</button>`;
    $("#signin").onclick = async () => {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) { alert(e.message); }
    };
  } else {
    el.innerHTML = `
      <img src="${user.photoURL || 'https://i.pravatar.cc/40'}" class="h-8 w-8 rounded-full" alt="">
      <span class="text-xs text-zinc-400">${user.displayName || user.email}</span>
      <button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Quitter</button>`;
    $("#signout").onclick = () => signOut(auth);
  }
}

// === Profil utilisateur ===
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
  }
}

// === Chargement des utilisateurs (amis + global) ===
function listenUsers() {
  if (state.unsubscribeUsers) state.unsubscribeUsers();
  state.unsubscribeUsers = onSnapshot(collection(db, "users"), (snap) => {
    userListEl.innerHTML = "";
    snap.forEach((d) => {
      const u = d.data();
      if (!u.displayName) return;
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer">
          <img src="${u.photoURL}" class="h-6 w-6 rounded-full">
          <div class="flex-1 text-sm">${u.displayName}</div>
          ${u.uid !== state.user.uid ? `<button data-uid="${u.uid}" class="text-xs text-indigo-400 hover:underline">+ Ami</button>` : ""}
        </div>`;
      if (u.uid !== state.user.uid) {
        li.querySelector("button").onclick = () => sendFriendRequest(u.uid);
      }
      userListEl.appendChild(li);
    });
  });
}

// === Messages temps réel ===
function listenMessages() {
  if (state.unsubscribeMessages) state.unsubscribeMessages();
  const ref = collection(db, "servers", "test", "messages");
  const q = query(ref, orderBy("createdAt", "asc"));
  state.unsubscribeMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const wrap = document.createElement("div");
      wrap.className = "flex items-start gap-3";
      wrap.innerHTML = `
        <img src="${m.user.photoURL}" class="h-8 w-8 rounded-full">
        <div class="bg-zinc-800 rounded-2xl px-4 py-2 max-w-[85%]">
          <div class="text-xs text-zinc-400">${m.user.name} • ${m.createdAt ? new Date(m.createdAt.toDate()).toLocaleTimeString() : ""}</div>
          <div class="text-sm whitespace-pre-wrap break-words">${m.body}</div>
        </div>`;
      messagesEl.appendChild(wrap);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// === Envoi message ===
$("#message-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return alert("Connecte-toi d’abord !");
  const text = messageInput.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  setTimeout(() => (sendBtn.disabled = false), 600);

  const profileSnap = await getDoc(doc(db, "users", state.user.uid));
  const profile = profileSnap.data();

  await addDoc(collection(db, "servers", "test", "messages"), {
    body: text,
    createdAt: serverTimestamp(),
    user: {
      uid: state.user.uid,
      name: profile.displayName,
      photoURL: profile.photoURL,
    },
  });
  messageInput.value = "";
});

// === Gestion amis ===
async function sendFriendRequest(targetUid) {
  const me = state.user.uid;
  if (me === targetUid) return alert("Tu ne peux pas t’ajouter toi-même 😅");
  await setDoc(doc(db, "users", targetUid, "friendRequests", me), {
    from: me,
    sentAt: serverTimestamp(),
  });
  alert("Demande d’ami envoyée !");
}

// === Écoute Auth ===
onAuthStateChanged(auth, async (u) => {
  state.user = u;
  renderAuthArea(u);
  if (u) {
    await ensureUserProfile(u);
    listenUsers();
    listenMessages();
  } else {
    userListEl.innerHTML = "";
    messagesEl.innerHTML = "";
  }
});
