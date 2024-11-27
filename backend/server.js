require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Client, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

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
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only jpg, png, gif, and mp4 files are allowed."
        )
      );
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// WhatsApp client setup
const client = new Client({});
let qrCode = null;
let isClientReady = false;

// WhatsApp client events
client.on("qr", (qr) => {
  qrCode = qr;
  qrcode.generate(qr, { small: true });
  console.log("New QR code generated");
});

client.on("ready", () => {
  isClientReady = true;
  qrCode = null;
  console.log("WhatsApp client is ready!");
});

client.on("disconnected", () => {
  isClientReady = false;
  console.log("WhatsApp client disconnected");
});

client.initialize();

// Routes
app.get("/api/whatsapp-status", authenticateToken, (req, res) => {
  res.json({
    isConnected: isClientReady,
    qrCode: !isClientReady ? qrCode : null,
  });
});

app.get("/", (req, res) => {
  res.send("Welcome to Whatsapp Bulk Message App!");
});
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  console.log("Login attempt:", { username, password }); // For debugging

  if (!username || !password) {
    return res.status(400).json({
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

const formatPhoneNumber = (phoneNumber) => {
  try {
    // Remove all non-numeric characters
    let cleaned = phoneNumber.toString().replace(/[^\d+]/g, "");

    // Remove any leading zeros
    cleaned = cleaned.replace(/^0+/, "");

    // If number starts with +, remove it temporarily
    let hasPlus = cleaned.startsWith("+");
    cleaned = cleaned.replace(/^\+/, "");

    // Comprehensive list of country codes and their number lengths
    const countryCodes = {
      // Asia
      977: 10, // Nepal
      91: 10, // India
      86: 11, // China
      65: 8, // Singapore
      66: 9, // Thailand
      81: 10, // Japan
      82: 10, // South Korea
      84: 9, // Vietnam
      855: 8, // Cambodia
      856: 10, // Laos
      95: 10, // Myanmar
      880: 10, // Bangladesh
      92: 10, // Pakistan
      93: 9, // Afghanistan
      960: 7, // Maldives
      94: 9, // Sri Lanka
      975: 8, // Bhutan

      // North America
      1: 10, // USA/Canada
      52: 10, // Mexico

      // Europe
      44: 10, // UK
      33: 9, // France
      49: 11, // Germany
      39: 10, // Italy
      34: 9, // Spain
      351: 9, // Portugal
      358: 10, // Finland
      46: 9, // Sweden
      47: 8, // Norway
      45: 8, // Denmark
      31: 9, // Netherlands
      32: 9, // Belgium
      41: 9, // Switzerland
      43: 10, // Austria
      48: 9, // Poland
      380: 9, // Ukraine
      7: 10, // Russia

      // Oceania
      61: 9, // Australia
      64: 9, // New Zealand
      675: 8, // Papua New Guinea
      679: 7, // Fiji

      // Middle East
      971: 9, // UAE
      966: 9, // Saudi Arabia
      974: 8, // Qatar
      973: 8, // Bahrain
      968: 8, // Oman
      962: 9, // Jordan
      961: 8, // Lebanon
      972: 9, // Israel

      // Africa
      20: 10, // Egypt
      27: 9, // South Africa
      254: 9, // Kenya
      251: 9, // Ethiopia
      234: 10, // Nigeria
      212: 9, // Morocco
      216: 8, // Tunisia

      // South America
      55: 11, // Brazil
      54: 10, // Argentina
      56: 9, // Chile
      51: 9, // Peru
      57: 10, // Colombia
      58: 10, // Venezuela
      593: 9, // Ecuador
      595: 9, // Paraguay
      598: 8, // Uruguay

      // Central America
      502: 8, // Guatemala
      503: 8, // El Salvador
      506: 8, // Costa Rica
      507: 8, // Panama
      504: 8, // Honduras

      // Caribbean
      1868: 7, // Trinidad and Tobago
      1876: 7, // Jamaica
      1809: 10, // Dominican Republic
      53: 8, // Cuba
    };

    // Check if the number already has a country code
    let hasCountryCode = false;
    let matchedCode = "";

    // Sort country codes by length (descending) to check longer codes first
    const sortedCodes = Object.keys(countryCodes).sort(
      (a, b) => b.length - a.length
    );

    for (let code of sortedCodes) {
      if (cleaned.startsWith(code)) {
        hasCountryCode = true;
        matchedCode = code;
        // Verify the remaining number length matches the expected length for this country
        const remainingDigits = cleaned.substring(code.length);
        if (remainingDigits.length !== countryCodes[code]) {
          throw new Error(
            `Invalid number length for country code ${code}. Expected ${countryCodes[code]} digits after country code.`
          );
        }
        break;
      }
    }

    // If no country code and number is 10 digits, assume it's Nepal (977)
    if (!hasCountryCode && cleaned.length === 10) {
      cleaned = "977" + cleaned;
      matchedCode = "977";
    }

    // Final validation
    if (cleaned.length < 10 || cleaned.length > 15) {
      throw new Error(
        "Invalid phone number length (should be between 10 and 15 digits)"
      );
    }

    // Log the identified country for debugging
    if (matchedCode) {
      console.log(`Detected country code: ${matchedCode}`);
    }

    return cleaned;
  } catch (error) {
    console.error("Error formatting phone number:", error);
    throw new Error(`Invalid phone number format: ${error.message}`);
  }
};

app.post(
  "/api/send-messages",
  authenticateToken,
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
            if (mediaData) {
              await client.sendMessage(chatId, mediaData, {
                caption: personalizedMessage,
              });
            } else {
              await client.sendMessage(chatId, personalizedMessage);
            }

            results.push({
              contact,
              status: "success",
              formattedNumber,
              timestamp: new Date().toISOString(),
            });

            processedCount++;
          } catch (error) {
            throw new Error(`WhatsApp API Error: ${error.message}`);
          }

          // Add delay between messages (longer for larger batches)
          const delay = contacts.length > 10 ? 2000 : 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
