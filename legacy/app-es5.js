/* ===== Chat Ultra – app-es5.js (iOS 9 / Firebase v8) ===== */
/* Prérequis dans le HTML : Promise + fetch polyfills + Firebase v8 (app, auth, firestore) */

/* ==== Config Firebase ==== */
var firebaseConfig = {
  apiKey: "AIzaSyB1vs_NTPr1Z524r7nmAA6o8YU8mrUwBGg",
  authDomain: "discord-a8797.firebaseapp.com",
  projectId: "discord-a8797",
  appId: "1:720230156937:web:8669ee2d96b7c0c06fd458"
};
firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db   = firebase.firestore();

/* Shorthand DOM */
function $(s) { return document.querySelector(s); }

var messagesEl     = $("#messages");
var roomListEl     = $("#room-list");
var messageInput   = $("#message-input");
var sendBtn        = $("#send-btn");
var currentRoomEl  = $("#current-room");
var roomOwnerHint  = $("#room-owner-hint");
var friendsBtn     = $("#friends-btn");
var friendsDrawer  = $("#friends-drawer");
var closeFriends   = $("#close-friends");
var userListEl     = $("#user-list");
var requestListEl  = $("#request-list");
var friendsListEl  = $("#friends-list");
var badgeRequests  = $("#badge-requests");

var newRoomBtn     = $("#new-room-btn");
var roomPopup      = $("#room-popup");
var createBtn      = $("#create-room");
var roomNameInput  = $("#room-name");
var roomPrivate    = $("#room-private");
var friendSelect   = $("#friend-select");

var state = {
  user: null,
  profile: null,
  currentRoomId: null,
  unsubMessages: null,
  unsubRooms: null,
  unsubRequests: null,
  unsubFriends: null,
  lastVisibilityChange: Date.now()
};

/* ===== Utils ===== */
function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}
function sanitizeHTML(s) {
  return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function getUidSafe() {
  return state.user ? state.user.uid : null;
}
document.addEventListener("visibilitychange", function() {
  state.lastVisibilityChange = Date.now();
});

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
      '<div class="flex items-center gap-2">' +
        '<button id="signin-google" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Google</button>' +
        '<details class="relative">' +
          '<summary class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 cursor-pointer select-none">Email</summary>' +
          '<form id="email-form" class="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">' +
            '<input id="email" type="email" required placeholder="Email" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />' +
            '<input id="pwd" type="password" required placeholder="Mot de passe" class="w-full bg-zinc-800 rounded-lg px-2 py-1" />' +
            '<div class="flex gap-2">' +
              '<button data-mode="signin" class="flex-1 px-2 py-1 rounded-lg bg-indigo-600">Connexion</button>' +
              '<button data-mode="signup" class="flex-1 px-2 py-1 rounded-lg bg-zinc-700">Créer</button>' +
            '</div>' +
          '</form>' +
        '</details>' +
      '</div>';

    var googleBtn = $("#signin-google");
    if (googleBtn) {
      googleBtn.onclick = function() {
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function(e){ alert(e.message); });
      };
    }

    var f = $("#email-form");
    if (f) {
      f.onsubmit = function(ev) {
        ev.preventDefault();
        var email = f.querySelector("#email").value;
        var pwd   = f.querySelector("#pwd").value;
        // iOS9 ne supporte pas ev.submitter — on lit le bouton actif
        var mode  = (document.activeElement && document.activeElement.getAttribute("data-mode")) || "signin";

        var op = (mode === "signup")
          ? auth.createUserWithEmailAndPassword(email, pwd)
          : auth.signInWithEmailAndPassword(email, pwd);

        op.catch(function(e){ alert(e.message); });
      };
    }
  } else {
    var photo = user.photoURL || 'https://i.pravatar.cc/40';
    var name  = user.displayName || user.email;
    el.innerHTML =
      '<img src="' + photo + '" class="h-8 w-8 rounded-full">' +
      '<span class="text-xs text-zinc-400">' + sanitizeHTML(name) + '</span>' +
      '<button id="signout" class="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">Quitter</button>';

    var signoutBtn = $("#signout");
    if (signoutBtn) {
      signoutBtn.onclick = function() { auth.signOut(); };
    }
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
  }).catch(function(){});
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
      loadFriendSelection();
    } else {
      friendSelect.classList.add("hidden");
    }
  };
}

