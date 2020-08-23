const net = require("net");
const events = require("events");

const HandshakeStage = {  S0: 0, S1: 1,  S2: 2 };

const AMF0Type = { Number: 0x00, Boolean: 0x01, String: 0x02, Object: 0x03 };
const AMF0MessageType = { Command: 0x14 };
const AMF3MessageType = { Command: 0x11 };
const AudioCodecs = {
    SUPPORT_SND_NONE:    0x0001,
    SUPPORT_SND_ADPCM:   0x0002,
    SUPPORT_SND_MP3:     0x0004,
    SUPPORT_SND_INTEL:   0x0008,
    SUPPORT_SND_UNUSED:  0x0010,
    SUPPORT_SND_NELLY8:  0x0020,
    SUPPORT_SND_NELLY:   0x0040,
    SUPPORT_SND_G711A:   0x0080,
    SUPPORT_SND_G711U:   0x0100,
    SUPPORT_SND_NELLY16: 0x0200,
    SUPPORT_SND_AAC:     0x0400,
    SUPPORT_SND_SPEEX:   0x0800,
};
const VideoCodecs = {
    SUPPORT_VID_UNUSED:    0x01,
    SUPPORT_VID_JPEG:      0x02,
    SUPPORT_VID_SORENSON:  0x04,
    SUPPORT_VID_HOMEBREW:  0x08,
    SUPPORT_VID_VP6:       0x10,
    SUPPORT_VID_VP6ALPHA:  0x20,
    SUPPORT_VID_HOMEBREWV: 0x40,
    SUPPORT_VID_H264:      0x80,
};
const VideoFuntion = {
    SUPPORT_VID_CLIENT_SEEK: 0x01,
};

const EOM = [0x00, 0x00, 0x09];

class RTMPClient extends events.EventEmitter {
    constructor() {
        super();
        this.s = new net.Socket();
    }

    connect(port, host) {
        return new Promise((resolve, reject) => {
            this.s.on("error", (err) => { 
                this.s.removeAllListeners();
                reject(err); 
            });

            this.s.on("connect", () => {
                this.s.removeAllListeners(); 
                resolve(); 
            });

            this.s.connect(port, host, () => {
                console.log(`Connected to ${host} on port ${port}.`);
            });
        });
    }

    disconnect() {
        return new Promise((resolve) => {
            this.s.on("close", () => {
                console.log(`Connection closed.`);
                resolve();
            });

            this.s.destroy();
        });
    }

    handshake() {
        let S0, S1, S2; 
        let buf = Buffer.alloc(0);
        let stage = HandshakeStage.S0;
        
        return new Promise((resolve, reject) => {
            this.s.on("end", () => {
                this.s.removeAllListeners();
                reject(new Error("Connection closed unexpectedly."));
            });

            this.s.on("data", (data) => {
                console.log(`Received ${data.length}.`);
                
                buf = Buffer.concat([buf, data]);
                
                if (buf.length >= 1 && stage === HandshakeStage.S0) {
                    S0 = new C0S0(buf.slice(0,1));
                    stage = HandshakeStage.S1;
                }
                
                if (buf.length >= 1537 && stage === HandshakeStage.S1) {
                    S1 = new C1S1(
                        buf.slice(1, 5), // S1 timestamp 
                        buf.slice(9, 1537)); // S1 random
                    stage = HandshakeStage.S2;
                }
                
                if (buf.length >= 3073 && stage === HandshakeStage.S2) {
                    S2 = new C2S2(
                        buf.slice(1537, 1541), // S2 timestamp
                        buf.slice(1541, 1545), // S2 timestamp2
                        buf.slice(1545, 3073)); // S2 random
                    
                    this.s.write( // Send C2
                        new Uint8Array([
                            ...S1.time, // C2 time
                            ...toBytes(4, 1), // C2 time1
                            ...S1.random // C2 random
                        ])
                    );
                    
                    this.s.removeAllListeners();
                    this.s.on("data", recv(this));
                    resolve();
                }
            });

            this.s.write( // Send C0 & C1
                new Uint8Array([
                    0x03, // C0
                    ...toBytes(4, 0), // C1 time
                    ...toBytes(4, 0), // C1 zero
                    ...Uint8Array.from(
                        { length: 1528 }, 
                        () => Math.floor(Math.random() * 50)) // C1 random
                ])
            );
        });
    }

