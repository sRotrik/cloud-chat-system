const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3001';

const FIRST_NAMES = [
  'Alex', 'Sara', 'Raj', 'Priya', 'Karan', 'Neha', 'Arjun', 'Divya',
  'Sam', 'Zen', 'Rohan', 'Anita', 'Vikram', 'Pooja', 'Dev', 'Meera',
  'Arun', 'Sneha', 'Rahul', 'Kavya', 'Nikhil', 'Shreya', 'Amit', 'Riya',
  'Suresh', 'Nisha', 'Pranav', 'Isha', 'Kunal', 'Tanya', 'Vivek', 'Simran',
  'Harsh', 'Ankita', 'Mohit', 'Payal', 'Siddharth', 'Kritika', 'Yash', 'Aditi',
  'Varun', 'Deepika', 'Gaurav', 'Swati', 'Abhi', 'Rekha', 'Tushar', 'Mansi',
  'Ravi', 'Sunita', 'Ajay', 'Geeta', 'Sachin', 'Lata', 'Vinod', 'Uma',
  'Manoj', 'Kamla', 'Sunil', 'Asha', 'Pankaj', 'Seema', 'Dinesh', 'Mona',
  'Rajesh', 'Sonia', 'Naresh', 'Reena', 'Mukesh', 'Shila', 'Ramesh', 'Jyoti',
  'Aakash', 'Bhumi', 'Chetan', 'Disha', 'Ekta', 'Farhan', 'Gitanjali', 'Hemant',
  'Indira', 'Jagdish', 'Kiran', 'Lalit', 'Madhuri', 'Naveen', 'Omkar', 'Pallavi',
  'Quarishi', 'Ritesh', 'Shweta', 'Tarun', 'Uday', 'Vandana', 'Wasim', 'Xena',
  'Yogesh', 'Zara'
];

const BOT_TYPES = ['CloudBot', 'DevBot', 'SysBot', 'NetBot', 'InfraBot', 'DataBot', 'SecBot', 'MLBot', 'DevOpsBot', 'FullStackBot'];

const ROOMS = ['general', 'tech', 'cloud', 'random'];