function loadFriendSelection() {
  friendSelect.innerHTML = "";
  var col = db.collection("users").doc(getUidSafe()).collection("friends");
  col.get().then(function(snap) {
    if (snap.empty) {
      friendSelect.innerHTML = '<div class="text-zinc-500 text-xs italic">Aucun ami</div>';
      return;
    }
    snap.forEach(function(d) {
      var fid = d.id;
      db.collection("users").doc(fid).get().then(function(uSnap){
        var u = uSnap.data() || {};
        var line = document.createElement("div");
        line.innerHTML =
          '<label class="flex items-center gap-2 cursor-pointer">' +
            '<input type="checkbox" value="' + fid + '">' +
            '<span>' + sanitizeHTML(u.displayName || "") + '</span>' +
          '</label>';
        friendSelect.appendChild(line);
      });
    });
  });
}

if (createBtn) {
  createBtn.onclick = function() {
    var name = (roomNameInput.value || "").trim() || "sans-nom";
    // ID compatible ancien navigateur
    var roomsCol = db.collection("rooms");
    var id = roomsCol.doc().id;

    var members = [];
    members.push(getUidSafe());

    if (roomPrivate.checked) {
      var checked = friendSelect.querySelectorAll('input[type=checkbox]:checked');
      Array.prototype.forEach.call(checked, function(c){ members.push(c.value); });
    }

    roomsCol.doc(id).set({
      name: name,
      ownerUid: getUidSafe(),
      createdAt: serverTimestamp(),
      "private": !!roomPrivate.checked,
      members: members
    }).then(function(){
      roomPopup.classList.add("hidden");
    }).catch(function(e){ alert(e.message); });
  };
}

/* ===== Listen Rooms ===== */
function listenRooms() {
  if (state.unsubRooms) { state.unsubRooms(); state.unsubRooms = null; }

  var roomsRef = db.collection("rooms");
  state.unsubRooms = roomsRef.onSnapshot(function(snap){
    if (!state.user) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3'>Connecte-toi pour voir les salons</div>";
      return;
    }
    roomListEl.innerHTML = "";

    if (snap.empty) {
      roomListEl.innerHTML = "<div class='text-sm text-zinc-500 px-3 italic'>Aucun salon pour le moment</div>";
      return;
    }

    snap.forEach(function(docSnap){
      var r = docSnap.data() || {};
      var roomId = docSnap.id;

      var isMember = Array.isArray(r.members) && r.members.indexOf(getUidSafe()) !== -1;
      var visible  = !r["private"] || isMember;
      if (!visible) return;

      var li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML =
        '<div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">' +
          '<button class="flex-1 text-left" data-join="' + roomId + '">' +
            '<div class="text-sm font-medium"># ' + sanitizeHTML(r.name || "") + '</div>' +
            '<div class="text-[11px] text-zinc-500">' + (r["private"] ? "Privé" : "Public") + '</div>' +
          '</button>' +
          ((r.ownerUid === getUidSafe()) ?
            '<button data-del="' + roomId + '" class="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition">🗑</button>' : "") +
        '</div>';

      var joinBtn = li.querySelector('[data-join="' + roomId + '"]');
      if (joinBtn) {
        joinBtn.onclick = function() { joinRoom(roomId, r.name, r.ownerUid); };
      }

      if (r.ownerUid === getUidSafe()) {
        var delBtn = li.querySelector('[data-del="' + roomId + '"]');
        if (delBtn) {
          delBtn.onclick = function() {
            if (confirm('Supprimer le salon "' + (r.name || roomId) + '" ?')) {
              db.collection("rooms").doc(roomId).delete();
            }
          };
        }
      }

      roomListEl.appendChild(li);
    });
  }, function(err){
    try { console.log("Erreur snapshot rooms:", err); } catch(e){}
  });
}

