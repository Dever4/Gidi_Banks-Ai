# WhatsApp Bot with Admin Panel

A WhatsApp bot built with Baileys that includes an admin panel for easy management.

## Features

- WhatsApp bot with various commands
- Admin panel for bot management
- QR code display in both terminal and admin panel
- User and group management
- Command management
- Bot status monitoring

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with the following variables:
   ```
   URL=your-mongodb-url
   PREFIX=/
   NAME=YourBotName
   MODS=your-number
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=admin123
   JWT_SECRET=your-secret-key
   ```

3. Build the admin panel:
   ```
   npm run build-admin
   ```

4. Start the bot with the admin panel:
   ```
   npm run start-with-admin
   ```

## Admin Panel

The admin panel provides a web interface to manage your WhatsApp bot. It includes:

- QR code display for WhatsApp authentication
- Bot status monitoring
- User statistics
- Command management
- Restart functionality

### Accessing the Admin Panel

Once the bot is running, you can access the admin panel at:

```
http://localhost:3000
```

Use the credentials specified in your `.env` file to log in:
- Email: ADMIN_EMAIL value
- Password: ADMIN_PASSWORD value

## Development

For development, you can run:

```
npm run dev
```

This will start the bot with nodemon for automatic reloading when you make changes.

To develop the admin panel, navigate to the `admin-panel` directory and run:

```
npm start
```

This will start the React development server for the admin panel.

## License

See LICENSE.md for details.
