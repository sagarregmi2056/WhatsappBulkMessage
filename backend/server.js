require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Define authenticateToken middleware first
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
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
client.on('qr', (qr) => {
    qrCode = qr;
    qrcode.generate(qr, { small: true });
    console.log('New QR code generated');
});

client.on('ready', () => {
    isClientReady = true;
    qrCode = null;
    console.log('WhatsApp client is ready!');
});

client.on('disconnected', () => {
    isClientReady = false;
    console.log('WhatsApp client disconnected');
});

client.initialize();

// Routes
app.get('/api/whatsapp-status', authenticateToken, (req, res) => {
    res.json({
        isConnected: isClientReady,
        qrCode: !isClientReady ? qrCode : null
    });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt:', { username, password }); // For debugging

    if (!username || !password) {
        return res.status(400).json({ 
            message: 'Username and password are required' 
        });
    }

    try {
        if (username === process.env.ADMIN_USERNAME && 
            password === process.env.ADMIN_PASSWORD) {
            
            const token = jwt.sign(
                { username }, 
                process.env.JWT_SECRET, 
                { expiresIn: '24h' }
            );
            
            return res.json({ 
                success: true,
                token,
                message: 'Login successful' 
            });
        } else {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Server error during login' 
        });
    }
});

app.post('/api/send-messages', authenticateToken, async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ 
            success: false, 
            message: 'WhatsApp client not connected' 
        });
    }

    const { campaignName, messageTemplate, contacts } = req.body;

    if (!campaignName || !messageTemplate || !contacts || contacts.length === 0) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const results = [];
        for (const contact of contacts) {
            const personalizedMessage = messageTemplate.replace(/{name}/g, contact.name);
            
            try {
                const formattedNumber = contact.phoneNumber.replace(/[^0-9]/g, '');
                await client.sendMessage(`${formattedNumber}@c.us`, personalizedMessage);
                results.push({
                    phoneNumber: contact.phoneNumber,
                    status: 'success'
                });

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                results.push({
                    phoneNumber: contact.phoneNumber,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            campaignName,
            totalMessages: contacts.length,
            results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending messages',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 