/* ===== Join & listen messages ===== */
function joinRoom(roomId, roomName, ownerUid) {
  state.currentRoomId = roomId;
  currentRoomEl.textContent = roomName || roomId;

  ensureMessagesSubcollection(roomId).then(function(){
    roomOwnerHint.textContent = (ownerUid && getUidSafe() && ownerUid === getUidSafe()) ? "Propriétaire" : "";
    if (state.unsubMessages) { state.unsubMessages(); state.unsubMessages = null; }

    var q = db.collection("rooms").doc(roomId).collection("messages").orderBy("createdAt", "asc");
    state.unsubMessages = q.onSnapshot(function(snap){
      messagesEl.innerHTML = "";
      snap.forEach(function(docSnap){
        var m = docSnap.data() || {};
        var row = document.createElement("div");
        row.className = "flex items-start gap-3 fadeUp";

        var avatar = '<img src="' + (m.user && m.user.photoURL ? m.user.photoURL : 'https://i.pravatar.cc/40') + '" class="h-8 w-8 rounded-full">';
        var time = "";
        try {
          if (m.createdAt && typeof m.createdAt.toDate === "function") {
            var d = m.createdAt.toDate();
            time = d.toLocaleTimeString ? d.toLocaleTimeString() : "";
          }
        } catch(e) {}

        row.innerHTML =
          avatar +
          '<div class="bg-zinc-800 rounded-2xl px-4 py-2 max-w-[85%] transition">' +
            '<div class="text-xs text-zinc-400">' +
              sanitizeHTML((m.user && m.user.name) ? m.user.name : "Utilisateur") +
              ' • ' + sanitizeHTML(time) +
            '</div>' +
            '<div class="text-sm whitespace-pre-wrap break-words">' + (m.body || "") + '</div>' +
          '</div>';

        messagesEl.appendChild(row);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  });
}

/* ===== Envoi de message ===== */
var msgForm = $("#message-form");
if (msgForm) {
  msgForm.addEventListener("submit", function(e){
    e.preventDefault();
    if (!state.user || !state.currentRoomId) return;

    var text = (messageInput.value || "").trim();
    if (!text) return;

    setTimeout(function(){ sendBtn.disabled = false; }, 400);

    // profile en cache (sinon Firestore)
    var profilePromise = state.profile
      ? Promise.resolve(state.profile)
      : db.collection("users").doc(getUidSafe()).get().then(function(s){ return s.data() || {}; });

    profilePromise.then(function(profile){
      state.profile = profile || {};
      var sanitized = sanitizeHTML(text);

      return db.collection("rooms").doc(state.currentRoomId).collection("messages").add({
        body: sanitized,
        createdAt: serverTimestamp(),
        roomId: state.currentRoomId,
        user: {
          uid: getUidSafe(),
          name: (profile && profile.displayName) ? profile.displayName :
                (state.user.displayName || state.user.email),
          photoURL: (profile && profile.photoURL) ? profile.photoURL :
                    (state.user.photoURL || "https://i.pravatar.cc/40")
        }
      });
    }).then(function(){
      messageInput.value = "";
    }).catch(function(err){
      try { console.error("Erreur envoi message:", err); } catch(e){}
      alert("Erreur : " + err.message);
    });
  });
}

/* ===== Notifications nouveaux messages (global) ===== */
function listenAllMessagesNotifications() {
  var q = db.collectionGroup("messages").orderBy("createdAt", "desc");
  q.onSnapshot(function(snap){
    var changes = snap.docChanges ? snap.docChanges() : [];
    for (var i = 0; i < changes.length; i++) {
      var ch = changes[i];
      if (!ch || ch.type !== "added") continue;

      var m = ch.doc.data() || {};
      if (!state.user || (m.user && m.user.uid === getUidSafe())) continue;

      var t = Date.now();
      try {
        if (m.createdAt && typeof m.createdAt.toDate === "function") {
          t = m.createdAt.toDate().getTime();
        }
      } catch(e){}

      if (document.visibilityState === "hidden" && t >= (state.lastVisibilityChange - 3000)) {
        notify("Nouveau message dans #" + (m.roomId || ""), (m.user && m.user.name ? m.user.name : "Quelqu'un") + ": " + (m.body || ""));
      }
    }
  });
}

/* ===== Amis ===== */
if (friendsBtn) { friendsBtn.onclick = function(){ friendsDrawer.classList.remove("hidden"); askNotificationPermission(); }; }
if (closeFriends){ closeFriends.onclick = function(){ friendsDrawer.classList.add("hidden"); }; }

function sendFriendRequest(targetUid) {
  if (!state.user) { alert("Connecte-toi d’abord !"); return; }
  if (targetUid === getUidSafe()) { alert("Tu ne peux pas t’ajouter toi-même !"); return; }
  db.collection("users").doc(targetUid).collection("friendRequests").doc(getUidSafe()).set({
    from: getUidSafe(),
    sentAt: serverTimestamp()
  }).then(function(){ alert("Demande envoyée !"); });
}

function acceptFriendRequest(fromUid) {
  var me = getUidSafe();
  var batch = db.batch();

  var meFriendsRef   = db.collection("users").doc(me).collection("friends").doc(fromUid);
  var himFriendsRef  = db.collection("users").doc(fromUid).collection("friends").doc(me);
  var requestRef     = db.collection("users").doc(me).collection("friendRequests").doc(fromUid);

  batch.set(meFriendsRef,  { since: serverTimestamp() });
  batch.set(himFriendsRef, { since: serverTimestamp() });
  batch.delete(requestRef);

  batch.commit();
}

/* UI amis – liste utilisateurs */
function loadAllUsers() {
  db.collection("users").onSnapshot(function(snap){
    userListEl.innerHTML = "";
    snap.forEach(function(d){
      var u = d.data() || {};
      if (!u.displayName) return;

      var li = document.createElement("li");
      li.className = "fadeUp";
      li.innerHTML =
        '<div class="group flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800 transition">' +
          '<img src="' + (u.photoURL || "https://i.pravatar.cc/40") + '" class="h-6 w-6 rounded-full">' +
          '<div class="flex-1 text-sm">' + sanitizeHTML(u.displayName) + '</div>' +
          ((u.uid !== getUidSafe()) ?
            '<button data-add="' + u.uid + '" class="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:underline">+ Ami</button>' : "") +
        '</div>';

      if (u.uid !== getUidSafe()) {
        var addBtn = li.querySelector('[data-add="' + u.uid + '"]');
        if (addBtn) addBtn.onclick = (function(uid){ return function(){ sendFriendRequest(uid); }; })(u.uid);
      }
      userListEl.appendChild(li);
    });
  });
}

function listenFriendRequests(uid) {
  if (state.unsubRequests) { state.unsubRequests(); state.unsubRequests = null; }
  state.unsubRequests = db.collection("users").doc(uid).collection("friendRequests")
    .onSnapshot(function(snap){
      requestListEl.innerHTML = "";
      badgeRequests.textContent = snap.size;
      badgeRequests.classList.toggle("hidden", snap.size === 0);

      var docs = snap.docs || [];
      var i;
      function renderOne(i) {
        if (i >= docs.length) return;
        var d = docs[i];
        db.collection("users").doc(d.id).get().then(function(uSnap){
          var u = uSnap.data() || {};
          var li = document.createElement("li");
          li.className = "fadeUp";
          li.innerHTML =
            '<div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">' +
              '<img src="' + (u.photoURL || "https://i.pravatar.cc/40") + '" class="h-6 w-6 rounded-full">' +
              '<div class="flex-1 text-sm">' + sanitizeHTML(u.displayName || "") + '</div>' +
              '<button data-acc="' + (u.uid || d.id) + '" class="px-2 py-1 text-xs bg-indigo-600 rounded">Accepter</button>' +
            '</div>';
          requestListEl.appendChild(li);

          var accBtn = li.querySelector('[data-acc="' + (u.uid || d.id) + '"]');
          if (accBtn) accBtn.onclick = (function(uid){ return function(){ acceptFriendRequest(uid); }; })((u.uid || d.id));

          notify("Nouvelle demande d’ami", (u.displayName || "Un utilisateur") + " souhaite t’ajouter");

          renderOne(i+1);
        });
      }
      renderOne(0);
    });
}

function listenFriends(uid) {
  if (state.unsubFriends) { state.unsubFriends(); state.unsubFriends = null; }
  state.unsubFriends = db.collection("users").doc(uid).collection("friends")
    .onSnapshot(function(snap){
      friendsListEl.innerHTML = "";
      var docs = snap.docs || [];
      var i;
      function renderOne(i) {
        if (i >= docs.length) return;
        var d = docs[i];
        db.collection("users").doc(d.id).get().then(function(uSnap){
          var u = uSnap.data() || {};
          var li = document.createElement("li");
          li.className = "fadeUp";
          li.innerHTML =
            '<div class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-800">' +
              '<img src="' + (u.photoURL || "https://i.pravatar.cc/40") + '" class="h-6 w-6 rounded-full">' +
              '<div class="flex-1 text-sm">' + sanitizeHTML(u.displayName || "") + '</div>' +
            '</div>';
          friendsListEl.appendChild(li);
          renderOne(i+1);
        });
      }
      renderOne(0);
    });
}

/* ===== Auth flow ===== */
auth.onAuthStateChanged(function(u){
  state.user = u || null;
  renderAuthArea(u);

  if (u) {
    askNotificationPermission();
    ensureUserProfile(u).then(function(){
      // cache rapide du profil
      return db.collection("users").doc(u.uid).get();
    }).then(function(s){
      state.profile = (s && s.data()) ? s.data() : null;
    }).catch(function(){});

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

/* === Crée une sous-collection messages si absente === */
function ensureMessagesSubcollection(roomId) {
  var roomRef = db.collection("rooms").doc(roomId).collection("messages");
  return roomRef.get().then(function(snap){
    if (snap.empty) {
      return roomRef.add({
        body: "Salon initialisé automatiquement ✅",
        createdAt: serverTimestamp(),
        roomId: roomId,
        user: {
          uid: "system",
          name: "Bot Système",
          photoURL: "https://i.pravatar.cc/40?u=system"
        }
      }).then(function(){
        try { console.log("🟢 Sous-collection 'messages' créée pour " + roomId); } catch(e){}
      });
    } else {
      try { console.log("✅ Sous-collection 'messages' déjà existante pour " + roomId); } catch(e){}
    }
  }).catch(function(err){
    try { console.error("❌ Erreur création sous-collection messages:", err); } catch(e){}
  });
}

/* ==== Utilitaire de test (crée un salon aléatoire) ==== */
function createRandomCollection() {
  var randomName = "test_" + Math.random().toString(36).substring(2, 8);
  var docRef = db.collection("rooms").doc(randomName);
  return docRef.set({
    name: randomName,
    ownerUid: getUidSafe() || "system",
    createdAt: serverTimestamp(),
    "private": false,
    members: [getUidSafe() || "system"]
  }).then(function(){
    return db.collection("rooms").doc(randomName).collection("messages").add({
      body: "Premier message automatique",
      createdAt: serverTimestamp(),
      roomId: randomName,
      user: { uid: "system", name: "Bot", photoURL: "https://i.pravatar.cc/40?u=bot" }
    });
  }).then(function(){
    try { console.log("✅ Salon '" + randomName + "' + sous-collection 'messages' créés !"); } catch(e){}
  });
}
