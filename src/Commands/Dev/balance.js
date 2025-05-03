module.exports.execute = async (client, flag, arg, M) => {
    try {
        // Fetch the wallet data from the API
        const res = await fetch('https://app-nkaydata-biometrics-com.onrender.com/api/wallet');
        
        if (!res.ok) {
            return M.reply('🟥 Failed to retrieve balance. Please try again later.');
        }
        
        const data = await res.json();
        
        // Assume the API returns an object with a "wallet_balance" property
        const balance = data.wallet_balance;
        
        if (balance === undefined) {
            return M.reply('🟥 Could not find balance information in the response.');
        }
        
        // Format the balance with commas for thousands (e.g., 1,000,000)
        const formattedBalance = Number(balance).toLocaleString('en-US');
        
        // Reply with a formatted message including the Naira symbol (₦)
        M.reply(`🟩 *Datastation Nkaydata Wallet Balance*\n\n*Datastation:* *₦${formattedBalance}*\n\n_Thank you for using our services!_`);
    } catch (error) {
        console.error(error);
        M.reply('🟥 An error occurred while fetching your balance.');
    }
}

module.exports.command = {
    name: 'balance',
    aliases: ['bal'],
    category: 'info',
    exp: 0,
    usage: '',
    description: 'Fetches your wallet balance from the API'
}
