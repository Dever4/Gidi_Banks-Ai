/**
 * Advanced message splitting utility for creating more natural, human-like message chunks
 */

/**
 * Splits a message into smaller, more natural chunks for human-like conversation
 *
 * @param {string} message - The message to split
 * @param {object} options - Options for splitting
 * @param {number} options.minChunkSize - Minimum chunk size (default: 150)
 * @param {number} options.maxChunkSize - Maximum chunk size (default: 500)
 * @param {boolean} options.forceMultipleParts - Whether to force splitting into multiple parts even for short messages
 * @param {boolean} options.respectParagraphs - Whether to respect paragraph breaks
 * @param {number} options.maxChunks - Maximum number of chunks to create (default: 1)
 * @returns {string[]} - Array of message chunks
 */
function splitMessage(message, options = {}) {
    // Default options
    const {
        minChunkSize = 150,  // Significantly increased minimum chunk size
        maxChunkSize = 500, // Significantly increased maximum chunk size
        forceMultipleParts = false,
        respectParagraphs = true,
        maxChunks = 1       // Default to just 1 chunk (no splitting) unless explicitly requested
    } = options;

    // If message is not very long, don't split unless forced
    // Increased threshold to avoid splitting shorter messages
    if (message.length < minChunkSize * 3 && !forceMultipleParts) {
        return [message];
    }

    // If we should respect paragraphs and there are multiple paragraphs
    if (respectParagraphs && message.includes('\n\n')) {
        const paragraphs = message.split('\n\n');

        // If paragraphs are already small enough and within our max chunks limit, use them directly
        if (paragraphs.length <= maxChunks && paragraphs.every(p => p.length <= maxChunkSize * 1.5)) {
            return paragraphs.map(p => p.trim()).filter(p => p.length > 0);
        }

        // Otherwise, process each paragraph separately and combine
        let result = [];
        for (const paragraph of paragraphs) {
            if (paragraph.trim().length === 0) continue;

            // Split each paragraph and add to result
            const paragraphParts = splitMessageInternal(paragraph, minChunkSize, maxChunkSize);
            result.push(...paragraphParts);

            // If we've exceeded our max chunks, stop processing more paragraphs
            if (result.length >= maxChunks) {
                break;
            }
        }

        // If we still have too many chunks, combine some of them
        if (result.length > maxChunks) {
            result = combineChunks(result, maxChunks);
        }

        return result;
    }

    // For single-paragraph messages, use the internal splitting logic
    let result = splitMessageInternal(message, minChunkSize, maxChunkSize);

    // If we have too many chunks, combine some of them
    if (result.length > maxChunks) {
        result = combineChunks(result, maxChunks);
    }

    return result;
}

/**
 * Internal function to split a single paragraph into smaller chunks
 *
 * @param {string} message - The message to split
 * @param {number} minChunkSize - Minimum chunk size
 * @param {number} maxChunkSize - Maximum chunk size
 * @returns {string[]} - Array of message chunks
 */
