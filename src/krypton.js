const {
    default: Baileys,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('baileys')
const { QuickDB } = require('quick.db')
const { getConfig } = require('./getConfig')
const { Collection } = require('discord.js')
const { MessageHandler } = require('./Handlers/Message')
const GroupUpdateHandler = require('./Handlers/GroupUpdate')
const CallHandler = require('./Handlers/Call')
const contact = require('./Helper/contacts')
const utils = require('./Helper/function')
const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const chalk = require('chalk')
const P = require('pino')
const { Boom } = require('@hapi/boom')
const { join } = require('path')
const { imageSync } = require('qr-image')
const QRCode = require('qrcode')
const { readdirSync, remove, existsSync } = require('fs-extra')
const bodyParser = require('body-parser')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const JWT_SECRET = process.env.JWT_SECRET || 'whatsapp-bot-admin-secret'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

// Global connection tracking
global.connected = false
global.connectedNumber = null

// Middleware
app.use(bodyParser.json())
app.use(cors({
  origin: '*' // Allow requests from any origin in production
}))

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../admin-panel/build')))

const port = process.env.PORT || 3000

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.status(401).json({ message: 'Authentication required' })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' })
    req.user = user
    next()
  })
}

const start = async () => {
    // Get bot instances from QuickDB
    const db = new QuickDB();
    const configTable = db.table('config');
    let instances = await configTable.get('botInstances');

    // If no instances exist, create a default one
    if (!instances || !Array.isArray(instances) || instances.length === 0) {
        instances = [
            {
                id: 1,
                name: 'Bot 1',
                status: 'disconnected',
                isActive: true,
                sessionPath: 'session',
                lastActive: Date.now(),
                phoneNumber: null,
                qrTimestamp: null
            }
        ];
        await configTable.set('botInstances', instances);
    }

    // Find active instance
    let activeInstance = instances.find(instance => instance.isActive);
    if (!activeInstance) {
        // If no active instance, set the first one as active
        instances[0].isActive = true;
        activeInstance = instances[0];
        await configTable.set('botInstances', instances);
    }

    console.log(`🤖 Using bot instance: ${activeInstance.name} (ID: ${activeInstance.id})`);

    // Update the last active timestamp for the active instance
    instances = instances.map(instance => ({
        ...instance,
        lastActive: instance.isActive ? Date.now() : instance.lastActive || Date.now()
    }));
    await configTable.set('botInstances', instances);

    // Ensure the session directory exists
    const sessionPath = activeInstance.sessionPath || `session_${activeInstance.id}`;
    const sessionDir = path.join(__dirname, '..', sessionPath);

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
        console.log(`✅ Created session directory for bot ${activeInstance.id}: ${sessionDir}`);
    }

    // Use the session path from the active instance
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const client = Baileys({
        version: (await fetchLatestBaileysVersion()).version,
        auth: state,
        logger: P({ level: 'silent' }),
        browser: ['Bot', 'silent', '4.0.0'],
        printQRInTerminal: true,
        // The following options help with QR generation in cloud environments like Railway
        qrTimeout: 60000, // Longer timeout for QR scanning
        connectTimeoutMs: 60000, // Longer connection timeout
        defaultQueryTimeoutMs: 60000 // Longer query timeout
    })

    // Store the active instance information in the client
    client.instanceId = activeInstance.id;
    client.isActive = activeInstance.isActive;
    client.instanceName = activeInstance.name;
    client.qrTimestamp = activeInstance.qrTimestamp;

    // Config
    client.config = getConfig()

    // Database
    client.DB = new QuickDB()
    // Tables
    client.contactDB = client.DB.table('contacts')

    // Contacts
    client.contact = contact

    // Commands
    client.cmd = new Collection()

    // Utils
    client.utils = utils

    client.messagesMap = new Map()

    /**
     * @returns {Promise<string[]>}
     */
    client.getAllGroups = async () => Object.keys(await client.groupFetchAllParticipating())

    /**
     * @returns {Promise<string[]>}
     */
    client.getAllUsers = async () => {
        const data = (await client.contactDB.all()).map((x) => x.id)
        const users = data.filter((element) => /^\d+@s$/.test(element)).map((element) => `${element}.whatsapp.net`)
        return users
    }

    // Colourful logging
    client.log = (text, color = 'green') =>
        color ? console.log(chalk.keyword(color)(text)) : console.log(chalk.green(text))

    // Command Loader
    const loadCommands = async () => {
        const readCommand = (rootDir) => {
            readdirSync(rootDir).forEach(($dir) => {
                const commandFiles = readdirSync(join(rootDir, $dir)).filter((file) => file.endsWith('.js'))
                for (let file of commandFiles) {
                    const cmd = require(join(rootDir, $dir, file))
                    client.cmd.set(cmd.command.name, cmd)
                    client.log(`Loaded: ${cmd.command.name.toUpperCase()} from ${file}`)
                }
            })
            client.log('Successfully Loaded Commands')
        }
        readCommand(join(__dirname, '.', 'Commands'))
    }

    // Connection updates
    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (update.qr) {
            client.log(`[${chalk.red('!')}]`, 'white')
            client.log(`Scan the QR code above | You can also authenticate at http://localhost:${port}`, 'blue')

            // Store the raw QR data
            client.qrRaw = update.qr
            client.qrTimestamp = Date.now()

            // ALWAYS print the raw QR data in a format that's easy to copy
            console.log('\n\n==============================================================')
            console.log('🔴 IMPORTANT: COPY THIS QR CODE DATA TO USE WITH ONLINE QR GENERATOR 🔴')
            console.log('==============================================================')
            console.log(update.qr)
            console.log('==============================================================')
            console.log('Go to https://www.the-qrcode-generator.com/ and paste this data to generate a scannable QR code')
            console.log('==============================================================\n\n')

            try {
                // First try with qr-image
                try {
                    client.QR = imageSync(update.qr);
                    console.log(`✅ QR code generated successfully with qr-image at ${new Date(client.qrTimestamp).toLocaleString()}`);
                } catch (qrImageError) {
                    console.error('❌ Error generating QR code with qr-image:', qrImageError);

                    // Fallback to qrcode library
                    try {
                        const qrBuffer = await (async () => {
                            return new Promise((resolve, reject) => {
                                QRCode.toBuffer(update.qr, (err, buffer) => {
                                    if (err) reject(err);
                                    else resolve(buffer);
                                });
                            });
                        })();
                        client.QR = qrBuffer;
                        console.log(`✅ QR code generated successfully with qrcode library at ${new Date(client.qrTimestamp).toLocaleString()}`);
                    } catch (qrcodeError) {
                        console.error('❌ Error generating QR code with qrcode library:', qrcodeError);
                        console.log('⚠️ Please use the QR code data above with an online QR generator');
                    }
                }
            } catch (qrError) {
                console.error('❌ Error in QR code generation process:', qrError);
                console.log('⚠️ Please use the QR code data above with an online QR generator');
            }
        }
        if (connection === 'close') {
            // Reset global connection flags
            global.connected = false
            global.connectedNumber = null

            // Update bot instance status
            if (client.instanceId) {
                try {
                    const configTable = client.DB.table('config');
                    let instances = await configTable.get('botInstances') || [];
                    instances = instances.map(instance => {
                        if (instance.id === client.instanceId) {
                            return { ...instance, status: 'disconnected' };
                        }
                        return instance;
                    });
                    await configTable.set('botInstances', instances);
                    console.log(`✅ Updated bot instance ${client.instanceId} status to disconnected`);
                } catch (error) {
                    console.error('Error updating bot instance status:', error);
                }
            }

            const { statusCode } = new Boom(lastDisconnect?.error).output
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Connecting...')
                setTimeout(() => start(), 3000)
            } else {
                client.log('Disconnected.', 'red')
                await remove('session')
                console.log('Starting...')
                setTimeout(() => start(), 3000)
            }
        }
        if (connection === 'connecting') {
            client.state = 'connecting'
            console.log('Connecting to WhatsApp...')

            // Update bot instance status
            if (client.instanceId) {
                try {
                    const configTable = client.DB.table('config');
                    let instances = await configTable.get('botInstances') || [];
                    instances = instances.map(instance => {
                        if (instance.id === client.instanceId) {
                            return { ...instance, status: 'initializing' };
                        }
                        return instance;
                    });
                    await configTable.set('botInstances', instances);
                    console.log(`✅ Updated bot instance ${client.instanceId} status to initializing`);
                } catch (error) {
                    console.error('Error updating bot instance status:', error);
                }
            }
        }
        if (connection === 'open') {
            client.state = 'open'
            global.connected = true

            // Store the connected number if available
            if (client.user && client.user.id) {
                global.connectedNumber = client.user.id.split('@')[0]
            }

            // Update bot instance status and phone number
            if (client.instanceId) {
                try {
                    const configTable = client.DB.table('config');
                    let instances = await configTable.get('botInstances') || [];

                    // Get the phone number from the client
                    const phoneNumber = client.user.id.split('@')[0];

                    instances = instances.map(instance => {
                        if (instance.id === client.instanceId) {
                            return {
                                ...instance,
                                status: 'connected',
                                phoneNumber: phoneNumber,
                                lastConnected: Date.now()
                            };
                        }
                        return instance;
                    });
                    await configTable.set('botInstances', instances);
                    console.log(`✅ Updated bot instance ${client.instanceId} status to connected with number ${phoneNumber}`);

                    // Emit updated bot instances via Socket.IO
                    io.emit('botInstances', instances);
                } catch (error) {
                    console.error('Error updating bot instance status:', error);
                }
            }

            loadCommands()
            client.log('Connected to WhatsApp')
            client.log('Total Mods: ' + client.config.mods.length)
        }
    })

    // Original QR code endpoint
    app.get('/qr', (req, res) => {
        res.status(200).setHeader('Content-Type', 'image/png').send(client.QR)
    })

    // Serve static files from the React app
    app.use(express.static(path.join(__dirname, '../admin-panel/build')))

    // Serve the admin panel at the root
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../admin-panel/build/index.html'))
    })

    // API Endpoints for Admin Panel

    // Authentication endpoint
    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body

        try {
            // For simplicity, we're using hardcoded admin credentials
            // In production, you should use the User model from MongoDB
            if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
                const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' })
                return res.json({ token })
            }

            return res.status(401).json({ message: 'Invalid credentials' })
        } catch (error) {
            console.error('Login error:', error)
            return res.status(500).json({ message: 'Server error' })
        }
    })

    // QR Code endpoint - Railway-compatible
    app.get('/api/qrcode', (req, res) => {
        console.log('QR code requested. Available QR data:', !!client.qrRaw, 'Available QR image:', !!client.QR);

        // Calculate QR code expiration (typically valid for 60 seconds)
        const qrTimestamp = client.qrTimestamp || Date.now();
        const expiresAt = qrTimestamp + 60000; // 60 seconds from generation
        const timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

        // First check if we have raw QR data (most reliable, especially on Railway)
        if (client.qrRaw) {
            try {
                // Try to generate a fresh QR code image from the raw data
                console.log('Generating fresh QR code from raw data');
                let qrImage, qrCodeBase64;

                // First try with qr-image
                try {
                    qrImage = imageSync(client.qrRaw);
                    qrCodeBase64 = qrImage.toString('base64');
                    console.log('Successfully generated QR code with qr-image');
                } catch (qrImageError) {
                    console.error('Error generating QR with qr-image:', qrImageError);

                    // Fallback to qrcode library
                    const qrBuffer = await (async () => {
                        return new Promise((resolve, reject) => {
                            QRCode.toBuffer(client.qrRaw, (err, buffer) => {
                                if (err) reject(err);
                                else resolve(buffer);
                            });
                        });
                    })();
                    qrImage = qrBuffer;
                    qrCodeBase64 = qrBuffer.toString('base64');
                    console.log('Successfully generated QR code with qrcode library');
                }

                // Store the newly generated image for future use
                client.QR = qrImage;

                console.log(`Sending fresh QR code. Expires in ${timeLeft} seconds`);
                return res.json({
                    qrCode: qrCodeBase64,
                    qrRaw: client.qrRaw, // Include raw data as backup
                    status: client.state || 'unknown',
                    instanceId: client.instanceId,
                    timestamp: qrTimestamp,
                    expiresAt: expiresAt,
                    timeLeft: timeLeft,
                    source: 'raw_data'
                });
            } catch (err) {
                console.error('Error generating QR from raw data:', err);
                // If image generation fails, still send the raw data
                return res.json({
                    qrCode: null,
                    qrRaw: client.qrRaw, // Send raw data so client can generate QR
                    status: client.state || 'unknown',
                    instanceId: client.instanceId,
                    timestamp: qrTimestamp,
                    expiresAt: expiresAt,
                    timeLeft: timeLeft,
                    message: 'QR image generation failed, but raw data is available',
                    source: 'raw_data_only'
                });
            }
        }

        // If we have a stored QR image but no raw data, try to use that
        if (client.QR) {
            try {
                console.log('Using stored QR image');
                const qrCodeBase64 = client.QR.toString('base64');

                return res.json({
                    qrCode: qrCodeBase64,
                    status: client.state || 'unknown',
                    instanceId: client.instanceId,
                    timestamp: qrTimestamp,
                    expiresAt: expiresAt,
                    timeLeft: timeLeft,
                    source: 'stored_image'
                });
            } catch (err) {
                console.error('Error converting stored QR image to base64:', err);
            }
        }

        // If we get here, we couldn't provide a QR code
        console.log('No QR code available to send. Connection state:', client.state);

        // Check if we're connected - provide a more helpful message
        if (client.state === 'open' || global.connected) {
            return res.json({
                qrCode: null,
                status: 'open',
                instanceId: client.instanceId,
                message: 'WhatsApp is already connected. No QR code needed.'
            });
        }

        res.json({
            qrCode: null,
            status: client.state || 'unknown',
            instanceId: client.instanceId,
            message: 'No QR code available yet. Please restart the bot or wait for the QR code to be generated.'
        });
    })

    // Bot status endpoint
    app.get('/api/status', (req, res) => {
        const uptime = client ? utils.formatSeconds(process.uptime()) : '0h 0m 0s'
        const version = client ? client.version : 'Unknown'

        // Check if WhatsApp is actually connected by looking at both client.user and the global connected flag
        const isConnected = (client && client.user && client.user.id) || global.connected === true;

        // Force connection state to 'open' if we know we're connected from the logs
        const connectionState = isConnected ? 'open' : (client ? client.state : 'unknown');

        console.log('Status requested, connection state:', connectionState, 'User ID:', client?.user?.id, 'Global connected:', global.connected);

        // Get phone number from client.user or from the stored user info
        let phoneNumber = null;
        if (client && client.user && client.user.id) {
            phoneNumber = client.user.id.split('@')[0];
        } else if (global.connectedNumber) {
            phoneNumber = global.connectedNumber;
        }

        res.json({
            state: connectionState,
            uptime,
            lastRestart: new Date(Date.now() - (process.uptime() * 1000)).toLocaleString(),
            version,
            phoneNumber: phoneNumber
        })
    })

    // Groups endpoint - Get all groups
    app.get('/api/groups', authenticateToken, async (req, res) => {
        try {
            if (!client || client.state !== 'open') {
                return res.json([
                    { id: 'sample1', name: 'Sample Group 1', participants: 10 },
                    { id: 'sample2', name: 'Sample Group 2', participants: 25 }
                ]);
            }

            const groups = await client.getAllGroups();

            // Get group metadata for each group
            const groupsWithMetadata = await Promise.all(groups.map(async (groupId) => {
                try {
                    const metadata = await client.groupMetadata(groupId);
                    return {
                        id: groupId,
                        name: metadata.subject || 'Unknown Group',
                        participants: metadata.participants?.length || 0,
                        desc: metadata.desc || '',
                        isAdmin: metadata.participants?.some(p =>
                            p.id === client.user.id && (p.admin === 'admin' || p.admin === 'superadmin')
                        ) || false
                    };
                } catch (err) {
                    console.error(`Error getting metadata for group ${groupId}:`, err);
                    return {
                        id: groupId,
                        name: 'Unknown Group',
                        participants: 0,
                        desc: '',
                        isAdmin: false
                    };
                }
            }));

            res.json(groupsWithMetadata);
        } catch (error) {
            console.error('Error fetching groups:', error);
            res.status(500).json({ message: 'Failed to fetch groups' });
        }
    });

    // Broadcast endpoint - Send message to multiple groups
    app.post('/api/broadcast', authenticateToken, async (req, res) => {
        try {
            const { message, groups, type } = req.body;

            if (!message) {
                return res.status(400).json({ message: 'Message is required' });
            }

            if (!client || client.state !== 'open') {
                return res.status(400).json({ message: 'Bot is not connected to WhatsApp' });
            }

            let targetGroups = [];

            // Determine which groups to send to
            if (type === 'all') {
                targetGroups = await client.getAllGroups();
            } else if (Array.isArray(groups) && groups.length > 0) {
                targetGroups = groups;
            } else {
                return res.status(400).json({ message: 'No groups selected for broadcast' });
            }

            // Format the message with broadcast header
            const formattedMessage = `*「 ${client.config.name.toUpperCase()} BROADCAST 」*\n\n${message}\n\n`;

            let successCount = 0;
            let failedGroups = [];

            // Send message to each group
            for (const groupId of targetGroups) {
                try {
                    // Get group metadata to check if bot is admin and to get participants
                    const metadata = await client.groupMetadata(groupId);

                    // Check if bot is admin in the group
                    const botId = client.user.id;
                    const isAdmin = metadata.participants.some(
                        p => p.id === botId && (p.admin === 'admin' || p.admin === 'superadmin')
                    );

                    // Get mentions array if bot is admin
                    const mentionsArray = isAdmin ? metadata.participants.map(p => p.id) : [];

                    // If there are too many participants, send without tagging to avoid session errors
                    const CHUNK_SIZE = 15; // Maximum number of mentions per message

                    if (mentionsArray.length <= CHUNK_SIZE && isAdmin) {
                        // Send message with mentions if the group is small enough and bot is admin
                        await client.sendMessage(
                            groupId,
                            {
                                text: formattedMessage,
                                mentions: mentionsArray
                            }
                        );
                    } else {
                        // For larger groups or if bot is not admin, send without mentions
                        await client.sendMessage(
                            groupId,
                            {
                                text: formattedMessage
                            }
                        );
                    }

                    successCount++;

                    // Add a small delay between messages to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (groupError) {
                    console.error(`Error sending to group ${groupId}:`, groupError);
                    failedGroups.push(groupId);
                    // Continue with other groups even if one fails
                }
            }

            res.json({
                message: `Successfully sent message to ${successCount} out of ${targetGroups.length} groups`,
                successCount,
                totalGroups: targetGroups.length,
                failedGroups
            });

        } catch (error) {
            console.error('Error broadcasting message:', error);
            res.status(500).json({ message: 'Failed to broadcast message' });
        }
    });

    // Stats endpoint
    app.get('/api/stats', async (req, res) => {
        try {
            const uptime = client ? utils.formatSeconds(process.uptime()) : '0h 0m 0s'

            // Only try to get groups and users if client is connected
            let groups = [];
            let users = [];
            let commands = 0;

            if (client && client.state === 'open') {
                try {
                    if (client.getAllGroups) {
                        groups = await client.getAllGroups();
                    }
                } catch (err) {
                    console.log('Error fetching groups:', err.message);
                    groups = [];
                }

                try {
                    if (client.getAllUsers) {
                        users = await client.getAllUsers();
                    }
                } catch (err) {
                    console.log('Error fetching users:', err.message);
                    users = [];
                }

                commands = client.cmd ? client.cmd.size : 0;
            } else {
                // Return sample data if not connected
                console.log('Client not connected, returning sample data');
            }

            const statsData = {
                uptime,
                users: Array.isArray(users) ? users.length : 0,
                groups: Array.isArray(groups) ? groups.length : 0,
                commands
            };

            console.log('Stats requested, sending:', statsData);
            res.json(statsData);
        } catch (error) {
            console.error('Stats error:', error);
            // Return sample data instead of error
            res.json({
                uptime: utils.formatSeconds(process.uptime()),
                users: 0,
                groups: 0,
                commands: client && client.cmd ? client.cmd.size : 0
            });
        }
    })

    // Users endpoint
    app.get('/api/users', async (req, res) => {
        try {
            if (!client || !client.getAllUsers) {
                return res.json([
                    { id: 'sample1', name: 'Sample User 1', lastActive: 'Unknown', commandsUsed: 0 },
                    { id: 'sample2', name: 'Sample User 2', lastActive: 'Unknown', commandsUsed: 0 }
                ]);
            }

            const users = await client.getAllUsers()
            console.log('Users fetched:', users);

            const formattedUsers = await Promise.all(users.map(async (user) => {
                try {
                    const contact = await client.contactDB.get(user.split('@')[0])
                    return {
                        id: user,
                        name: contact || 'Unknown',
                        lastActive: 'Unknown',
                        commandsUsed: 0
                    }
                } catch (err) {
                    console.error('Error formatting user:', err);
                    return {
                        id: user,
                        name: 'Error',
                        lastActive: 'Unknown',
                        commandsUsed: 0
                    }
                }
            }))

            res.json(formattedUsers)
        } catch (error) {
            console.error('Users error:', error)
            // Return sample data instead of error
            res.json([
                { id: 'error1', name: 'Error User 1', lastActive: 'Unknown', commandsUsed: 0 },
                { id: 'error2', name: 'Error User 2', lastActive: 'Unknown', commandsUsed: 0 }
            ])
        }
    })

    // Commands endpoint
    app.get('/api/commands', (req, res) => {
        try {
            if (!client || !client.cmd) {
                return res.json([
                    { name: 'help', aliases: ['h'], category: 'general', description: 'Shows all commands', usage: 'help' },
                    { name: 'info', aliases: ['i'], category: 'general', description: 'Shows bot info', usage: 'info' }
                ]);
            }

            const commands = Array.from(client.cmd.values()).map(cmd => ({
                name: cmd.command.name,
                aliases: cmd.command.aliases || [],
                category: cmd.command.category,
                description: cmd.command.description,
                usage: cmd.command.usage
            }))

            res.json(commands)
        } catch (error) {
            console.error('Commands error:', error)
            // Return sample data instead of error
            res.json([
                { name: 'help', aliases: ['h'], category: 'general', description: 'Shows all commands', usage: 'help' },
                { name: 'info', aliases: ['i'], category: 'general', description: 'Shows bot info', usage: 'info' }
            ])
        }
    })

    // Restart endpoint
    app.post('/api/restart', async (req, res) => {
        try {
            // Emit a restart event to all connected clients
            io.emit('restart', {
                status: 'restarting',
                timestamp: Date.now()
            });
            console.log('📡 Emitted restart event to all clients');

            // Get current bot instances to emit after restart
            try {
                const configTable = client.DB.table('config');
                const instances = await configTable.get('botInstances');
                if (instances && Array.isArray(instances)) {
                    // Emit bot instances to ensure clients have latest data
                    io.emit('botInstances', instances);
                    console.log('📡 Emitted botInstances event before restart');
                }
            } catch (err) {
                console.error('Error emitting bot instances before restart:', err);
            }

            res.json({ message: 'Restart initiated' });

            // Use setTimeout to allow the response to be sent before restarting
            setTimeout(() => {
                utils.restart();
            }, 1000);
        } catch (error) {
            console.error('Restart error:', error);
            res.status(500).json({ message: 'Failed to restart bot' });
        }
    })

    // Logout endpoint
    app.post('/api/logout', async (req, res) => {
        try {
            // Reset global connection flags regardless of logout success
            global.connected = false
            global.connectedNumber = null

            if (client) {
                try {
                    await client.logout()
                    console.log('Logged out from WhatsApp')
                } catch (logoutError) {
                    console.error('Error during logout:', logoutError)
                    // Continue anyway since we want to force disconnect
                }

                // Force client state to be disconnected
                client.state = 'close'

                // Emit status update to all connected clients
                io.emit('status', { status: 'close' })

                // Get current bot instances to emit updated status
                try {
                    const configTable = client.DB.table('config');
                    const instances = await configTable.get('botInstances');
                    if (instances && Array.isArray(instances)) {
                        // Update the status of the current bot instance
                        const updatedInstances = instances.map(instance => {
                            if (instance.isActive) {
                                return {
                                    ...instance,
                                    status: 'disconnected',
                                    phoneNumber: null
                                };
                            }
                            return instance;
                        });

                        // Save updated instances
                        await configTable.set('botInstances', updatedInstances);

                        // Emit updated bot instances
                        io.emit('botInstances', updatedInstances);
                        console.log('📡 Emitted botInstances event after logout');
                    }
                } catch (err) {
                    console.error('Error updating bot instances after logout:', err);
                }

                res.json({ message: 'Logged out successfully' })
            } else {
                res.status(400).json({ message: 'No active session to logout from' })
            }
        } catch (error) {
            console.error('Logout error:', error)
            res.status(500).json({ message: 'Failed to logout' })
        }
    })

    // Get group link endpoint
    app.get('/api/settings/group-link', authenticateToken, async (req, res) => {
        try {
            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Default group link
            const defaultGroupLink = 'https://chat.whatsapp.com/default';

            // Get the group link from QuickDB or use default
            const groupLink = await configTable.get('groupLink') || defaultGroupLink;

            // Initialize default if it doesn't exist
            if (!await configTable.has('groupLink')) {
                await configTable.set('groupLink', defaultGroupLink);
                console.log('✅ Default group link created in QuickDB');
            }

            res.json({ groupLink });
        } catch (error) {
            console.error('Error fetching group link:', error);
            res.status(500).json({ message: 'Failed to fetch group link' });
        }
    });

    // Update group link endpoint
    app.post('/api/settings/group-link', authenticateToken, async (req, res) => {
        try {
            const { groupLink } = req.body;

            if (!groupLink) {
                return res.status(400).json({ message: 'Group link is required' });
            }

            // Validate the group link format
            if (!groupLink.includes('chat.whatsapp.com/')) {
                return res.status(400).json({ message: 'Invalid WhatsApp group link format' });
            }

            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Update the group link in QuickDB
            await configTable.set('groupLink', groupLink);
            console.log(`✅ Group link updated to: ${groupLink}`);

            res.json({
                message: 'Group link updated successfully',
                groupLink
            });
        } catch (error) {
            console.error('Error updating group link:', error);
            res.status(500).json({ message: 'Failed to update group link' });
        }
    });

    // Get auto-approve join requests setting endpoint
    app.get('/api/settings/auto-approve', authenticateToken, async (req, res) => {
        try {
            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Get the setting from QuickDB or use default (true)
            const autoApproveJoinRequests = await configTable.get('autoApproveJoinRequests');

            // If the setting doesn't exist yet, default to true and save it
            if (autoApproveJoinRequests === undefined) {
                await configTable.set('autoApproveJoinRequests', true);
                console.log('✅ Default auto-approve join requests setting created in QuickDB (enabled)');
                res.json({ autoApproveJoinRequests: true });
            } else {
                res.json({ autoApproveJoinRequests });
            }
        } catch (error) {
            console.error('Error fetching auto-approve setting:', error);
            res.status(500).json({ message: 'Failed to fetch auto-approve setting' });
        }
    });

    // Update auto-approve join requests setting endpoint
    app.post('/api/settings/auto-approve', authenticateToken, async (req, res) => {
        try {
            const { autoApproveJoinRequests } = req.body;

            if (autoApproveJoinRequests === undefined) {
                return res.status(400).json({ message: 'autoApproveJoinRequests setting is required' });
            }

            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Update the setting in QuickDB
            await configTable.set('autoApproveJoinRequests', !!autoApproveJoinRequests); // Convert to boolean
            console.log(`✅ Auto-approve join requests setting updated to: ${!!autoApproveJoinRequests}`);

            res.json({
                message: 'Auto-approve join requests setting updated successfully',
                autoApproveJoinRequests: !!autoApproveJoinRequests
            });
        } catch (error) {
            console.error('Error updating auto-approve setting:', error);
            res.status(500).json({ message: 'Failed to update auto-approve setting' });
        }
    });

    // Get welcome message settings endpoint
    app.get('/api/settings/welcome-message', authenticateToken, async (req, res) => {
        try {
            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Default values
            const defaultTemplate = "*‼️You will be disqualified from the Training if you don't complete these 3 steps👇*\n\n*STEP 1️⃣* - Save This Number as *GidiBanks* (Very Important)\n\n*STEP 2️⃣* - Join the training group on WhatsApp : {{whatsappLink}}\n\n*STEP 3️⃣* - Join *Hot digital Skill* community on Telegram (Very Important) : {{telegramLink}}\n\nAfter completing all steps, respond with the word \"*DONE*\"";
            const defaultWhatsappLink = 'https://chat.whatsapp.com/JTnL7g7DSl5D1yeEnpgj2n';
            const defaultTelegramLink = 'https://t.me/+XRq52g2G-BxkMWM8';

            // Get settings from QuickDB or use defaults
            const welcomeMessageTemplate = await configTable.get('welcomeMessageTemplate') || defaultTemplate;
            const whatsappTrainingLink = await configTable.get('whatsappTrainingLink') || defaultWhatsappLink;
            const telegramCommunityLink = await configTable.get('telegramCommunityLink') || defaultTelegramLink;

            // Initialize defaults if they don't exist
            if (!await configTable.has('welcomeMessageTemplate')) {
                await configTable.set('welcomeMessageTemplate', defaultTemplate);
                console.log('✅ Default welcome message template created in QuickDB');
            }

            if (!await configTable.has('whatsappTrainingLink')) {
                await configTable.set('whatsappTrainingLink', defaultWhatsappLink);
                console.log('✅ Default WhatsApp training link created in QuickDB');
            }

            if (!await configTable.has('telegramCommunityLink')) {
                await configTable.set('telegramCommunityLink', defaultTelegramLink);
                console.log('✅ Default Telegram community link created in QuickDB');
            }

            res.json({
                welcomeMessageTemplate,
                whatsappTrainingLink,
                telegramCommunityLink
            });
        } catch (error) {
            console.error('Error fetching welcome message settings:', error);
            res.status(500).json({ message: 'Failed to fetch welcome message settings' });
        }
    });

    // Bot instances endpoint
    app.get('/api/bots', authenticateToken, async (req, res) => {
        try {
            const configTable = client.DB.table('config');
            let instances = await configTable.get('botInstances');

            // If no instances exist, create a default one
            if (!instances || !Array.isArray(instances) || instances.length === 0) {
                instances = [
                    {
                        id: 1,
                        name: 'Bot 1',
                        status: client ? client.state || 'disconnected' : 'disconnected',
                        isActive: true,
                        sessionPath: 'session',
                        lastActive: Date.now(),
                        phoneNumber: global.connectedNumber || null,
                        qrTimestamp: client ? client.qrTimestamp : null
                    }
                ];
                await configTable.set('botInstances', instances);
            }

            res.json(instances);
        } catch (error) {
            console.error('Error fetching bot instances:', error);
            res.status(500).json({ message: 'Failed to fetch bot instances' });
        }
    });

    // Activate bot endpoint
    app.post('/api/bots/:botId/activate', authenticateToken, async (req, res) => {
        try {
            const botId = parseInt(req.params.botId);

            if (isNaN(botId)) {
                return res.status(400).json({ message: 'Invalid bot ID' });
            }

            const configTable = client.DB.table('config');
            let instances = await configTable.get('botInstances');

            // If no instances exist, return error
            if (!instances || !Array.isArray(instances) || instances.length === 0) {
                return res.status(404).json({ message: 'No bot instances found' });
            }

            // Find the bot to activate
            const botToActivate = instances.find(instance => instance.id === botId);
            if (!botToActivate) {
                return res.status(404).json({ message: `Bot with ID ${botId} not found` });
            }

            // Check if the bot is already active
            if (botToActivate.isActive) {
                return res.json({ message: 'Bot is already active', requiresNewQrCode: false });
            }

            // Update all instances to set only the selected one as active
            instances = instances.map(instance => ({
                ...instance,
                isActive: instance.id === botId,
                lastActive: instance.id === botId ? Date.now() : instance.lastActive
            }));

            await configTable.set('botInstances', instances);

            // Emit updated bot instances via Socket.IO
            io.emit('botInstances', instances);

            // Determine if a new QR code will be needed
            const requiresNewQrCode = botToActivate.status !== 'connected';

            res.json({
                message: `Bot ${botId} activated successfully`,
                requiresNewQrCode
            });
        } catch (error) {
            console.error('Error activating bot:', error);
            res.status(500).json({ message: 'Failed to activate bot' });
        }
    });

    // Update welcome message links endpoint
    app.post('/api/settings/welcome-message', authenticateToken, async (req, res) => {
        try {
            const { whatsappTrainingLink, telegramCommunityLink, welcomeMessageTemplate } = req.body;

            // Validate WhatsApp link
            if (whatsappTrainingLink && !whatsappTrainingLink.includes('chat.whatsapp.com/')) {
                return res.status(400).json({ message: 'Invalid WhatsApp group link format' });
            }

            // Validate Telegram link
            if (telegramCommunityLink && !telegramCommunityLink.includes('t.me/')) {
                return res.status(400).json({ message: 'Invalid Telegram link format' });
            }

            // Create a config table if it doesn't exist
            const configTable = client.DB.table('config');

            // Update the settings in QuickDB
            if (whatsappTrainingLink) {
                await configTable.set('whatsappTrainingLink', whatsappTrainingLink);
                console.log(`✅ WhatsApp training link updated to: ${whatsappTrainingLink}`);
            }

            if (telegramCommunityLink) {
                await configTable.set('telegramCommunityLink', telegramCommunityLink);
                console.log(`✅ Telegram community link updated to: ${telegramCommunityLink}`);
            }

            if (welcomeMessageTemplate) {
                await configTable.set('welcomeMessageTemplate', welcomeMessageTemplate);
                console.log('✅ Welcome message template updated');
            }

            res.json({
                message: 'Welcome message settings updated successfully',
                whatsappTrainingLink,
                telegramCommunityLink,
                welcomeMessageTemplate
            });
        } catch (error) {
            console.error('Error updating welcome message settings:', error);
            res.status(500).json({ message: 'Failed to update welcome message settings' });
        }
    });

    // Bot instances endpoints - Additional routes below

    app.post('/api/bots', authenticateToken, async (req, res) => {
        try {
            // Get existing bot instances
            const configTable = client.DB.table('config');
            let instances = await configTable.get('botInstances') || [];

            // Check if we already have 4 instances
            if (instances.length >= 4) {
                return res.status(400).json({ message: 'Maximum of 4 bot instances allowed' });
            }

            // Get custom name from request if provided
            const { name } = req.body;
            const newId = instances.length > 0 ? Math.max(...instances.map(i => i.id)) + 1 : 1;

            // Create a new instance with more metadata
            const newInstance = {
                id: newId,
                name: name || `Bot ${newId}`,
                status: 'disconnected',
                isActive: false,
                sessionPath: `session_${newId}`,
                created: Date.now(),
                lastActive: null,
                phoneNumber: null,
                qrTimestamp: null
            };

            // Add to instances array
            instances.push(newInstance);

            // Save to database
            await configTable.set('botInstances', instances);

            // Create the session directory if it doesn't exist
            const sessionDir = path.join(__dirname, '..', newInstance.sessionPath);
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
                console.log(`✅ Created session directory for bot ${newId}: ${sessionDir}`);
            }

            res.status(201).json(newInstance);
        } catch (error) {
            console.error('Error creating bot instance:', error);
            res.status(500).json({ message: 'Failed to create bot instance' });
        }
    });

    app.post('/api/bots/:id/activate', authenticateToken, async (req, res) => {
        try {
            const botId = parseInt(req.params.id);

            // Get existing bot instances
            const configTable = client.DB.table('config');
            let instances = await configTable.get('botInstances') || [];

            // Find the instance to activate
            const instanceToActivate = instances.find(i => i.id === botId);
            if (!instanceToActivate) {
                return res.status(404).json({ message: 'Bot instance not found' });
            }

            // Check if this instance is already active
            if (instanceToActivate.isActive) {
                return res.json({
                    message: 'This bot instance is already active.',
                    instance: instanceToActivate
                });
            }

            // Get the currently active instance
            const currentlyActiveInstance = instances.find(i => i.isActive);

            // Update active status and last active timestamp
            instances = instances.map(instance => ({
                ...instance,
                isActive: instance.id === botId,
                lastActive: instance.id === botId ? Date.now() : instance.lastActive
            }));

            // Save to database
            await configTable.set('botInstances', instances);

            // Log the change
            console.log(`🔄 Bot instance ${botId} activated. Current active bot is now ${instanceToActivate.name}`);

            // Emit updated bot instances via Socket.IO for real-time updates
            io.emit('botInstances', instances);
            console.log(`📡 Emitted botInstances event after activation`);

            // If the current bot is the one being activated, update its status
            if (client && client.instanceId === botId) {
                client.isActive = true;
                console.log(`✅ Current bot instance ${botId} is now active`);
            } else if (client && currentlyActiveInstance && client.instanceId === currentlyActiveInstance.id) {
                // If the current bot was active but is now being deactivated
                client.isActive = false;
                console.log(`💤 Current bot instance ${client.instanceId} is now in sleep mode`);
            }

            // Clear any existing session for this bot if it's not connected
            if (instanceToActivate.status !== 'connected' && !instanceToActivate.phoneNumber) {
                const sessionPath = instanceToActivate.sessionPath || `session_${botId}`;
                const sessionDir = path.join(__dirname, '..', sessionPath);

                // Check if the directory exists
                if (fs.existsSync(sessionDir)) {
                    try {
                        // Remove all files in the directory
                        const files = fs.readdirSync(sessionDir);
                        for (const file of files) {
                            fs.unlinkSync(path.join(sessionDir, file));
                        }
                        console.log(`🧹 Cleared session files for bot ${botId} to allow new QR code generation`);
                    } catch (err) {
                        console.error(`Error clearing session files for bot ${botId}:`, err);
                    }
                }
            }

            // Notify user that they need to restart the bot
            res.json({
                message: 'Bot instance activated. Please restart the bot to apply changes and scan a new QR code.',
                instance: instanceToActivate,
                requiresNewQrCode: instanceToActivate.status !== 'connected' && !instanceToActivate.phoneNumber
            });
        } catch (error) {
            console.error(`Error activating bot instance:`, error);
            res.status(500).json({ message: 'Failed to activate bot instance' });
        }
    });

    app.delete('/api/bots/:id', authenticateToken, async (req, res) => {
        try {
            const botId = parseInt(req.params.id);

            // Get existing bot instances
            const configTable = client.DB.table('config');
            let instances = await configTable.get('botInstances') || [];

            // Find the instance to delete
            const instanceToDelete = instances.find(i => i.id === botId);
            if (!instanceToDelete) {
                return res.status(404).json({ message: 'Bot instance not found' });
            }

            // Cannot delete active instance
            if (instanceToDelete.isActive) {
                return res.status(400).json({ message: 'Cannot delete active bot instance' });
            }

            // Remove from instances array
            instances = instances.filter(i => i.id !== botId);

            // Save to database
            await configTable.set('botInstances', instances);

            res.json({ message: 'Bot instance deleted successfully' });
        } catch (error) {
            console.error(`Error deleting bot instance:`, error);
            res.status(500).json({ message: 'Failed to delete bot instance' });
        }
    });

    // Catch-all route to serve the React app
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../admin-panel/build/index.html'))
    })

    // Socket.IO connection - Railway-compatible
    io.on('connection', async (socket) => {
        console.log('Client connected to WebSocket')

        // Send initial QR code if available
        if (client) {
            // Calculate QR code expiration (typically valid for 60 seconds)
            const qrTimestamp = client.qrTimestamp || Date.now();
            const expiresAt = qrTimestamp + 60000; // 60 seconds from generation
            const timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

            // First check if we have raw QR data (most reliable, especially on Railway)
            if (client.qrRaw) {
                try {
                    // Try to generate a fresh QR code image from the raw data
                    console.log('Socket.IO: Generating fresh QR code from raw data');
                    let qrImage, qrCodeBase64;

                    // First try with qr-image
                    try {
                        qrImage = imageSync(client.qrRaw);
                        qrCodeBase64 = qrImage.toString('base64');
                        console.log('Socket.IO: Successfully generated QR code with qr-image');
                    } catch (qrImageError) {
                        console.error('Socket.IO: Error generating QR with qr-image:', qrImageError);

                        // Fallback to qrcode library
                        const qrBuffer = await (async () => {
                            return new Promise((resolve, reject) => {
                                QRCode.toBuffer(client.qrRaw, (err, buffer) => {
                                    if (err) reject(err);
                                    else resolve(buffer);
                                });
                            });
                        })();
                        qrImage = qrBuffer;
                        qrCodeBase64 = qrBuffer.toString('base64');
                        console.log('Socket.IO: Successfully generated QR code with qrcode library');
                    }

                    // Store the newly generated image for future use
                    client.QR = qrImage;

                    console.log(`Socket.IO: Sending fresh QR code. Expires in ${timeLeft} seconds`);
                    socket.emit('qrcode', {
                        qrCode: qrCodeBase64,
                        qrRaw: client.qrRaw, // Include raw data as backup
                        status: client.state || 'unknown',
                        instanceId: client.instanceId,
                        timestamp: qrTimestamp,
                        expiresAt: expiresAt,
                        timeLeft: timeLeft,
                        source: 'raw_data'
                    });
                    return;
                } catch (err) {
                    console.error('Socket.IO: Error generating QR from raw data:', err);
                    // If image generation fails, still send the raw data
                    socket.emit('qrcode', {
                        qrCode: null,
                        qrRaw: client.qrRaw, // Send raw data so client can generate QR
                        status: client.state || 'unknown',
                        instanceId: client.instanceId,
                        timestamp: qrTimestamp,
                        expiresAt: expiresAt,
                        timeLeft: timeLeft,
                        message: 'QR image generation failed, but raw data is available',
                        source: 'raw_data_only'
                    });
                    return;
                }
            }

            // If we have a stored QR image but no raw data, try to use that
            if (client.QR) {
                try {
                    console.log('Socket.IO: Using stored QR image');
                    const qrCodeBase64 = client.QR.toString('base64');

                    socket.emit('qrcode', {
                        qrCode: qrCodeBase64,
                        status: client.state || 'unknown',
                        instanceId: client.instanceId,
                        timestamp: qrTimestamp,
                        expiresAt: expiresAt,
                        timeLeft: timeLeft,
                        source: 'stored_image'
                    });
                    return;
                } catch (err) {
                    console.error('Socket.IO: Error converting stored QR image to base64:', err);
                }
            }

            // If we're connected, send that info
            if (client.state === 'open' || global.connected) {
                socket.emit('status', {
                    status: 'open',
                    instanceId: client.instanceId,
                    timestamp: Date.now(),
                    message: 'WhatsApp is already connected. No QR code needed.'
                });
            }
        }

        // Send initial bot instances data
        try {
            const configTable = client.DB.table('config');
            configTable.get('botInstances').then(instances => {
                if (instances && Array.isArray(instances)) {
                    socket.emit('botInstances', instances);
                }
            });
        } catch (error) {
            console.error('Error sending initial bot instances data:', error);
        }

        socket.on('disconnect', () => {
            console.log('Client disconnected from WebSocket')
        })
    })

    client.ev.on('messages.upsert', async (messages) => await MessageHandler(messages, client))
    client.ev.on('contacts.update', async (update) => await contact.saveContacts(update, client))
    client.ev.on('creds.update', saveCreds)

    // Handle group join requests and participant updates
    client.ev.on('group-participants.update', async (update) => await GroupUpdateHandler(update, client))

    // Handle incoming calls - warn on first call, block on second
    client.ev.on('call', async (call) => await CallHandler(call[0], client))

    // Handle group join requests specifically
    client.ev.on('group.join_request', async (request) => {
        console.log('🔔 Group join request received:', request);
        try {
            // Check if auto-approval is enabled in settings
            const configTable = client.DB.table('config');
            const autoApproveJoinRequests = await configTable.get('autoApproveJoinRequests');

            // If auto-approval is explicitly disabled, don't proceed
            if (autoApproveJoinRequests === false) {
                console.log('⚠️ Auto-approval of join requests is disabled in settings');
                return;
            }

            // Get the group metadata to check if the bot is an admin
            try {
                const groupMetadata = await client.groupMetadata(request.chatId);
                console.log(`📋 Group name: ${groupMetadata.subject}`);

                // Check if the bot is an admin in the group
                const botId = client.user.id.split(':')[0] + '@s.whatsapp.net';
                const botIsAdmin = groupMetadata.participants.some(
                    participant => participant.id === botId && (participant.admin === 'admin' || participant.admin === 'superadmin')
                );

                if (!botIsAdmin) {
                    console.log(`⚠️ Bot is not an admin in group ${groupMetadata.subject}, cannot approve join requests`);
                    return;
                }

                // Get the requestor JID
                const requestorJid = request.request_method.requestor_jid;
                console.log(`👤 Join request from: ${requestorJid}`);

                // Approve the join request
                try {
                    console.log(`✅ Approving join request for: ${requestorJid}`);

                    // Use the correct method as provided in the example
                    const response = await client.groupRequestParticipantsUpdate(
                        request.chatId, // group id
                        [requestorJid], // array of participant JIDs
                        'approve' // action: 'approve' or 'reject'
                    );

                    console.log(`✅ Approval response:`, response);
                    console.log(`✅ Join request approved successfully for: ${requestorJid}`);
                } catch (approvalError) {
                    console.error(`🚨 Error approving join request:`, approvalError);
                }
            } catch (metadataError) {
                console.error(`🚨 Error getting group metadata:`, metadataError);
            }
        } catch (error) {
            console.error('🚨 Error handling group join request:', error);
        }
    })
    return client
}

