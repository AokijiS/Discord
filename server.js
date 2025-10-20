const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Un utilisateur est connecté');

    socket.on('chat message', (data) => {
        io.emit('chat message', data); // Envoie à tous les clients
    });

    socket.on('disconnect', () => {
        console.log('Utilisateur déconnecté');
    });
});

http.listen(3000, () => {
    console.log('Serveur démarré sur http://localhost:3000');
});