function splitMessageInternal(message, minChunkSize, maxChunkSize) {
    // If the message is already short enough, don't split it
    if (message.length <= maxChunkSize * 1.2) {
        return [message];
    }

    // Prefer to split at sentence breaks for more natural divisions
    const sentenceBreaks = [...message.matchAll(/[.!?]\s+/g)].map(match => match.index + 1);

    // If we have sentence breaks and the message isn't too long, just split at a good sentence break
    if (sentenceBreaks.length >= 1 && message.length <= maxChunkSize * 2) {
        // Find a sentence break near the middle
        const middlePoint = Math.floor(message.length / 2);
        const closestBreak = sentenceBreaks.reduce((closest, current) =>
            Math.abs(current - middlePoint) < Math.abs(closest - middlePoint) ? current : closest,
            sentenceBreaks[0]);

        return [
            message.substring(0, closestBreak).trim(),
            message.substring(closestBreak).trim()
        ];
    }

    // For longer messages, use more sophisticated splitting
    // Find all potential break points (end of sentences, commas, and other natural breaks)
    const sentenceBreaks2 = [...message.matchAll(/[.!?]\s+/g)].map(match => match.index + 1);
    const commaBreaks = [...message.matchAll(/,\s+/g)].map(match => match.index + 1);
    const colonBreaks = [...message.matchAll(/:\s+/g)].map(match => match.index + 1);
    const semicolonBreaks = [...message.matchAll(/;\s+/g)].map(match => match.index + 1);

    // Prioritize sentence breaks, then other punctuation
    const primaryBreaks = [...sentenceBreaks2];
    const secondaryBreaks = [...commaBreaks, ...colonBreaks, ...semicolonBreaks];

    // Only use conjunction breaks as a last resort
    const conjunctionBreaks = [...message.matchAll(/\s+(and|but|or|so|because|if|when|while|since|although|though|unless|until|after|before|as|whereas)\s+/gi)]
        .map(match => match.index + match[0].indexOf(' ', 1));

    // Combine all break points and sort them
    const allBreakPoints = [...primaryBreaks, ...secondaryBreaks, ...conjunctionBreaks]
        .sort((a, b) => a - b);

    // Create chunks with more conservative splitting
    const messageParts = [];
    let currentPosition = 0;

    // For very long messages, we'll split into at most 2 parts
    // Try to find a good break point near the middle
    if (message.length > maxChunkSize) {
        const middlePoint = Math.floor(message.length / 2);

        // First try to find a sentence break near the middle
        const sentenceBreakNearMiddle = primaryBreaks.find(bp =>
            bp > middlePoint - 100 && bp < middlePoint + 100);

        if (sentenceBreakNearMiddle) {
            // Split at this sentence break
            const firstPart = message.substring(0, sentenceBreakNearMiddle).trim();
            const secondPart = message.substring(sentenceBreakNearMiddle).trim();

            if (firstPart.length > 0) messageParts.push(firstPart);
            if (secondPart.length > 0) messageParts.push(secondPart);

            return messageParts;
        }

        // If no good sentence break, try a comma or other punctuation
        const punctuationBreakNearMiddle = secondaryBreaks.find(bp =>
            bp > middlePoint - 100 && bp < middlePoint + 100);

        if (punctuationBreakNearMiddle) {
            // Split at this punctuation
            const firstPart = message.substring(0, punctuationBreakNearMiddle).trim();
            const secondPart = message.substring(punctuationBreakNearMiddle).trim();

            if (firstPart.length > 0) messageParts.push(firstPart);
            if (secondPart.length > 0) messageParts.push(secondPart);

            return messageParts;
        }

        // Last resort: find a space near the middle
        const spacesNearMiddle = [...message.substring(middlePoint - 50, middlePoint + 50).matchAll(/\s+/g)]
            .map(match => match.index + (middlePoint - 50));

        if (spacesNearMiddle.length > 0) {
            // Find the space closest to the middle
            const closestSpace = spacesNearMiddle.reduce((closest, current) =>
                Math.abs(current - middlePoint) < Math.abs(closest - middlePoint) ? current : closest,
                spacesNearMiddle[0]);

            // Split at this space
            const firstPart = message.substring(0, closestSpace).trim();
            const secondPart = message.substring(closestSpace).trim();

            if (firstPart.length > 0) messageParts.push(firstPart);
            if (secondPart.length > 0) messageParts.push(secondPart);

            return messageParts;
        }
    }

    // If we couldn't split it well or it's not that long, just return the whole message
    messageParts.push(message);

    // Add natural language connectors to the beginning of parts (except the first)
    // to make the split feel more natural
    for (let i = 1; i < messageParts.length; i++) {
        // Only add connectors if the part doesn't already start with one
        const part = messageParts[i];
        const lowerPart = part.toLowerCase();

        // Skip if already starts with a connector
        if (lowerPart.startsWith('and ') ||
            lowerPart.startsWith('but ') ||
            lowerPart.startsWith('so ') ||
            lowerPart.startsWith('also ') ||
            lowerPart.startsWith('plus ') ||
            lowerPart.startsWith('then ') ||
            lowerPart.startsWith('actually ') ||
            lowerPart.startsWith('basically ') ||
            lowerPart.startsWith('honestly ')) {
            continue;
        }

        // Skip if it's a continuation of a sentence (starts with lowercase)
        if (part.length > 0 && part[0] === part[0].toLowerCase() && part[0] !== part[0].toUpperCase()) {
            continue;
        }

        // Randomly add connectors to some parts
        if (Math.random() < 0.4) { // 40% chance to add a connector
            const connectors = [
                'And', 'Also', 'Plus', 'Actually', 'Oh and', 'By the way',
                'Remember', 'Importantly', 'The thing is'
            ];
            const randomConnector = connectors[Math.floor(Math.random() * connectors.length)];
            messageParts[i] = randomConnector + ', ' + part;
        }
    }

    return messageParts;
}

