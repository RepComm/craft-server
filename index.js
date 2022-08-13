import { createServer } from "net";
const ServerOptionsDefault = {
  port: 4080
};
export let MsgType;

(function (MsgType) {
  MsgType["AUTH"] = "A";
  MsgType["BLOCK"] = "B";
  MsgType["CHUNK"] = "C";
  MsgType["DISCONNECT"] = "D";
  MsgType["KEY"] = "K";
  MsgType["LIGHT"] = "L";
  MsgType["NICK"] = "N";
  MsgType["POSITION"] = "P";
  MsgType["REDRAW"] = "R";
  MsgType["SIGN"] = "S";
  MsgType["TALK"] = "T";
  MsgType["TIME"] = "E";
  MsgType["VERSION"] = "V";
  MsgType["YOU"] = "U";
})(MsgType || (MsgType = {}));

function packet(...args) {
  return `${args.join(",")}\n`;
}

class Location {
  constructor() {
    this._x = 0;
    this._y = 0;
    this._z = 0;
    this._rx = 0;
    this._ry = 0;
    this._world = "main";
  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  get z() {
    return this._z;
  }

  get world() {
    return this._world;
  }

  set x(v) {
    this._x = v;
    this.modify();
  }

  set y(v) {
    this._y = v;
    this.modify();
  }

  set z(v) {
    this._z = v;
    this.modify();
  }

  set world(v) {
    this._world = v;
    this.modify();
  }

  modify() {
    this.timeLastModify = Date.now();
  }

  check() {
    this.timeLastCheck = Date.now();
  }

  get isDirty() {
    return this.timeLastCheck < this.timeLastModify;
  }

  setXYZ(x, y, z) {
    this._x = x;
    this._y = y;
    this._z = z;
    this.modify();
    return this;
  }

  setRotation(rx, ry) {
    this._rx = rx;
    this._ry = ry;
    this.modify();
    return this;
  }

  copy(other) {
    this._x = other._x;
    this._y = other._y;
    this._z = other._z;
    this._rx = other._rx;
    this._ry = other._ry;
    this._world = other._world;
    this.modify();
    return this;
  }

  toString() {
    return `${this._x},${this._y},${this._z},${this._rx},${this._ry}`;
  }

}

function getSocketUniqueAddress(s) {
  return `${s.remoteAddress}:${s.remotePort}`;
}

class Client {
  constructor(model, socket) {
    this.model = model;
    this.socket = socket;
    this.uniqueAddress = getSocketUniqueAddress(socket);
    this.lastDataTime = Date.now();
    this.location = new Location();
    socket.on("data", data => {
      let dataStr;

      try {
        dataStr = data.toString("utf-8");
        model.handleClientMessageString(this, dataStr);
      } catch (ex) {
        model.handleClientMessageBuffer(this, data); // console.warn("client data could not be parsed as utf-8:", ex);
      }
    });
    socket.on("error", err => {
      console.log("client error", err);
      this.model.handleClientError(this, err);
    });
    socket.on("close", hadError => {
      this.model.handleClientClose(this, hadError);
    });
  }

  sendRaw(raw) {
    this.socket.write(raw);
    return this;
  }

  send(...msgs) {
    let msg = packet(...msgs);
    this.sendRaw(msg);
    return this;
  }

}

class World {
  constructor(name) {
    this.spawn = new Location();
  }

}

class Model {
  constructor() {
    this.clients = new Map();
    this.lastClientId = -1;
    this.world = new World("main");
    this.welcomeMessage = "Welcome to Craft!";
    this.textEncoder = new TextEncoder();
    this.chunkSize = 32;
  }

  getClientForSocket(s) {
    let result = this.clients.get(getSocketUniqueAddress(s));
    if (result) return result;

    for (let [adr, client] of this.clients) {
      if (client.socket === s) return client;
    }
  }

  getAddressForSocket(s) {
    //this may be undefined if client is erroed out
    if (s.remoteAddress) return getSocketUniqueAddress(s); //this will be available in that event, but is costlier to get

    let client = this.getClientForSocket(s);
    return client.uniqueAddress;
  }

  broadcast(...msgs) {
    return this.broadcastRaw(packet(...msgs));
  }

  broadcastRaw(raw) {
    // let encoded = this.textEncoder.encode(raw);
    // for (let [adr, client] of this.clients) {
    //   client.socket.write(encoded);
    // }
    for (let [adr, client] of this.clients) {
      console.log("sending", raw, "to client at adr", adr);
      client.sendRaw(raw);
    }

    return this;
  }

  chunked(n) {
    return Math.floor(Math.round(n) / this.chunkSize);
  }

  handleClientMessageString(client, msg) {
    // this.broadcastRaw(msg);
    // let cmd = msg.substring(0, 1);
    let [cmd, ...args] = msg.split(",");

    switch (cmd) {
      case MsgType.POSITION:
        // let []
        // console.log("player move");
        break;

      case MsgType.CHUNK:
        break;

      case MsgType.BLOCK:
        let x = parseInt(args[0]);
        let y = parseInt(args[1]);
        let z = parseInt(args[2]);
        let type = parseInt(args[3]);
        console.log("Got BLOCK:", msg, args, x, y, z, type);
        let p = this.chunked(x);
        let q = this.chunked(z);
        let previous = 0;
        this.broadcastRaw(packet(MsgType.BLOCK, p, q, x, y, z, type));
        this.broadcastRaw(packet(MsgType.REDRAW, p, q)); // client.send(TALK, message)

        break;

      case MsgType.LIGHT:
        break;

      case MsgType.TALK:
        break;

      default:
        console.log("unhandled command", cmd);
        break;
    }
  }

  handleClientMessageBuffer(client, msg) {//TODO
  }

  handleClientError(client, error) {
    console.warn("Client", client, "error", error);
  }

  handleClientClose(client, hadError) {
    this.clients.delete(client.uniqueAddress);
  }

  getOrCreateClient(socket) {
    let result = this.getClientForSocket(socket);
    if (result) return result;
    result = new Client(this, socket);
    this.handleClientConnect(result);
    return result;
  }

  next_client_id() {
    return ++this.lastClientId;
  }

  handleClientConnect(client) {
    client.id = this.next_client_id();
    client.nick = `guest ${client.id}`;
    client.location.copy(this.world.spawn);
    this.clients.set(client.uniqueAddress, client);
    console.log(`client[${client.uniqueAddress}] -> server`);
    this.broadcast(MsgType.TALK, `Welcome ${client.nick} to the server!`);
    client.send(MsgType.YOU, client.id, client.location.toString()); // client.send(TIME, time.time(), DAY_LENGTH)

    client.send(MsgType.TALK, this.welcomeMessage);
    client.send(MsgType.TALK, 'Type "/help" for a list of commands.');
  }

}

async function main() {
  const model = new Model();
  console.log("creating tcp server");
  let ss = createServer(socket => {
    console.log("connected with tcp client");
    let c = model.getOrCreateClient(socket);
  });
  console.log("starting tcp server");
  ss.listen(ServerOptionsDefault.port);
  console.log("started tcp server");
}

main();