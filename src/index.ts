
import { createServer, Socket } from "net";

export interface ServerOptions {
  port: number;
}
const ServerOptionsDefault: ServerOptions = {
  port: 4080
};

export enum MsgType {
  AUTH = "A",
  BLOCK = "B",
  CHUNK = "C",
  DISCONNECT = "D",
  KEY = "K",
  LIGHT = "L",
  NICK = "N",
  POSITION = "P",
  REDRAW = "R",
  SIGN = "S",
  TALK = "T",
  TIME = "E",
  VERSION = "V",
  YOU = "U"
}

function packet(...args: any[]): string {
  return `${args.join(",")}\n`;
}

class Location {
  _world: string;
  _x: number;
  _y: number;
  _z: number;
  _rx: number;
  _ry: number;

  timeLastCheck: number;
  timeLastModify: number;

  constructor() {
    this._x = 0;
    this._y = 0;
    this._z = 0;
    this._rx = 0;
    this._ry = 0;
    this._world = "main";
  }
  get x(): number {
    return this._x;
  }
  get y(): number {
    return this._y;
  }
  get z(): number {
    return this._z;
  }
  get world(): string {
    return this._world;
  }
  set x(v: number) {
    this._x = v;
    this.modify();
  }
  set y(v: number) {
    this._y = v;
    this.modify();
  }
  set z(v: number) {
    this._z = v;
    this.modify();
  }
  set world(v: string) {
    this._world = v;
    this.modify();
  }
  modify() {
    this.timeLastModify = Date.now();
  }
  check() {
    this.timeLastCheck = Date.now();
  }
  get isDirty(): boolean {
    return this.timeLastCheck < this.timeLastModify;
  }
  setXYZ(x: number, y: number, z: number): this {
    this._x = x;
    this._y = y;
    this._z = z;
    this.modify();
    return this;
  }
  setRotation(rx: number, ry: number): this {
    this._rx = rx;
    this._ry = ry;
    this.modify();
    return this;
  }
  copy(other: Location): this {
    this._x = other._x;
    this._y = other._y;
    this._z = other._z;
    this._rx = other._rx;
    this._ry = other._ry;
    this._world = other._world;
    this.modify();
    return this;
  }
  toString(): string {
    return `${this._x},${this._y},${this._z},${this._rx},${this._ry}`;
  }
}

function getSocketUniqueAddress (s: Socket): string {
  return `${s.remoteAddress}:${s.remotePort}`;
}

class Client {
  model: Model;

  id: number;
  nick: string;

  socket: Socket;
  uniqueAddress: string;
  lastDataTime: number;

  location: Location;

  constructor(model: Model, socket: Socket) {
    this.model = model;
    this.socket = socket;
    this.uniqueAddress = getSocketUniqueAddress( socket );
    this.lastDataTime = Date.now();

    this.location = new Location();

    socket.on("data", (data) => {
      let dataStr: string;
      try {
        dataStr = data.toString("utf-8");
        model.handleClientMessageString(this, dataStr);
      } catch (ex) {
        model.handleClientMessageBuffer(this, data);
        // console.warn("client data could not be parsed as utf-8:", ex);
      }
    });
    socket.on("error", (err) => {
      console.log("client error", err);
      this.model.handleClientError(this, err);
    });
    socket.on("close", (hadError) => {
      this.model.handleClientClose(this, hadError);
    });
  }
  sendRaw(raw: string): this {
    this.socket.write(raw);
    return this;
  }
  send(...msgs: any[]): this {
    let msg = packet(...msgs);
    this.sendRaw(msg);
    return this;
  }
}

export type ClientMap = Map<string, Client>;

class World {
  name: string;
  spawn: Location;
  constructor(name: string) {
    this.spawn = new Location();
  }
}

class Model {
  clients: Map<string, Client>;
  lastClientId: number;
  world: World;
  welcomeMessage: string;
  textEncoder: TextEncoder;
  chunkSize: number;

  constructor() {
    this.clients = new Map();
    this.lastClientId = -1;
    this.world = new World("main");
    this.welcomeMessage = "Welcome to Craft!";
    this.textEncoder = new TextEncoder();
    this.chunkSize = 32;
  }
  getClientForSocket(s: Socket): Client {
    let result = this.clients.get(getSocketUniqueAddress( s ));
    if (result) return result;

    for (let [adr, client] of this.clients) {
      if (client.socket === s) return client;
    }
  }
  getAddressForSocket(s: Socket): string {
    //this may be undefined if client is erroed out
    if (s.remoteAddress) return getSocketUniqueAddress(s);

    //this will be available in that event, but is costlier to get
    let client = this.getClientForSocket(s);
    return client.uniqueAddress;
  }
  broadcast (...msgs: any[]): this {
    return this.broadcastRaw(packet(...msgs));
  }
  broadcastRaw (raw: string): this {
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
  chunked (n: number): number {
    return Math.floor(Math.round(n) / this.chunkSize);
  }
  handleClientMessageString(client: Client, msg: string) {
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

        this.broadcastRaw(
          packet(MsgType.BLOCK, p, q, x, y, z, type)
        );

        this.broadcastRaw(
          packet(MsgType.REDRAW, p, q)
        );
        
        // client.send(TALK, message)
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
  handleClientMessageBuffer(client: Client, msg: Buffer) {
    //TODO
  }
  handleClientError(client: Client, error: Error) {
    console.warn("Client", client, "error", error);
  }
  handleClientClose(client: Client, hadError: boolean) {
    this.clients.delete(client.uniqueAddress);
  }
  getOrCreateClient(socket: Socket): Client {
    let result = this.getClientForSocket(socket);
    if (result) return result;

    result = new Client(this, socket);
    this.handleClientConnect(result);

    return result;
  }
  next_client_id(): number {
    return ++this.lastClientId;
  }
  handleClientConnect(client: Client) {
    client.id = this.next_client_id();
    client.nick = `guest ${client.id}`;
    client.location.copy(this.world.spawn);
    this.clients.set(client.uniqueAddress, client);

    console.log(`client[${client.uniqueAddress}] -> server`);

    this.broadcast(MsgType.TALK, `Welcome ${client.nick} to the server!`);

    client.send(MsgType.YOU, client.id, client.location.toString());

    // client.send(TIME, time.time(), DAY_LENGTH)
    client.send(MsgType.TALK, this.welcomeMessage);
    client.send(MsgType.TALK, 'Type "/help" for a list of commands.');
  }
}

async function main() {
  const model = new Model();

  console.log("creating tcp server");
  let ss = createServer((socket) => {
    console.log("connected with tcp client");

    let c = model.getOrCreateClient(socket);

  });
  console.log("starting tcp server");
  ss.listen(ServerOptionsDefault.port);
  console.log("started tcp server");

}

main();
