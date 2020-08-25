const net = require("net");
const events = require("events");

const HandshakeStage = { S0: 0, S1: 1,  S2: 2 };

const AMF0Type = { 
    Number:  0x00, 0x00: "Number",
    Boolean: 0x01, 0x01: "Boolean",
    String:  0x02, 0x02: "String",
    Object:  0x03, 0x03: "Object",
    NULL:    0x05, 0x05: "NULL",
};
const AMF0MessageType = { 
    UserControl:   0x04, 0x04: "UserControl",
    WindowAckSize: 0x05, 0x05: "WindowAckSize",
    SetPeerBandw:  0x06, 0x06: "SetPeerBandw",
    AudioData:     0x08, 0x08: "AudioData",
    VideoData:     0x09, 0x09: "VideoData",
    Command:       0x14, 0x14: "Command",
};
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
const NetConnStreamID = [ 0x00, 0x00, 0x00, 0x00 ];
const EOM = [ 0x00, 0x00, 0x09 ]; // end of object marker

class RTMPClient extends events.EventEmitter {
    constructor() {
        super();
        this.s = new net.Socket();
    }

    open(port, host) {
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

    connect(app) {
        const cmdName = "connect";
        const transactionID = 1;
        const obj = new AMF0Object([
            new AMF0Property("app", new AMF0String(app)),
            new AMF0Property("flashVer", new AMF0String("LNX 10,0,32,18")),
            new AMF0Property("tcUrl", new AMF0String("rtmp://localhost:1935/stream")),
            new AMF0Property("fpad", new AMF0Boolean(false)),
            new AMF0Property("capabilities", new AMF0Number(15)),
            new AMF0Property("audioCodecs", new AMF0Number(
                AudioCodecs.SUPPORT_SND_NONE
                | AudioCodecs.SUPPORT_SND_ADPCM
                | AudioCodecs.SUPPORT_SND_MP3
                | AudioCodecs.SUPPORT_SND_UNUSED
                | AudioCodecs.SUPPORT_SND_NELLY8
                | AudioCodecs.SUPPORT_SND_NELLY
                | AudioCodecs.SUPPORT_SND_AAC
                | AudioCodecs.SUPPORT_SND_SPEEX)),
            new AMF0Property("videoCodecs", new AMF0Number(
                VideoCodecs.SUPPORT_VID_SORENSON
                | VideoCodecs.SUPPORT_VID_HOMEBREW
                | VideoCodecs.SUPPORT_VID_VP6
                | VideoCodecs.SUPPORT_VID_VP6ALPHA
                | VideoCodecs.SUPPORT_VID_HOMEBREWV
                | VideoCodecs.SUPPORT_VID_H264)),
            new AMF0Property("videoFunction", new AMF0Number(
                VideoFuntion.SUPPORT_VID_CLIENT_SEEK)),
        ]);
        const cmd = new AMF0Command(cmdName, transactionID, [obj]);

        return this._command(cmd);
    }

    createStream() {
        const cmdName = "createStream";
        const transactionID = 2;
        const obj = new AMF0ObjectNull();
        const cmd = new AMF0Command(
            cmdName, transactionID, [obj]);

        return this._command(cmd);
    }

    play(name) {
        const cmdName = "play";
        const transactionID = 4;
        const obj = new AMF0ObjectNull();
        const streamName = new AMF0String(name);
        const start = new AMF0Number(-1000);
        // TODO: handle duration and reset properties?

        const cmd = new AMF0Command(
            cmdName, transactionID, [obj, streamName, start]);
        
        return this._command(cmd);
    }

    _command(cmd) {
        const cmdBytes = cmd.toBytes();
        return new Promise((resolve, reject) => {
            const msg = [
                0x03, // format and chunk stream ID
                0x00, 0x00, 0x00, // timestamp
                ...toBytes(3, cmdBytes.length),
                AMF0MessageType.Command,
                ...NetConnStreamID,
                ...cmdBytes,
            ];

            for (var i = 140; i < msg.length; i += 140) {
                msg.splice(i, 0, 0xc3);
            }

            this.s.write(new Uint8Array(msg), (err) => {
                if(err) {
                    console.error(err);
                    reject();
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

class AMF0BaseType {
    constructor(type) {
        this.type = type;
    }

    toBytes() {
        return [
            this.type,
        ];
    }
}

class AMF0Number extends AMF0BaseType {
    constructor(value) {
        super(AMF0Type.Number);
        this.value = value;
    }

    toBytes() {
        return [
            ...super.toBytes(),
            ...toNumber(this.value),
        ];
    }
}

class AMF0Boolean extends AMF0BaseType {
    constructor(value) {
        super(AMF0Type.Boolean);
        this.value = value;
    }

    toBytes() {
        return [
            ...super.toBytes(),
            (this.value) ? 0x01 : 0x00,
        ];
    }
}

class AMF0String extends AMF0BaseType {
    constructor(value) {
        super(AMF0Type.String);
        this.value = value;
    }

    toBytes() {
        return [
            ...super.toBytes(),
            ...toString(this.value),
        ];
    }
}

class AMF0Property {
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }

    toBytes() {
        return [
            ...toString(this.name),
            ...this.value.toBytes(),
        ];
    }
}

class AMF0Command {
    constructor(name, transactionID, objects) {
        this.name = name;
        this.transactionID = transactionID;
        this.objects = objects || [];
    }

    toBytes() {
        return [
            ...toCommandName(this.name),
            ...toTransactionID(this.transactionID),
            ...this.objects.reduce(
                (p, c) => { p.push(...c.toBytes()); return p; }, []),
        ];
    }
}

class AMF0Object {
    constructor(properties) {
        this.type = AMF0Type.Object;
        this.properties = properties || [];
    }

    addPoperty(property) {
        this.properties.push(property);
    }

    toBytes() {
        return [
            this.type,
            ...this.properties.reduce(
                (p, c) => { p.push(...c.toBytes()); return p; }, []),
            ...EOM,
        ];
    }
}

class AMF0ObjectNull {
    constructor() {}
    
    toBytes() {
        return [AMF0Type.NULL];
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

function toString(value) {
    return [
        ...toBytes(2, value.length),
        ...Buffer.from(value),
    ];
}

function toCommandName(cmd) {
    return [
        AMF0Type.String,
        ...toString(cmd),
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

module.exports = RTMPClient;