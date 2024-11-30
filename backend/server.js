require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Client, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const Queue = require("better-queue");
const messageLogger = require("./services/messageLogger");

const app = express();
app.set("trust proxy", 1);

// Rate limiting configuration
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

// File handling utilities
const ensureLogFile = () => {
  const logsDir = path.join(process.cwd(), "logs");
  const logFile = path.join(logsDir, "message_logs.txt");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, "");
};

const cleanupFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up file: ${filePath}`);
    }
  } catch (error) {
    console.error("Error cleaning up file:", error);
  }
};

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only jpg, png, gif, mp4, and pdf files are allowed."
        )
      );
    }
  },
});

// Middleware setup
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid token",
      });
    }
    req.user = user;
    next();
  });
};

const clients = new Map();
const qrCodes = new Map();
const messageQueues = new Map();

const initializeClient = (userId) => {
  const client = new Client({
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  const messageQueue = new Queue(
    async (task, cb) => {
      try {
        const { chatId, message, mediaData } = task;
        console.log(`Starting to send message to ${chatId}`);
        console.log("Message content:", message);

        // Add delay before sending
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (mediaData) {
          console.log("Sending message with media to:", chatId);
          const result = await client.sendMessage(chatId, mediaData, {
            caption: message,
            sendMediaAsDocument: mediaData.mimetype === "application/pdf",
          });
          console.log("Media message result:", result);
        } else {
          console.log("Sending text message to:", chatId);
          const result = await client.sendMessage(chatId, message);
          console.log("Text message result:", result);
        }

        console.log(`Successfully sent message to ${chatId}`);
        cb(null, { success: true });
      } catch (error) {
        console.error(`Failed to send message to ${task.chatId}:`, error);
        // Try to get more error details
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
        cb(error);
      }
    },
    {
      concurrent: 1,
      afterProcessDelay: 3000, // Increased delay between messages
    }
  );

  client.on("qr", (qr) => {
    client.isReady = false;
    qrCodes.set(userId, qr);
    qrcode.generate(qr, { small: true });
    console.log(`New QR code generated for user ${userId}`);
  });

  client.on("ready", () => {
    client.isReady = true;
    qrCodes.delete(userId);
    console.log(`Client ready for user ${userId}`);
  });

  client.on("authenticated", () => {
    client.isReady = true;
    console.log(`WhatsApp client authenticated for user ${userId}`);
  });

  client.on("auth_failure", (error) => {
    client.isReady = false;
    console.error(`Authentication failed for user ${userId}:`, error);
    clients.delete(userId);
    qrCodes.delete(userId);
    messageQueues.delete(userId);
  });

  client.on("disconnected", (reason) => {
    client.isReady = false;
    console.log(`Client disconnected for user ${userId}:`, reason);
    clients.delete(userId);
    qrCodes.delete(userId);
    messageQueues.delete(userId);
  });

  client.initialize();
  clients.set(userId, client);
  messageQueues.set(userId, messageQueue);
};

// Basic Routes
app.get("/", (req, res) => {
  res.send("Welcome to WhatsApp Bulk Message App!");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.post("/api/init-whatsapp", authenticateToken, (req, res) => {
  const userId = req.user.username;
  if (!clients.has(userId)) {
    initializeClient(userId);
  }
  res.json({
    success: true,
    qrCode: qrCodes.get(userId),
    isReady: clients.get(userId)?.isReady,
  });
});

app.get("/api/whatsapp-status", authenticateToken, (req, res) => {
  const userId = req.user.username;

  const client = clients.get(userId);

  res.json({
    success: true,
    isConnected: client?.isReady || false,
    qrCode: qrCodes.get(userId) || null,
  });
});

const countryCodes = {
  // North America
  1: { length: 10, countries: ["USA", "Canada"] },
  52: { length: 10, country: "Mexico" },

  // South America
  55: { length: 11, country: "Brazil" },
  54: { length: 10, country: "Argentina" },
  56: { length: 9, country: "Chile" },
  57: { length: 10, country: "Colombia" },
  58: { length: 10, country: "Venezuela" },
  51: { length: 9, country: "Peru" },
  593: { length: 9, country: "Ecuador" },
  595: { length: 9, country: "Paraguay" },
  598: { length: 8, country: "Uruguay" },
  591: { length: 8, country: "Bolivia" },

  // Europe
  44: { length: 10, country: "UK" },
  33: { length: 9, country: "France" },
  49: { length: 11, country: "Germany" },
  39: { length: 10, country: "Italy" },
  34: { length: 9, country: "Spain" },
  351: { length: 9, country: "Portugal" },
  31: { length: 9, country: "Netherlands" },
  32: { length: 9, country: "Belgium" },
  41: { length: 9, country: "Switzerland" },
  43: { length: 10, country: "Austria" },
  46: { length: 9, country: "Sweden" },
  47: { length: 8, country: "Norway" },
  45: { length: 8, country: "Denmark" },
  358: { length: 10, country: "Finland" },
  30: { length: 10, country: "Greece" },
  48: { length: 9, country: "Poland" },
  380: { length: 9, country: "Ukraine" },
  7: { length: 10, country: "Russia" },

  // Asia
  86: { length: 11, country: "China" },
  81: { length: 10, country: "Japan" },
  82: { length: 10, country: "South Korea" },
  91: { length: 10, country: "India" },
  92: { length: 10, country: "Pakistan" },
  66: { length: 9, country: "Thailand" },
  84: { length: 9, country: "Vietnam" },
  62: { length: 10, country: "Indonesia" },
  60: { length: 9, country: "Malaysia" },
  63: { length: 10, country: "Philippines" },
  65: { length: 8, country: "Singapore" },
  880: { length: 10, country: "Bangladesh" },
  977: { length: 10, country: "Nepal" },
  94: { length: 9, country: "Sri Lanka" },
  95: { length: 10, country: "Myanmar" },
  856: { length: 10, country: "Laos" },
  855: { length: 8, country: "Cambodia" },

  // Middle East
  966: { length: 9, country: "Saudi Arabia" },
  971: { length: 9, country: "UAE" },
  972: { length: 9, country: "Israel" },
  974: { length: 8, country: "Qatar" },
  973: { length: 8, country: "Bahrain" },
  968: { length: 8, country: "Oman" },
  962: { length: 9, country: "Jordan" },
  961: { length: 8, country: "Lebanon" },

  // Africa
  20: { length: 10, country: "Egypt" },
  27: { length: 9, country: "South Africa" },
  234: { length: 10, country: "Nigeria" },
  254: { length: 9, country: "Kenya" },
  251: { length: 9, country: "Ethiopia" },
  212: { length: 9, country: "Morocco" },
  216: { length: 8, country: "Tunisia" },

  // Oceania
  61: { length: 9, country: "Australia" },
  64: { length: 9, country: "New Zealand" },

  // Caribbean
  1876: { length: 7, country: "Jamaica" },
  1869: { length: 7, country: "Saint Kitts and Nevis" },
  1758: { length: 7, country: "Saint Lucia" },
  1868: { length: 7, country: "Trinidad and Tobago" },
};

const formatPhoneNumber = (phoneNumber) => {
  let cleaned = phoneNumber.toString().replace(/[^\d+]/g, "");
  cleaned = cleaned.replace(/^0+/, "").replace(/^\+/, "");

  if (cleaned.length === 10 && !cleaned.startsWith("1")) {
    cleaned = "1" + cleaned;
  }

  const sortedCodes = Object.keys(countryCodes).sort(
    (a, b) => b.length - a.length
  );
  let hasCountryCode = false;
  let matchedCode = "";

  for (let code of sortedCodes) {
    if (cleaned.startsWith(code)) {
      hasCountryCode = true;
      matchedCode = code;
      const expectedLength = countryCodes[code].length;
      const remainingDigits = cleaned.substring(code.length);

      if (remainingDigits.length !== expectedLength) {
        throw new Error(
          `Invalid number length for ${countryCodes[code].country || code}`
        );
      }
      break;
    }
  }

  if (!hasCountryCode && cleaned.length === 10) {
    cleaned = "1" + cleaned;
  }

  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error("Invalid phone number length");
  }

  return cleaned;
};

// Message sending endpoint
app.post(
  "/api/send-messages",
  authenticateToken,
  messageLimiter,
  upload.single("media"),
  async (req, res) => {
    const userId = req.user.username;
    console.log("Message request from user:", userId);
    console.log("Campaign:", req.body.campaignName);
    console.log("Contacts count:", JSON.parse(req.body.contacts).length);
    const client = clients.get(userId);
    console.log("Client ready state:", client?.isReady);
    const queue = messageQueues.get(userId);
    let mediaFile = null;

    try {
      if (!client?.isReady) {
        return res.status(503).json({
          success: false,
          message: "WhatsApp not connected",
        });
      }

      const { campaignName, messageTemplate } = req.body;
      mediaFile = req.file;
      let contacts = JSON.parse(req.body.contacts);

      // Validate inputs
      if (
        !campaignName?.trim() ||
        !messageTemplate?.trim() ||
        !Array.isArray(contacts)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
        });
      }

      let mediaData = null;
      if (mediaFile) {
        mediaData = MessageMedia.fromFilePath(mediaFile.path);
      }

      const results = [];
      const errors = [];

      for (const contact of contacts) {
        try {
          if (!contact.name?.trim() || !contact.phoneNumber?.trim()) {
            throw new Error("Invalid contact data");
          }

          const formattedNumber = formatPhoneNumber(contact.phoneNumber);
          const personalizedMessage = messageTemplate.replace(
            /{name}/g,
            contact.name.trim()
          );
          const chatId = `${formattedNumber}@c.us`;

          await queue.push({
            chatId,
            message: personalizedMessage,
            mediaData,
          });

          results.push({
            contact,
            status: "success",
            formattedNumber,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          errors.push({
            contact,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (mediaFile?.path) {
        cleanupFile(mediaFile.path);
      }

      const response = {
        success: true,
        campaignName,
        statistics: {
          total: contacts.length,
          successful: results.length,
          failed: errors.length,
        },
        details: { results, errors },
      };

      messageLogger.logCampaign(response);
      res.json(response);
    } catch (error) {
      if (mediaFile?.path) {
        cleanupFile(mediaFile.path);
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
    return res.json({ success: true, token });
  }

  return res.status(401).json({
    success: false,
    message: "Invalid credentials",
  });
});

app.get("/api/messages", async (req, res) => {
  try {
    const logFile = path.join(process.cwd(), "logs", "message_logs.txt");
    const data = fs.readFileSync(logFile, "utf8");
    const messages = data
      .split("---END_ENTRY---")
      .filter((entry) => entry.trim())
      .map((entry) => JSON.parse(entry.trim()));

    res.json({
      success: true,
      messages: messages.reverse(),
      total: messages.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Error handlers
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: "File upload error",
      error: err.message,
    });
  }
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Cleanup and shutdown
const cleanup = () => {
  console.log("Cleaning up...");
  const uploadDir = path.join(__dirname, "uploads");
  if (fs.existsSync(uploadDir)) {
    fs.readdirSync(uploadDir).forEach((file) => {
      cleanupFile(path.join(uploadDir, file));
    });
  }
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

// Server startup
const PORT = process.env.PORT || 8989;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureLogFile();

  const uploadDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
});

module.exports = { formatPhoneNumber };
