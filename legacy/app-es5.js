/* ===== Chat Ultra – app-es5.js (iOS 9 / Firebase v8) ===== */
/* Requiert dans le HTML :
<script src="https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/fetch/2.0.4/fetch.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
*/

var firebaseConfig = {
  apiKey: "AIzaSyB1vs_NTPr1Z524r7nmAA6o8YU8mrUwBGg",
  authDomain: "discord-a8797.firebaseapp.com",
  projectId: "discord-a8797",
  appId: "1:720230156937:web:8669ee2d96b7c0c06fd458"
};
firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();

/* === DOM helpers === */
function $(s) { return document.querySelector(s); }

var messagesEl = $("#messages");
var roomListEl = $("#room-list");
var messageInput = $("#message-input");
var sendBtn = $("#send-btn");
var currentRoomEl = $("#current-room");
var roomOwnerHint = $("#room-owner-hint");
var friendsBtn = $("#friends-btn");
var friendsDrawer = $("#friends-drawer");
var closeFriends = $("#close-friends");
var userListEl = $("#user-list");
var requestListEl = $("#request-list");
var friendsListEl = $("#friends-list");
var badgeRequests = $("#badge-requests");
var newRoomBtn = $("#new-room-btn");
var roomPopup = $("#room-popup");
var createBtn = $("#create-room");
var roomNameInput = $("#room-name");
var roomPrivate = $("#room-private");
var friendSelect = $("#friend-select");

var state = {
  user: null,
  profile: null,
  currentRoomId: null,
  unsubRooms: null,
  unsubMessages: null
};

function serverTimestamp() { return firebase.firestore.FieldValue.serverTimestamp(); }

/* ===== Notifications ===== */
function askNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { Notification.requestPermission(); } catch (e) {}
  }
}
function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted" && document.visibilityState === "hidden") {
    try { new Notification(title, { body: body }); } catch (e) {}
  }
}

/* ===== Auth UI ===== */
function renderAuthArea(user) {
  var el = $("#auth-area");
  if (!user) {
    el.innerHTML =
      '<div class="flex flex-col gap-2">' +
        '<button id="signin-google" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Connexion Google</button>' +
        '<button id="toggle-email" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Email / Mot de passe</button>' +
        '<form id="email-form" class="hidden mt-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">' +
          '<input id="email" type="email" required placeholder="Email" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />' +
          '<input id="pwd" type="password" required placeholder="Mot de passe" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />' +
          '<div class="flex gap-2">' +
            '<button data-mode="signin" class="flex-1 px-2 py-1 rounded-lg bg-indigo-600 text-white">Connexion</button>' +
            '<button data-mode="signup" class="flex-1 px-2 py-1 rounded-lg bg-zinc-700 text-white">Créer</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    var toggle = $("#toggle-email");
    var form = $("#email-form");
    if (toggle && form) toggle.onclick = function(){ form.classList.toggle("hidden"); };

    var googleBtn = $("#signin-google");
    if (googleBtn) {
      googleBtn.onclick = function() {
        var provider = new firebase.auth.GoogleAuthProvider();
        if (/iP(hone|od|ad)/.test(navigator.platform)) {
          auth.signInWithRedirect(provider).catch(function(e){ alert(e.message); });
        } else {
          auth.signInWithPopup(provider).catch(function(e){ alert(e.message); });
        }
      };
    }

    var f = $("#email-form");
    if (f) {
      f.onsubmit = function(ev) {
        ev.preventDefault();
        var email = f.querySelector("#email").value.trim().replace(/\s/g, "");
        var pwd   = f.querySelector("#pwd").value;
        var active = document.activeElement;
        var mode = (active && active.getAttribute("data-mode")) || "signin";
        if (!/@/.test(email)) { alert("Adresse e-mail invalide !"); return; }
        var op = (mode === "signup")
          ? auth.createUserWithEmailAndPassword(email, pwd)
          : auth.signInWithEmailAndPassword(email, pwd);
        op.catch(function(e){ alert(e.message); });
      };
    }
  } else {
    el.innerHTML =
      '<img src="' + (user.photoURL || "https://i.pravatar.cc/40") + '" class="h-8 w-8 rounded-full">' +
      '<span class="text-xs text-zinc-400">' + (user.displayName || user.email) + '</span>' +
      '<button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Quitter</button>';
    var out = $("#signout");
    if (out) out.onclick = function(){ auth.signOut(); };
  }
}

/* ===== Profile ===== */
function ensureUserProfile(user) {
  var ref = db.collection("users").doc(user.uid);
  return ref.get().then(function(snap) {
    if (!snap.exists) {
      var pseudo = prompt("Choisis ton pseudo :") || user.displayName || "Utilisateur";
      var photo  = user.photoURL || ("https://api.dicebear.com/7.x/identicon/svg?seed=" + encodeURIComponent(pseudo));
      return ref.set({
        uid: user.uid,
        displayName: pseudo,
        photoURL: photo,
        createdAt: serverTimestamp()
      }).then(function(){
        return user.updateProfile({ displayName: pseudo, photoURL: photo });
      });
    }
  });
}

