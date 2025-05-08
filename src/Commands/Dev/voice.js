/**
 * Command to manage voice settings for the bot's voice notes
 * Allows toggling custom voice and setting voice preferences
 */

const fs = require('fs');
const path = require('path');

module.exports.execute = async (client, flag, arg, M) => {
    try {
        // Check if the user is a mod (admin)
        const isMod = client.config.mods.includes(M.sender.split('@')[0]);
        if (!isMod) return M.reply('🔒 This command can only be used by bot moderators');

        // Get the config table
        const configTable = client.DB.table('config');
        
        // Get current voice settings
        const useCustomVoice = await configTable.get('useCustomVoice') || false;
        const voiceGender = await configTable.get('voiceGender') || 'Male';
        const voiceLanguage = await configTable.get('voiceLanguage') || 'en';
        
        // Check for custom voice samples
        const customVoiceDir = path.join(__dirname, '../../../custom-voice');
        let customVoiceSamples = [];
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(customVoiceDir)) {
            fs.mkdirSync(customVoiceDir, { recursive: true });
        }
        
        // Check for existing voice samples
        if (fs.existsSync(customVoiceDir)) {
            customVoiceSamples = fs.readdirSync(customVoiceDir)
                .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
        }
        
        // Process subcommands
        const subCommand = arg.split(' ')[0]?.toLowerCase();
        
        // If no subcommand, show current settings
        if (!subCommand) {
            let message = `🎤 *Voice Settings*\n\n`;
            message += `• Custom Voice: ${useCustomVoice ? '✅ Enabled' : '❌ Disabled'}\n`;
            message += `• Voice Gender: ${voiceGender}\n`;
            message += `• Voice Language: ${voiceLanguage}\n`;
            message += `• Custom Voice Samples: ${customVoiceSamples.length} files\n\n`;
            
            message += `*Available Commands:*\n`;
            message += `• \`${client.config.prefix}voice toggle\` - Toggle custom voice on/off\n`;
            message += `• \`${client.config.prefix}voice gender male/female\` - Set voice gender\n`;
            message += `• \`${client.config.prefix}voice language [code]\` - Set voice language (e.g., en, fr, es)\n`;
            message += `• \`${client.config.prefix}voice samples\` - List available voice samples\n`;
            message += `• \`${client.config.prefix}voice test\` - Send a test voice note\n\n`;
            
            message += `*To use a custom voice:*\n`;
            message += `1. Add .mp3 or .wav files to the \`custom-voice\` folder\n`;
            message += `2. Enable custom voice with \`${client.config.prefix}voice toggle\`\n`;
            
            return M.reply(message);
        }
        
        // Handle toggle subcommand
        if (subCommand === 'toggle') {
            const newValue = !useCustomVoice;
            await configTable.set('useCustomVoice', newValue);
            
            if (newValue && customVoiceSamples.length === 0) {
                return M.reply(`🎤 Custom voice has been *enabled*, but no voice samples were found.\n\nPlease add .mp3 or .wav files to the \`custom-voice\` folder for this to work.`);
            }
            
            return M.reply(`🎤 Custom voice has been *${newValue ? 'enabled' : 'disabled'}*`);
        }
        
        // Handle gender subcommand
        if (subCommand === 'gender') {
            const gender = arg.split(' ')[1]?.toLowerCase();
            
            if (!gender || (gender !== 'male' && gender !== 'female')) {
                return M.reply(`🎤 Please specify a valid gender: male or female\n\nExample: \`${client.config.prefix}voice gender male\``);
            }
            
            // Capitalize first letter for Windows TTS
            const formattedGender = gender.charAt(0).toUpperCase() + gender.slice(1);
            await configTable.set('voiceGender', formattedGender);
            
            return M.reply(`🎤 Voice gender has been set to *${formattedGender}*`);
        }
        
        // Handle language subcommand
        if (subCommand === 'language') {
            const language = arg.split(' ')[1]?.toLowerCase();
            
            if (!language || language.length < 2) {
                return M.reply(`🎤 Please specify a valid language code\n\nExample: \`${client.config.prefix}voice language en\`\n\nCommon codes: en (English), es (Spanish), fr (French), de (German), it (Italian), pt (Portuguese)`);
            }
            
            await configTable.set('voiceLanguage', language);
            
            return M.reply(`🎤 Voice language has been set to *${language}*`);
        }
        
        // Handle samples subcommand
        if (subCommand === 'samples') {
            if (customVoiceSamples.length === 0) {
                return M.reply(`🎤 No custom voice samples found.\n\nPlease add .mp3 or .wav files to the \`custom-voice\` folder.`);
            }
            
            let message = `🎤 *Custom Voice Samples (${customVoiceSamples.length})*\n\n`;
            customVoiceSamples.forEach((sample, index) => {
                message += `${index + 1}. ${sample}\n`;
            });
            
            return M.reply(message);
        }
        
        // Handle test subcommand
        if (subCommand === 'test') {
            // Import the sendVoiceNote function
            const { sendVoiceNote } = require('../../Handlers/Message');
            
            // Send a test voice note
            const testText = "This is a test of the voice note system. If you can hear this message, the voice settings are working correctly.";
            
            M.reply(`🎤 Sending test voice note...`);
            
            // Call the sendVoiceNote function
            const success = await sendVoiceNote(client, M, testText);
            
            if (!success) {
                return M.reply(`🔴 Failed to send test voice note. Please check the console for errors.`);
            }
            
            return; // Voice note was sent, no need for additional reply
        }
        
        // If we get here, the subcommand wasn't recognized
        return M.reply(`🎤 Unknown subcommand: ${subCommand}\n\nUse \`${client.config.prefix}voice\` without arguments to see available commands.`);
        
    } catch (error) {
        console.error('Error in voice command:', error);
        return M.reply(`🔴 Error: ${error.message}`);
    }
};

module.exports.command = {
    name: 'voice',
    aliases: ['voicenote', 'tts'],
    category: 'dev',
    exp: 0,
    usage: '[toggle | gender male/female | language code | samples | test]',
    description: 'Configure voice settings for voice notes'
};
