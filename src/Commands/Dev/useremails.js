const { MongoClient } = require('mongodb');

module.exports.execute = async (client, flag, arg, M) => {
    const url = process.env.URL;
    if (!url) {
        return M.reply("🟥 MongoDB connection URL not provided.");
    }
    
    const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    };
    
    // Create a new MongoClient instance and connect to the database
    const mongoClient = new MongoClient(url, options);
    
    try {
        await mongoClient.connect();
        const db = mongoClient.db('test');
        const usersCollection = db.collection('users');
        
        // Retrieve all documents from the "users" collection
        const usersData = await usersCollection.find({}).toArray();
        
        // Extract the email field from each document (assuming it's a top-level field)
        const emails = usersData
            .map(user => user.email)
            .filter(email => email); // Remove undefined or empty emails
        
        if (emails.length === 0) {
            return M.reply("🟥 No email addresses found in user data.");
        }
        
        // Build a neatly arranged message
        let message = `📧 *User Email Directory*\n\n`;
        message += `*Total Emails:* ${emails.length}\n\n`;
        emails.forEach((email, index) => {
            message += `*${index + 1}.* ${email}\n`;
        });
        
        M.reply(message);
    } catch (error) {
        console.error(error);
        M.reply("🟥 An error occurred while fetching email addresses.");
    } finally {
        // Ensure the connection is closed after the query
        await mongoClient.close();
    }
};

module.exports.command = {
    name: 'useremails',
    aliases: ['emails', 'getemails'],
    category: 'db',
    exp: 0,
    usage: '',
    description: 'Retrieves and displays all user email addresses from the MongoDB database'
};
