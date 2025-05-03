module.exports.execute = async (client, flag, arg, M) => {
    try {
        const usersTable = client.DB.table('users');
        const usersData = await usersTable.all();
        const totalUsers = usersData.length;

        // Build a formatted message with a cybersecurity AI tone
        let message = `🔒 *CYBERSECURITY AI SYSTEM AUDIT*\n\n`;
        message += `🔍 *Total Registered Users:* ${totalUsers}\n\n`;
        message += `_User data channels verified and secure._`;

        M.reply(message);
    } catch (error) {
        console.error(error);
        M.reply('🟥 An error occurred while fetching user data. System alert triggered.');
    }
}

module.exports.command = {
    name: 'checkusers',
    aliases: ['usersdata', 'users'],
    category: 'db',
    exp: 0,
    usage: '',
    description: 'Performs a system audit on the "users" collection in the "test" database'
}