/**
 * Combines message chunks to reduce the total number of chunks
 *
 * @param {string[]} chunks - Array of message chunks
 * @param {number} maxChunks - Maximum number of chunks to create
 * @returns {string[]} - Array of combined message chunks
 */
function combineChunks(chunks, maxChunks) {
    // If we already have fewer chunks than the maximum, return as is
    if (chunks.length <= maxChunks) {
        return chunks;
    }

    // Calculate how many chunks we need to combine
    const numChunksToCombine = chunks.length - maxChunks;

    // Create a copy of the chunks array
    const result = [...chunks];

    // Combine the smallest adjacent chunks first
    for (let i = 0; i < numChunksToCombine; i++) {
        // Find the smallest adjacent pair
        let smallestPairIndex = 0;
        let smallestPairSize = Infinity;

        for (let j = 0; j < result.length - 1; j++) {
            const pairSize = result[j].length + result[j + 1].length;
            if (pairSize < smallestPairSize) {
                smallestPairSize = pairSize;
                smallestPairIndex = j;
            }
        }

        // Combine the smallest pair
        const firstChunk = result[smallestPairIndex];
        const secondChunk = result[smallestPairIndex + 1];

        // Check if we need to add a connector between the chunks
        let combinedChunk;
        if (secondChunk.startsWith('And') ||
            secondChunk.startsWith('Also') ||
            secondChunk.startsWith('Plus') ||
            secondChunk.startsWith('Actually') ||
            secondChunk.startsWith('Oh and') ||
            secondChunk.startsWith('By the way') ||
            secondChunk.startsWith('Remember') ||
            secondChunk.startsWith('Importantly') ||
            secondChunk.startsWith('The thing is')) {
            // If the second chunk already starts with a connector, just add a space
            combinedChunk = firstChunk + ' ' + secondChunk;
        } else {
            // Otherwise, add a connector based on the context
            const lastCharOfFirst = firstChunk.charAt(firstChunk.length - 1);
            if (lastCharOfFirst === '.' || lastCharOfFirst === '!' || lastCharOfFirst === '?') {
                // If the first chunk ends with a sentence-ending punctuation, just add a space
                combinedChunk = firstChunk + ' ' + secondChunk;
            } else if (lastCharOfFirst === ',') {
                // If the first chunk ends with a comma, add a conjunction
                const conjunctions = ['and', 'also', 'plus'];
                const randomConjunction = conjunctions[Math.floor(Math.random() * conjunctions.length)];
                combinedChunk = firstChunk + ' ' + randomConjunction + ' ' + secondChunk;
            } else {
                // Otherwise, add a comma and a space
                combinedChunk = firstChunk + ', ' + secondChunk;
            }
        }

        // Replace the pair with the combined chunk
        result.splice(smallestPairIndex, 2, combinedChunk);
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
    splitMessage,
    calculateTypingDelays,
    combineChunks
};
