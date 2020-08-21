const net = require("net");

const HandshakeStage = {  S0: 0, S1: 1,  S2: 2 };

class RTMPClient {
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
            })
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
        
        return new Promise((resolve) => {
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
                            0x0, 0x0 ,0x0 , 0x1, // C2 time1
                            ...S1.random // C2 random
                        ])
                    );
                    
                    this.s.removeAllListeners();
                    resolve();
                }
            });

            this.s.write( // Send C0 & C1
                new Uint8Array([
                    0x03, // C0
                    0x0, 0x0, 0x0, 0x0, // C1 time
                    0x0, 0x0, 0x0, 0x0, // C1 zero
                    ...Uint8Array.from(
                        { length: 1528 }, 
                        () => Math.floor(Math.random() * 50)) // C1 random
                ])
            );
        });
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

module.exports = RTMPClient;