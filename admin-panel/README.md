# WhatsApp Bot Admin Panel

This is an admin panel for the WhatsApp bot that allows you to:

- View and scan the QR code for WhatsApp authentication
- Monitor bot status
- View user statistics
- Manage bot commands
- Restart the bot

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Build the admin panel:
   ```
   npm run build
   ```

3. The built files will be placed in the `build` directory, which will be served by the main WhatsApp bot server.

## Development

To run the admin panel in development mode:

```
npm start
```

This will start the development server on port 3001 (to avoid conflicts with the WhatsApp bot server on port 3000).

## Authentication

The admin panel uses a simple authentication system. The default credentials are:

- Email: admin@example.com
- Password: admin123

You can change these in the `.env` file of the main WhatsApp bot project:

```
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-secret-key
```

## Integration with WhatsApp Bot

The admin panel is designed to work with the WhatsApp bot server. The bot server serves the built admin panel files and provides the necessary API endpoints for the admin panel to function.

To start both the WhatsApp bot and the admin panel together, run:

```
npm run start-with-admin
```

This will build the admin panel and then start the WhatsApp bot server.
