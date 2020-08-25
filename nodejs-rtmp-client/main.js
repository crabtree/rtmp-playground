const RTMPClient = require("./rtmp");

const PORT = 1935
const HOST = "127.0.0.1"

async function main () {
    const c = new RTMPClient();
    try {
        await c.open(PORT, HOST);

        await c.handshake();

        await c.connect("stream");
       
        await c.disconnect();
    } catch(ex) {
        console.error(ex);
    }
}

main();