const MESSAGES = {
  general: [
    "Hey everyone! Hope you're having a great day! 👋",
    "This chat system is incredibly fast! 🚀",
    "Anyone else amazed by the WebSocket latency here?",
    "Good morning from the cloud! ☁️",
    "This is built by Reshma and Srotrik — amazing work!",
    "Real-time messaging at its finest! ⚡",
    "Loving the dark theme on this UI 🖤",
    "Who else is here for the live demo? 😄",
    "The connection is so smooth and instant!",
    "This is what cloud engineering looks like 💪",
    "Just joined the general room — hello world! 🌍",
    "The online user count keeps going up! 📈",
    "Never seen a student project this polished before!",
    "WebSocket > HTTP polling any day of the week",
    "This would score full marks at any university 🎓",
    "Shoutout to the devs — incredible system!",
    "The UI is so clean and professional 👌",
    "Real production-grade architecture right here!",
    "I can see messages appearing instantly — wow!",
    "This is running on Railway + Vercel — zero cost! 💰",
    "Multiple rooms working perfectly 🏠",
    "The typing indicator is a nice touch ⌨️",
    "MongoDB is storing every message persistently 🍃",
    "History loads automatically when you join — smart!",
    "This demo is blowing my mind 🤯",
  ],
  tech: [
    "Socket.io with Redis adapter is a game changer 🔥",
    "WebSockets are so much better than HTTP polling",
    "Node.js non-blocking I/O handles thousands of connections easily",
    "Redis Pub/Sub latency is under 1ms — insane! ⚡",
    "Docker makes deployment so consistent across environments",
    "GitHub Actions CI/CD pipeline is fully automated here",
    "MongoDB Atlas free tier is perfect for projects like this",
    "Horizontal scaling with Redis is the industry standard",
    "The architecture here mirrors what Slack uses at scale",
    "JWT authentication next — this system keeps improving!",
    "Express.js REST API + Socket.io is a powerful combo",
    "The Dockerfile uses alpine Linux — keeps image size tiny",
    "npm packages installed with --production flag for lean builds",
    "Socket rooms make multi-channel chat trivial to implement",
    "CORS configured properly for cross-origin WebSocket connections",
    "dotenv keeps secrets out of the codebase — best practice!",
    "Redis createClient with TLS for secure Upstash connection",
    "Mongoose schema validation ensures clean data in MongoDB",
    "The health endpoint follows REST API best practices",
    "Socket.io auto-reconnects on network interruption — resilient!",
    "Message history limited to 50 — prevents memory overload",
    "Sorted by timestamp descending then reversed — elegant!",
    "io.to(room).emit() broadcasts only to room members",
    "socket.to(room) excludes the sender — perfect for typing",
    "This codebase is clean, modular, and production-ready 🏆",
  ],
  cloud: [
    "Railway auto-scales based on incoming traffic 📈",
    "Vercel CDN serves the frontend from 40+ global locations",
    "Upstash Redis free tier gives 10,000 commands/day",
    "MongoDB Atlas M0 is perfect — 512MB free storage",
    "This entire system costs $0 to run — pure free tier! 💰",
    "Cloud-native means built FOR the cloud, not just on it",
    "Stateless servers + Redis = infinite horizontal scaling",
    "The health endpoint at /health is monitored every 5 mins",
    "Container orchestration with Docker keeps things consistent",
    "Multi-region deployment is the next step for this system",
    "UptimeRobot shows 100% uptime — rock solid! 💪",
    "GitHub Actions deploys automatically on every git push",
    "Railway connects directly to GitHub — seamless CI/CD",
    "Vercel Preview deployments on every PR — professional workflow",
    "Environment variables managed securely on Railway dashboard",
    "Redis Pub/Sub is the backbone of horizontal scaling",
    "Each server instance is completely stateless — scalable!",
    "Load balancer distributes WebSocket connections evenly",
    "Auto-restart policy ensures zero downtime on crashes",
    "This architecture can handle 1 million concurrent users",
    "Managed DBaaS means no database maintenance overhead",
    "PaaS deployment abstracts away server management entirely",
    "CDN-backed frontend means sub-200ms load time globally",
    "Free tier stack: MongoDB + Redis + Railway + Vercel = 💯",
    "This is enterprise architecture on a student budget 🎓",
  ],
  random: [
    "Okay who ordered pizza? 🍕",
    "Fun fact: WebSocket was standardized in 2011 📚",
    "If this chat was HTTP polling, you'd see messages 1 sec late 😂",
    "Redis was created by Salvatore Sanfilippo in 2009 🎂",
    "MongoDB Atlas has been free tier since 2016!",
    "Node.js turns 15 years old this year 🎉",
    "Docker containers are like lunch boxes for code 🍱",
    "The cloud is just someone else's computer 😄",
    "Kubernetes is like a robot that manages your Docker containers",
    "Fun fact: Socket.io automatically reconnects if connection drops!",
    "Did you know Redis stands for Remote Dictionary Server? 🤓",
    "WebSocket connections stay open — no handshake overhead!",
    "React re-renders only changed components — super efficient",
    "Git commit history tells the whole story of this project",
    "The dark theme was definitely the right choice 🖤",
    "Anyone else refreshing the page just to see history load? 😂",
    "This chat is better than WhatsApp Web honestly 😅",
    "Imagine if WhatsApp used HTTP polling — it would be terrible!",
    "50 message history limit is actually a design choice 🧠",
    "The avatar initials system is such a clean solution",
    "No external auth provider needed — JWT is self-contained",
    "Open source stack — every tool here is free forever",
    "Built in India 🇮🇳 — world-class cloud engineering!",
    "Reshma + Srotrik = unstoppable dev duo 💪",
    "This project deserves an A+ no doubt about it 🏆",
  ],
};

// Generate 100 unique bot names
const BOT_USERS = [];
for (let i = 0; i < 100; i++) {
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const botType = BOT_TYPES[i % BOT_TYPES.length];
  const num = Math.floor(i / FIRST_NAMES.length) > 0 ? `_${Math.floor(i / FIRST_NAMES.length)}` : '';
  BOT_USERS.push({ name: `${botType}_${firstName}${num}` });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function startBot(botUser, roomName, delayStart) {
  await delay(delayStart);

  const socket = io(SERVER, {
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', async () => {
    console.log(`✅ ${botUser.name} joined #${roomName}`);
    socket.emit('join_room', roomName);

    while (true) {
      await delay(random(5000, 15000));

      const roomMessages = MESSAGES[roomName];
      const message = roomMessages[random(0, roomMessages.length - 1)];

      socket.emit('typing', { room: roomName, username: botUser.name });
      await delay(random(1000, 3000));

      socket.emit('send_message', {
        room: roomName,
        username: botUser.name,
        message: message,
      });

      console.log(`💬 ${botUser.name} → #${roomName}: "${message.substring(0, 50)}"`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${botUser.name} disconnected`);
  });
}

async function launchAllBots() {
  console.log('🚀 Launching CloudChat Bot Simulator — 100 Users');
  console.log('📡 Server:', SERVER);
  console.log('🤖 Total bots: 100');
  console.log('💬 Rooms:', ROOMS.join(', '));
  console.log('─'.repeat(60));
  console.log('🌐 Open https://cloud-chat-system.vercel.app to watch live!');
  console.log('─'.repeat(60));

  for (let i = 0; i < BOT_USERS.length; i++) {
    const bot = BOT_USERS[i];
    const room = ROOMS[i % ROOMS.length];
    const startDelay = i * 300; // stagger by 300ms each
    startBot(bot, room, startDelay);
  }
}

launchAllBots();