// Start the bot without MongoDB
start().then(client => {
    // Update QR code via Socket.IO when it changes
    client.ev.on('connection.update', async (update) => {
        console.log('Connection update:', update);

        if (update.qr) {
            // Store QR code generation timestamp and raw QR data
            client.qrTimestamp = Date.now();
            client.qrRaw = update.qr;

            // Calculate QR code expiration (typically valid for 60 seconds)
            const expiresAt = client.qrTimestamp + 60000; // 60 seconds from generation
            const timeLeft = 60; // Start with 60 seconds

            // ALWAYS print the raw QR data in a format that's easy to copy
            console.log('\n\n==============================================================')
            console.log('🔴 IMPORTANT: COPY THIS QR CODE DATA TO USE WITH ONLINE QR GENERATOR 🔴')
            console.log('==============================================================')
            console.log(update.qr)
            console.log('==============================================================')
            console.log('Go to https://www.the-qrcode-generator.com/ and paste this data to generate a scannable QR code')
            console.log('==============================================================\n\n')

            try {
                // Try to generate a fresh QR code image from the raw data
                console.log('Connection update: Generating fresh QR code from raw data');
                let qrImage, qrCodeBase64;

                // First try with qr-image
                try {
                    qrImage = imageSync(update.qr);
                    qrCodeBase64 = qrImage.toString('base64');
                    console.log('Connection update: Successfully generated QR code with qr-image');
                } catch (qrImageError) {
                    console.error('Connection update: Error generating QR with qr-image:', qrImageError);

                    // Fallback to qrcode library
                    try {
                        const qrBuffer = await QRCode.toBuffer(update.qr);
                        qrImage = qrBuffer;
                        qrCodeBase64 = qrBuffer.toString('base64');
                        console.log('Connection update: Successfully generated QR code with qrcode library');
                    } catch (qrcodeError) {
                        console.error('Connection update: Error generating QR with qrcode library:', qrcodeError);
                        throw new Error('Failed to generate QR code with both libraries');
                    }
                }

                // Store the newly generated image for future use
                client.QR = qrImage;

                console.log(`Connection update: Emitting QR code. Valid for ${timeLeft} seconds`);
                io.emit('qrcode', {
                    qrCode: qrCodeBase64,
                    qrRaw: update.qr, // Include raw data as backup
                    status: client.state || 'unknown',
                    instanceId: client.instanceId,
                    timestamp: client.qrTimestamp,
                    expiresAt: expiresAt,
                    timeLeft: timeLeft,
                    source: 'connection_update'
                });
            } catch (err) {
                console.error('Connection update: Error generating QR from raw data:', err);
                // If image generation fails, still send the raw data
                io.emit('qrcode', {
                    qrCode: null,
                    qrRaw: update.qr, // Send raw data so client can generate QR
                    status: client.state || 'unknown',
                    instanceId: client.instanceId,
                    timestamp: client.qrTimestamp,
                    expiresAt: expiresAt,
                    timeLeft: timeLeft,
                    message: 'QR image generation failed, but raw data is available',
                    source: 'connection_update_raw_only'
                });
            }

            // Update QR timestamp in bot instances
            try {
                const configTable = client.DB.table('config');
                configTable.get('botInstances').then(instances => {
                    if (instances && Array.isArray(instances)) {
                        const updatedInstances = instances.map(instance => {
                            if (instance.id === client.instanceId) {
                                return {
                                    ...instance,
                                    qrTimestamp: client.qrTimestamp
                                };
                            }
                            return instance;
                        });
                        configTable.set('botInstances', updatedInstances);
                    }
                });
            } catch (error) {
                console.error('Error updating QR timestamp in bot instances:', error);
            }
        }

        if (update.connection) {
            client.state = update.connection;

            // Emit status update with instance information
            io.emit('status', {
                status: update.connection,
                instanceId: client.instanceId,
                timestamp: Date.now()
            });

            console.log('Emitted status update:', update.connection);

            // If connected, update bot instances with phone number
            if (update.connection === 'open' && client.user && client.user.id) {
                try {
                    const phoneNumber = client.user.id.split('@')[0];
                    const configTable = client.DB.table('config');
                    configTable.get('botInstances').then(instances => {
                        if (instances && Array.isArray(instances)) {
                            const updatedInstances = instances.map(instance => {
                                if (instance.id === client.instanceId) {
                                    return {
                                        ...instance,
                                        phoneNumber: phoneNumber,
                                        lastConnected: Date.now()
                                    };
                                }
                                return instance;
                            });
                            configTable.set('botInstances', updatedInstances);

                            // Emit updated bot instances
                            io.emit('botInstances', updatedInstances);
                        }
                    });
                } catch (error) {
                    console.error('Error updating phone number in bot instances:', error);
                }
            }
        }
    })

    // Emit initial status if already connected
    if (client.state === 'open' || (client.user && client.user.id)) {
        // Set global connection flags
        global.connected = true
        if (client.user && client.user.id) {
            global.connectedNumber = client.user.id.split('@')[0]
        }

        io.emit('status', {
            status: 'open',
            instanceId: client.instanceId,
            timestamp: Date.now()
        });
        console.log('Emitted initial connected status');
    }
})

// Use http server instead of app.listen to support Socket.IO
http.listen(port, () => console.log(`Server started on PORT: ${port}`))