    command(cmd) {
        return new Promise((resolve) => {
            const cmdObj = [
                ...toCommandName(cmd),
                ...toTransactionID(1),
                AMF0Type.Object,
                ...toStringProperty("app", "stream"),
                ...toStringProperty("flashVer", "LNX 10,0,32,18"),
                ...toStringProperty("tcUrl", "rtmp://localhost:1935/stream"),
                ...toBooleanProperty("fpad", false),
                ...toNumberProperty("capabilities", 15),
                ...toNumberProperty("audioCodecs", 
                    AudioCodecs.SUPPORT_SND_NONE
                    | AudioCodecs.SUPPORT_SND_ADPCM
                    | AudioCodecs.SUPPORT_SND_MP3
                    | AudioCodecs.SUPPORT_SND_UNUSED
                    | AudioCodecs.SUPPORT_SND_NELLY8
                    | AudioCodecs.SUPPORT_SND_NELLY
                    | AudioCodecs.SUPPORT_SND_AAC
                    | AudioCodecs.SUPPORT_SND_SPEEX),
                ...toNumberProperty("videoCodecs", 
                    VideoCodecs.SUPPORT_VID_SORENSON
                    | VideoCodecs.SUPPORT_VID_HOMEBREW
                    | VideoCodecs.SUPPORT_VID_VP6
                    | VideoCodecs.SUPPORT_VID_VP6ALPHA
                    | VideoCodecs.SUPPORT_VID_HOMEBREWV
                    | VideoCodecs.SUPPORT_VID_H264),
                ...toNumberProperty("videoFunction", 
                    VideoFuntion.SUPPORT_VID_CLIENT_SEEK),
                ...EOM,
            ];
            
            const msg = [
                0x3, // format and chunk stream ID
                0x0, 0x0, 0x0, // timestamp
                ...toBytes(3, cmdObj.length),
                AMF0MessageType.Command,
                ...toBytes(4, 0), // stream ID
                ...cmdObj,
            ];
            
            for (var i = 140; i < msg.length; i += 140) {
                msg.splice(i, 0, 0xc3);
            }
            
            this.s.write(new Uint8Array(msg), (err) => {
                if(err) {
                    console.error(err);
                }
                
                resolve();
            });
        }); 
    }
} 

function recv(client) {
    let buf = Buffer.alloc(0);

    return function(data) {
        console.log(data);
        buf = Buffer.concat([buf, data]);
        
        // determine fmt
        // (byte & 192) >> 6 => 0,1,2,3
    }
}

function toTransactionID(id) {
    return [
        AMF0Type.Number,
        ...toNumber(id)
    ];
}

function toNumber(number) {
    const b = Buffer.alloc(8)
    b.writeDoubleBE(number)
    return b
}

function toCommandName(cmd) {
    return [
        AMF0Type.String,
        ...toBytes(2, cmd.length),
        ...Buffer.from(cmd),
    ];
}

function toNumberProperty(name, value) {
    return [
        ...toBytes(2, name.length),
        ...Buffer.from(name),
        AMF0Type.Number,
        ...toNumber(value)
    ];
}

function toBooleanProperty(name, value) {
    return [
        ...toBytes(2, name.length),
        ...Buffer.from(name),
        AMF0Type.Boolean,
        (value) ? 1 : 0
    ];
}

function toStringProperty(name, value) {
    return [
        ...toBytes(2, name.length),
        ...Buffer.from(name),
        AMF0Type.String,
        ...toBytes(2, value.length),
        ...Buffer.from(value)
    ];
}

function toBytes(bytes, data) {
    const b = Buffer.alloc(bytes);
    let prevMax = 0;
    for(var i = 0; i < bytes; i++) {
        const shift = i*8;
        const max = Math.pow(2, (i+1)*8)-1;
        const mask = max - prevMax;
        const idx = bytes - i - 1;
        b[idx] = (data & mask) >> shift;
        prevMax = max;
    }
    return b;
}

class C0S0 {
    constructor(v) {
        this.version = v;
    }
}

class C1S1 {
    constructor(t, r) {
        this.time = t;
        this.random = r;
    }
}

class C2S2 {
    constructor(t, t2, r) {
        this.time = t;
        this.time2 = t2;
        this.random = r;
    }
}

module.exports = RTMPClient;