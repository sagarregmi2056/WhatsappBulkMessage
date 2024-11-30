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
const readline = require("readline");

const app = express();
app.set("trust proxy", 1);

// Rate limiting configuration
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

const ensureLogFile = () => {
  const logsDir = path.join(process.cwd(), "logs");
  const logFile = path.join(logsDir, "message_logs.txt");

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, "");
  }
};
// File cleanup utility
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB limit
  },
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

// Middleware
app.use(
  cors({
    origin: true, // Allow all origins
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
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

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

const client = new Client({
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});
let qrCode = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Message queue setup
const messageQueue = new Queue(
  async (task, cb) => {
    try {
      const { chatId, message, mediaData } = task;
      console.log(`Starting to send message to ${chatId}`);

      // Check if chat exists
      const chat = await client.getChatById(chatId).catch((err) => {
        console.log(`Creating new chat for ${chatId}`);
        return null;
      });

      let sentMessage;
      if (mediaData) {
        console.log(`Sending media message to ${chatId}`);
        sentMessage = await client.sendMessage(chatId, mediaData, {
          caption: message,
          sendMediaAsDocument: mediaData.mimetype === "application/pdf",
        });
      } else {
        console.log(`Sending text message to ${chatId}`);
        sentMessage = await client.sendMessage(chatId, message);
      }

      if (!sentMessage) {
        throw new Error("Failed to send message");
      }

      console.log(`Message successfully sent to ${chatId}`);
      cb(null, { success: true, messageId: sentMessage.id });
    } catch (error) {
      console.error(`Message queue error for ${chatId}:`, error);
      cb(error);
    }
  },
  {
    concurrent: 1,
    afterProcessDelay: 3000,
    retries: 2,
  }
);

// In the message processing loop:
try {
  await new Promise((resolve, reject) => {
    messageQueue.push(
      {
        chatId,
        message: personalizedMessage,
        mediaData,
      },
      (err, result) => {
        if (err) {
          console.error(`Queue error for ${chatId}:`, err);
          reject(new Error(err.message || "Failed to send message"));
        } else {
          console.log(`Queue success for ${chatId}:`, result);
          resolve(result);
        }
      }
    );
  });

  results.push({
    contact,
    status: "success",
    formattedNumber,
    personalizedMessage,
    timestamp: new Date().toISOString(),
  });

  processedCount++;
} catch (error) {
  console.error(`Detailed error for ${chatId}:`, error);
  throw new Error(error.message || "WhatsApp API Error");
}

// WhatsApp client events
client.on("qr", (qr) => {
  qrCode = qr;
  qrcode.generate(qr, { small: true });
  console.log("New QR code generated");
});

client.on("ready", () => {
  isClientReady = true;
  qrCode = null;
  reconnectAttempts = 0;
  console.log("WhatsApp client is ready!");
});

client.on("authenticated", () => {
  console.log("WhatsApp client authenticated");
  isClientReady = true;
});

client.on("auth_failure", (error) => {
  console.error("WhatsApp authentication failed:", error);
  isClientReady = false;

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    setTimeout(() => {
      console.log(
        `Attempting to reconnect... (${
          reconnectAttempts + 1
        }/${MAX_RECONNECT_ATTEMPTS})`
      );
      client.initialize();
    }, 5000 * Math.pow(2, reconnectAttempts));
    reconnectAttempts++;
  }
});

client.on("disconnected", async (reason) => {
  isClientReady = false;
  console.log("WhatsApp client disconnected:", reason);

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    console.log(
      `Attempting to reconnect (${
        reconnectAttempts + 1
      }/${MAX_RECONNECT_ATTEMPTS})...`
    );
    reconnectAttempts++;
    setTimeout(() => {
      client.initialize();
    }, 5000 * reconnectAttempts);
  }
});

// Initialize WhatsApp client
client.initialize();

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

app.get("/api/whatsapp-status", authenticateToken, (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({
        success: false,
        message: "WhatsApp client not initialized",
      });
    }

    res.json({
      success: true,
      isConnected: isClientReady,
      qrCode: !isClientReady ? qrCode : null,
    });
  } catch (error) {
    console.error("Error checking WhatsApp status:", error);
    res.status(500).json({
      success: false,
      message: "Error checking WhatsApp status",
    });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  console.log("Login attempt:", { username }); // Logging without password

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  try {
    if (
      username === process.env.ADMIN_USERNAME &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign({ username }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      return res.json({
        success: true,
        token,
        message: "Login successful",
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const logFilePath = path.join(process.cwd(), "logs", "message_logs.txt");
    const data = fs.readFileSync(logFilePath, "utf8");

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
    console.error("Error reading log file:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      path: path.join(process.cwd(), "logs", "message_logs.txt"),
    });
  }
});

// Country codes and phone number validation
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

// Phone number formatting function
const formatPhoneNumber = (phoneNumber) => {
  try {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.toString().replace(/[^\d+]/g, "");

    // Remove any leading zeros
    cleaned = cleaned.replace(/^0+/, "");

    // If number starts with +, remove it
    cleaned = cleaned.replace(/^\+/, "");

    // Special handling for US/Canada numbers
    if (cleaned.length === 10 && !cleaned.startsWith("1")) {
      cleaned = "1" + cleaned;
    }

    // Sort country codes by length (descending) to check longer codes first
    const sortedCodes = Object.keys(countryCodes).sort(
      (a, b) => b.length - a.length
    );

    // Check if the number already has a country code
    let hasCountryCode = false;
    let matchedCode = "";

    for (let code of sortedCodes) {
      if (cleaned.startsWith(code)) {
        hasCountryCode = true;
        matchedCode = code;

        // Verify the remaining number length matches the expected length
        const expectedLength = countryCodes[code].length;
        const remainingDigits = cleaned.substring(code.length);

        if (remainingDigits.length !== expectedLength) {
          throw new Error(
            `Invalid number length for ${
              countryCodes[code].country || code
            }. Expected ${expectedLength} digits after country code.`
          );
        }
        break;
      }
    }

    // If no country code and number is 10 digits, assume it's US/Canada
    if (!hasCountryCode && cleaned.length === 10) {
      cleaned = "1" + cleaned;
      matchedCode = "1";
    }

    // Final validation
    if (cleaned.length < 10 || cleaned.length > 15) {
      throw new Error(
        "Invalid phone number length (should be between 10 and 15 digits)"
      );
    }

    // Log the identified country for debugging
    if (matchedCode) {
      const countryInfo = countryCodes[matchedCode];
      const countryName =
        countryInfo.country || countryInfo.countries?.join("/");
      console.log(`Detected country: ${countryName} (${matchedCode})`);
    }

    return cleaned;
  } catch (error) {
    console.error("Error formatting phone number:", error);
    throw new Error(`Invalid phone number format: ${error.message}`);
  }
};

// Utility for validating phone numbers before sending
const validatePhoneNumber = (phoneNumber) => {
  try {
    const formatted = formatPhoneNumber(phoneNumber);
    return {
      isValid: true,
      formatted,
      original: phoneNumber,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      original: phoneNumber,
    };
  }
};

app.post(
  "/api/send-messages",
  authenticateToken,
  messageLimiter,
  upload.single("media"),
  async (req, res) => {
    let mediaFile = null;

    try {
      // Check WhatsApp connection
      if (!isClientReady) {
        return res.status(503).json({
          success: false,
          message: "WhatsApp client not connected. Please scan the QR code.",
        });
      }

      const { campaignName, messageTemplate } = req.body;
      mediaFile = req.file;
      let contacts;

      // Validate required fields
      if (!campaignName?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Campaign name is required",
        });
      }

      if (!messageTemplate?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Message template is required",
        });
      }

      // Parse and validate contacts
      try {
        contacts = JSON.parse(req.body.contacts);
        console.log("Parsed contacts:", contacts);

        if (!Array.isArray(contacts)) {
          throw new Error("Contacts must be an array");
        }
      } catch (error) {
        console.error("Error parsing contacts:", error);
        return res.status(400).json({
          success: false,
          message: "Invalid contacts data format. Expected JSON array.",
        });
      }

      if (contacts.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No contacts provided",
        });
      }

      // Process media if present
      let mediaData = null;
      if (mediaFile) {
        try {
          mediaData = MessageMedia.fromFilePath(mediaFile.path);
          console.log("Media loaded successfully");
        } catch (error) {
          console.error("Error loading media file:", error);
          return res.status(500).json({
            success: false,
            message: "Error processing media file. Please try again.",
          });
        }
      }

      const results = [];
      const errors = [];
      let processedCount = 0;

      // Process each contact
      for (const contact of contacts) {
        try {
          // Validate contact data
          if (!contact.name?.trim() || !contact.phoneNumber?.trim()) {
            errors.push({
              contact,
              error: "Missing or invalid name/phone number",
              details: {
                name: !contact.name?.trim() ? "missing" : "valid",
                phoneNumber: !contact.phoneNumber?.trim() ? "missing" : "valid",
              },
            });
            continue;
          }

          // Format phone number
          let formattedNumber;
          try {
            formattedNumber = formatPhoneNumber(contact.phoneNumber);
          } catch (error) {
            errors.push({
              contact,
              error: `Invalid phone number: ${error.message}`,
            });
            continue;
          }

          // Prepare and send message
          const personalizedMessage = messageTemplate.replace(
            /{name}/g,
            contact.name.trim()
          );
          const chatId = `${formattedNumber}@c.us`;

          console.log(
            `Sending message to ${chatId} (${processedCount + 1}/${
              contacts.length
            })`
          );

          try {
            await new Promise((resolve, reject) => {
              messageQueue.push(
                {
                  chatId,
                  message: personalizedMessage,
                  mediaData,
                },
                (err, result) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(result);
                  }
                }
              );
            });

            results.push({
              contact,
              status: "success",
              formattedNumber,
              personalizedMessage: messageTemplate.replace(
                /{name}/g,
                contact.name.trim()
              ),
              timestamp: new Date().toISOString(),
            });

            processedCount++;
          } catch (error) {
            throw new Error(`WhatsApp API Error: ${error.message}`);
          }
        } catch (error) {
          console.error(
            `Error processing contact ${contact.phoneNumber}:`,
            error
          );
          errors.push({
            contact,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Cleanup media file
      if (mediaFile?.path) {
        cleanupFile(mediaFile.path);
      }

      // Prepare response with detailed statistics
      const response = {
        success: true,
        campaignName,
        messageTemplate, // Add this
        timestamp: new Date().toISOString(),
        statistics: {
          total: contacts.length,
          successful: results.length,
          failed: errors.length,
          successRate: `${((results.length / contacts.length) * 100).toFixed(
            1
          )}%`,
        },
        details: {
          results,
          errors: errors.length > 0 ? errors : undefined,
        },
      };

      console.log("Campaign completed:", response.statistics);
      messageLogger.logCampaign(response).catch(console.error);
      res.json(response);
    } catch (error) {
      console.error("Campaign error:", error);

      // Ensure media cleanup on error
      if (mediaFile?.path) {
        cleanupFile(mediaFile.path);
      }

      res.status(500).json({
        success: false,
        message: "Campaign processing failed",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: "File upload error",
      error: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Cleanup function for server shutdown
const cleanup = () => {
  console.log("Cleaning up before shutdown...");

  // Delete all files in uploads directory
  const uploadDir = path.join(__dirname, "uploads");
  if (fs.existsSync(uploadDir)) {
    fs.readdirSync(uploadDir).forEach((file) => {
      const filePath = path.join(uploadDir, file);
      cleanupFile(filePath);
    });
  }

  process.exit(0);
};

// Handle graceful shutdown
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

// Start server
const PORT = process.env.PORT || 8989;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureLogFile();

  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("Created uploads directory");
  }
});

module.exports = {
  formatPhoneNumber,
  validatePhoneNumber,
  countryCodes,
};
