import pkg from "baileys"
const { proto, generateWAMessageFromContent, generateWAMessageContent } = pkg

const generate = async (type, url) => {
    const generated = await generateWAMessageContent({
        [type]: { url }
    }, {
        upload: sock.waUploadToServer
    })
    return generated[`${type}Message`]
}

const msg = generateWAMessageFromContent(m.key.remoteJid, {
    viewOnceMessage: {
        message: {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({
                    text: "body text (optional)"
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                    text: "footer text (optional)"
                }),
                header: proto.Message.InteractiveMessage.Header.create({
                    title: "some title",
                    hasMediaAttachment: true, // false if you don't want to send media with it
                    imageMessage: generate("image", "url/path to image"),
                    //videoMessage: generate("video", "url/path to video"), // if it's an video
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [{
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "button 1", // <-- displayed text
                            id: ".menu" // <-- this is the id or you may call it command 🤷‍♂️
                        }) // REMEMBER TO USE "JSON.stringify()" BECAUSE "buttonParamsJson" ONLY ACCEPTING STIRNG JSON, NOT AN OBJECT
                    },{
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "subscribe my Youtube!",
                            url: "https://youtube.com/@fannmods",
                            merchant_url: "https://youtube.com"
                        })
                    }]
                })
            })
        }
    }
}, {})

await sock.relayMessage(msg.key.remoteJid, msg.message, {
    messageId: msg.key.id
})