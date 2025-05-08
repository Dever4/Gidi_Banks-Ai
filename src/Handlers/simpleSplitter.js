/**
 * Simple message splitter that enforces a strict maximum of 2 parts
 */

/**
 * Splits a message into at most 2 parts, with a hard limit on the number of parts
 *
 * @param {string} message - The message to split
 * @returns {string[]} - Array of message parts (at most 2)
 */
function simpleSplitMessage(message) {
    // If message is short enough, don't split it
    if (message.length <= 500) {
        return [message];
    }

    // Try to find a good split point near the middle
    const middlePoint = Math.floor(message.length / 2);

    // Look for sentence breaks (., !, ?)
    const sentenceBreaks = [...message.matchAll(/[.!?]\s+/g)].map(match => match.index + 1);

    // Find the sentence break closest to the middle
    let splitPoint = middlePoint;
    if (sentenceBreaks.length > 0) {
        splitPoint = sentenceBreaks.reduce((closest, current) =>
            Math.abs(current - middlePoint) < Math.abs(closest - middlePoint) ? current : closest,
            sentenceBreaks[0]);
    } else {
        // If no sentence breaks, look for a space near the middle
        const spaceNearMiddle = message.indexOf(' ', middlePoint - 50);
        if (spaceNearMiddle !== -1 && spaceNearMiddle < middlePoint + 50) {
            splitPoint = spaceNearMiddle;
        }
    }

    // Split the message at the chosen point
    const firstPart = message.substring(0, splitPoint).trim();
    const secondPart = message.substring(splitPoint).trim();

    // Return the parts
    return [firstPart, secondPart];
}

/**
 * Enforces a maximum number of message parts
 *
 * @param {string[]} parts - Array of message parts
 * @param {number} maxParts - Maximum number of parts allowed (default: 2)
 * @returns {string[]} - Array with at most maxParts elements
 */
function enforceMaxParts(parts, maxParts = 2) {
    if (parts.length <= maxParts) {
        return parts;
    }

    console.warn(`⚠️ Message was split into ${parts.length} parts, enforcing maximum of ${maxParts}`);

    // Keep the first part as is
    const result = [parts[0]];

    // Combine all remaining parts into one
    const remainingParts = parts.slice(1).join(' ');

    // If the combined part is too long, truncate it
    const maxLength = 1000;
    if (remainingParts.length > maxLength) {
        result.push(remainingParts.substring(0, maxLength) + '...');
    } else {
        result.push(remainingParts);
    }

    return result;
}

/**
 * Calculates realistic typing delays for each message part
 *
 * @param {string[]} messageParts - Array of message chunks
 * @param {object} options - Options for delay calculation
 * @param {number} options.baseDelay - Base delay between messages in ms (default: 800)
 * @param {number} options.randomVariation - Random variation to add to base delay in ms (default: 600)
 * @param {number} options.typingSpeed - Characters per second for typing simulation (default: 25)
 * @param {number} options.minTypingTime - Minimum typing time in ms (default: 500)
 * @param {number} options.maxTypingTime - Maximum typing time in ms (default: 2500)
 * @returns {number[]} - Array of delays in milliseconds
 */
function calculateTypingDelays(messageParts, options = {}) {
    const {
        baseDelay = 800,
        randomVariation = 600,
        typingSpeed = 25,
        minTypingTime = 500,
        maxTypingTime = 2500
    } = options;

    const delays = [];

    for (let i = 0; i < messageParts.length; i++) {
        const partLength = messageParts[i].length;

        // Calculate a realistic typing time based on message length
        // with some randomness to simulate variable typing speed
        const randomFactor = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
        const typingTime = Math.min(maxTypingTime,
            Math.max(minTypingTime, partLength * (1000 / typingSpeed) * randomFactor));

        // For the first message, we don't add the base delay
        if (i === 0) {
            delays.push(typingTime);
        } else {
            // For subsequent messages, add base delay + random variation + typing time
            const messageDelay = baseDelay + Math.random() * randomVariation + typingTime;
            delays.push(messageDelay);
        }
    }

    return delays;
}

module.exports = {
    simpleSplitMessage,
    enforceMaxParts,
    calculateTypingDelays
};
