const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Or specify specific origin(s)
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed HTTP methods
    allowedHeaders: ['Authorization'], // Specify allowed headers
  }
});

//router
const Auth = require('./routes/auth')
const Room = require('./routes/room')

app.use(cors());
app.use(express.json());

//owners of all rooms
const owners = {}
const otherClients = {}
const leaveArr = []

app.use((req, res, next) => {
  req.owners = owners
  next()
})

app.use('/api/auth', Auth);
app.use('/api/room', Room)

app.get('/', (req, res) => {
  res.send('Hello World!');
});

//handel sockets
io.on('connection', (socket) => {

  socket.on("joinroom", data => {
    let isProgress = false
    if (!otherClients[data.roomno]) {
      otherClients[data.roomno] = []
    }
    otherClients[data.roomno].push({ peerId: data.peerId, socket, roomno: data.roomno })
    console.log(otherClients)
    if (!isProgress) {
      for (const key in otherClients) {
        otherClients[key].forEach((item, index, arr) => {
          isProgress = true
          item.socket.join(item.roomno)
          owners[item.roomno] ? '' : owners[item.roomno] = arr[0].peerId
          io.to(item.roomno).emit("joined", { peerId: item.peerId, ownerId: owners[item.roomno] })
          index === otherClients[key].length - 1 ? isProgress = false : ''
        })
      }
    }
  })

  //handel chat messages
  socket.on('chatMessage', (data) => {
    console.log(data)
    io.to(data.roomno).emit('chatMessage', { message: data.message, userId: data.userId, username: data.userName })
  })

  //handel disconnected user
  socket.on('disconnected', (data) => {
    let isProgress = false
    leaveArr.push({ peerId: data.peerId, roomno: data.roomno, socket })
    if (!isProgress) {
      leaveArr.forEach((item, index) => {
        isProgress = true
        item.socket.leave(item.roomno)
        io.to(item.roomno).emit('disconnected', { peerId: item.peerId })
        index === leaveArr.length - 1 ? isProgress = false : ''
      })
    }
  })
})


const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});