/* ===== Salons publics & privés ===== */
if (newRoomBtn) {
  newRoomBtn.onclick = function() {
    if (!state.user) { alert("Connecte-toi d’abord."); return; }
    roomPopup.classList.toggle("hidden");
    friendSelect.classList.add("hidden");
    roomNameInput.value = "";
    roomPrivate.checked = false;
  };
}
if (roomPrivate) {
  roomPrivate.onchange = function() {
    if (roomPrivate.checked) {
      friendSelect.classList.remove("hidden");
    } else {
      friendSelect.classList.add("hidden");
    }
  };
}

if (createBtn) {
  createBtn.onclick = function() {
    if (!state.user) return alert("Connecte-toi !");
    var name = (roomNameInput.value || "").trim() || "sans-nom";
    var id = db.collection("rooms").doc().id;
    var members = [state.user.uid];
    var data = {
      name: name,
      ownerUid: state.user.uid,
      createdAt: serverTimestamp(),
      "private": !!roomPrivate.checked,
      members: members
    };
    db.collection("rooms").doc(id).set(data).then(function(){
      roomPopup.classList.add("hidden");
    }).catch(function(e){ alert(e.message); });
  };
}

/* ===== Listen Rooms ===== */
function listenRooms() {
  if (state.unsubRooms) state.unsubRooms();
  var roomsRef = db.collection("rooms");
  state.unsubRooms = roomsRef.onSnapshot(function(snap){
    roomListEl.innerHTML = "";
    if (snap.empty) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3 italic'>Aucun salon</div>";
      return;
    }
    snap.forEach(function(docSnap){
      var r = docSnap.data() || {};
      var roomId = docSnap.id;
      var visible = !r["private"] || (r.members && r.members.indexOf(state.user.uid) !== -1);
      if (!visible) return;
      var li = document.createElement("li");
      li.innerHTML =
        '<div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">' +
          '<button class="flex-1 text-left" data-join="' + roomId + '">' +
            '<div class="text-sm font-medium"># ' + (r.name || roomId) + '</div>' +
            '<div class="text-[11px] text-zinc-500">' + (r["private"] ? "Privé" : "Public") + '</div>' +
          '</button>' +
          (r.ownerUid === state.user.uid ? '<button data-del="' + roomId + '" class="text-red-400">🗑</button>' : '') +
        '</div>';
      li.querySelector("[data-join]").onclick = function(){ joinRoom(roomId, r.name, r.ownerUid); };
      if (r.ownerUid === state.user.uid) {
        li.querySelector("[data-del]").onclick = function(){
          if (confirm('Supprimer "' + r.name + '" ?')) db.collection("rooms").doc(roomId).delete();
        };
      }
      roomListEl.appendChild(li);
    });
  });
}

/* ===== Join & listen messages ===== */
function joinRoom(roomId, roomName, ownerUid) {
  state.currentRoomId = roomId;
  currentRoomEl.textContent = roomName || roomId;
  roomOwnerHint.textContent = (ownerUid === state.user.uid) ? "Propriétaire" : "";
  if (state.unsubMessages) state.unsubMessages();
  var q = db.collection("rooms").doc(roomId).collection("messages").orderBy("createdAt", "asc");
  state.unsubMessages = q.onSnapshot(function(snap){
    messagesEl.innerHTML = "";
    snap.forEach(function(docSnap){
      var m = docSnap.data() || {};
      var div = document.createElement("div");
      div.className = "flex items-start gap-3 fadeUp";
      var time = "";
      try {
        if (m.createdAt && typeof m.createdAt.toDate === "function") {
          time = m.createdAt.toDate().toLocaleTimeString();
        }
      } catch(e){}
      div.innerHTML =
        '<img src="' + (m.user && m.user.photoURL ? m.user.photoURL : "https://i.pravatar.cc/40") + '" class="h-8 w-8 rounded-full">' +
        '<div class="bg-zinc-800 rounded-2xl px-4 py-2 max-w-[85%]">' +
          '<div class="text-xs text-zinc-400">' + (m.user ? m.user.name : "Anonyme") + ' • ' + time + '</div>' +
          '<div class="text-sm whitespace-pre-wrap break-words">' + (m.body || "") + '</div>' +
        '</div>';
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

/* ===== Send message ===== */
var formMsg = $("#message-form");
if (formMsg) {
  formMsg.addEventListener("submit", function(e){
    e.preventDefault();
    if (!state.user || !state.currentRoomId) return;
    var text = messageInput.value.trim();
    if (!text) return;
    var safe = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    db.collection("rooms").doc(state.currentRoomId).collection("messages").add({
      body: safe,
      createdAt: serverTimestamp(),
      roomId: state.currentRoomId,
      user: {
        uid: state.user.uid,
        name: state.user.displayName || state.user.email,
        photoURL: state.user.photoURL || "https://i.pravatar.cc/40"
      }
    }).then(function(){
      messageInput.value = "";
    }).catch(function(e){ alert(e.message); });
  });
}

/* ===== Auth flow ===== */
auth.onAuthStateChanged(function(u){
  state.user = u;
  renderAuthArea(u);
  if (u) {
    ensureUserProfile(u).then(function(){ listenRooms(); });
    askNotificationPermission();
  } else {
    roomListEl.innerHTML = "";
    messagesEl.innerHTML = "";
  }
});
