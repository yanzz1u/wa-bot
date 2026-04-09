const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

let sock
let chats = {}

app.get("/", (req, res) => {
  res.send(`
  <h2>🤖 WhatsApp Bot Aktif</h2>
  <p>Status: <span id="status">Loading...</span></p>
  <p id="code"></p>

  <input id="nomor" placeholder="628xxx"><br><br>
  <input id="pesan" placeholder="Ketik pesan"><br><br>
  <button onclick="kirim()">Kirim</button>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io()

    socket.on("status", s => {
      document.getElementById("status").innerText = s
    })

    socket.on("pair", code => {
      document.getElementById("code").innerText = "Kode: " + code
    })

    function kirim(){
      socket.emit("send", {
        to: document.getElementById("nomor").value + "@s.whatsapp.net",
        text: document.getElementById("pesan").value
      })
    }
  </script>
  `)
})

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("session")

  sock = makeWASocket({ auth: state })

  // TANPA QR
  if (!sock.authState.creds.registered) {
    const code = await sock.requestPairingCode("62XXXXXXXXXX")
    console.log("Pairing Code:", code)
    io.emit("pair", code)
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    const from = msg.key.remoteJid

    if (!chats[from]) chats[from] = []
    chats[from].push({ from, text })

    // AUTO REPLY
    if (text === "halo") {
      await sock.sendMessage(from, { text: "Halo juga 👋" })
    }

    io.emit("chat", chats)
  })

  io.on("connection", (socket) => {
    socket.on("send", async (data) => {
      await sock.sendMessage(data.to, { text: data.text })
    })
  })

  sock.ev.on("connection.update", (update) => {
    const { connection } = update

    if (connection === "open") {
      io.emit("status", "🟢 Connected")
      console.log("Bot Connected")
    } else if (connection === "close") {
      io.emit("status", "🔴 Disconnected")
      start()
    }
  })
}

start()

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log("Server jalan"))
