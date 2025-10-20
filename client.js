const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMfomoEC7x8a_Nh84BnApH6S7-F7aukSNV-vMbc5zM_L998Mtlu8eoMUtA00LxN29w6g/exec"; // Remplace par ton URL Apps Script

// Gestion de l'utilisateur
let username = localStorage.getItem('username');
if(!username) {
    username = prompt("Bienvenue ! Quel est ton pseudo ?");
    localStorage.setItem('username', username);
}

// Générer une couleur unique par utilisateur
function getColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}

const input = document.getElementById('messageInput');
const messagesDiv = document.getElementById('messages');
let lastMessages = [];

// Envoyer un message
input.addEventListener('keypress', (e) => {
    if(e.key === 'Enter' && input.value.trim() !== '') {
        fetch(APP_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({username, message: input.value})
        });
        input.value = '';
    }
});

// Récupérer les messages toutes les 2 secondes
async function fetchMessages() {
    try {
        const res = await fetch(APP_SCRIPT_URL);
        const data = await res.json();

        // Notifications pour les nouveaux messages
        if(lastMessages.length && document.hidden) {
            data.slice(lastMessages.length).forEach(msg => {
                if(Notification.permission === "granted") {
                    new Notification(`${msg.username}`, { body: msg.message });
                }
            });
        }
        lastMessages = data;

        // Affichage des messages
        messagesDiv.innerHTML = '';
        data.forEach(msg => {
            const div = document.createElement('div');
            div.innerHTML = `
                <span class="avatar" style="background-color:${getColor(msg.username)}">${msg.username[0].toUpperCase()}</span>
                <span class="username">${msg.username}:</span>
                <span class="text">${msg.message}</span>
            `;
            messagesDiv.appendChild(div);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch(err) {
        console.error("Erreur fetch messages:", err);
    }
}
setInterval(fetchMessages, 2000);
fetchMessages();

// Notifications
if(Notification.permission !== "granted") {
    Notification.requestPermission();
}