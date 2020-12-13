import * as https from 'https';
import axios from 'axios';
import {AxiosInstance} from 'axios';
import * as MQTT from 'async-mqtt';
import {AsyncMqttClient} from 'async-mqtt';

const DREAMCATCHER_ROOT = "dc11.iotdreamcatcher.net";
const APP_VERSION = "1.8.2";

interface Uib {
    uacDomain: string;
    uacIP: string;
    psbDomain: string;
    psbIP: string;
    dibDomain: string;
    dibIP: string;
    relayDomain: string;
    relayIP: string;
    relayPort: string;
    p2pPort: string;
    token: string;
}

export interface DeviceInfo {
    auth: string;
    deviceID: string;
    productID: string;
    enu_modelid: string;
    deviceAlias: string;
    deviceOrder: string;
    cmdIP: string;
    cmdDomain: string;
    period: string;
    time: string;
    day: string;
    timezone: string;

}


export class DeviceConnection {
    private mqtt: AsyncMqttClient;
    private device: DeviceInfo;
    private alias: string;
    private clientId: string;

    constructor(mqtt: AsyncMqttClient, deviceInfo: DeviceInfo, alias: string) {
        this.mqtt = mqtt;
        this.device = deviceInfo;
        this.alias = alias;

        this.clientId = "android_" + Math.floor(Math.random() * 1000000);

        this.mqtt.on("message", (topic, message) => {
            const msg = JSON.parse(message.toString());
            console.info(topic);
            console.dir(msg, { depth: 10 });
        });
    }

    send(message: any) {
        this.mqtt.publish("00s/01/x/300/" + this.device.deviceID + "/post/111", JSON.stringify(message));
    }

    buildK1ActionMessage(subject: string, request: any): any {
        return {
            message: {
                type: "broadcast",
                to: this.device.deviceID,
                from: this.clientId,
                username: this.alias,
                ack_mark: "0",
                subject: subject,
                request: request
            }
        };
    }

    public getAllDevices() {
        let msg = this.buildK1ActionMessage("zwave", { action: "get_all_devices", status: "ok"});
        this.send(msg);
    }

}

export class Client {
    private client: AxiosInstance;
    private options: any;
    private username: string;
    private alias: string;
    private uuid: string;
    private uib: Uib;
    private token: string;

    private constructor(client: AxiosInstance, options: any, username: string, alias: string, uuid: string, uib: Uib, token: string) {
        this.client = axios;
        this.options = options;
        this.username = username;
        this.alias = alias;
        this.uuid = uuid;
        this.uib = uib;
        this.token = token;
    }

    public static async login(username: string, password: string, uuid: string): Promise<Client> {
        let client = axios.create();
        let options: any = {
            httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: true })
        };

        let resp = await client.get("https://" + DREAMCATCHER_ROOT + "/uib/GET/userReg/00s/01/com.dreamcatcher.smanos/android/" + uuid + "-com.chuango.h4plus/127.0.0.1/" + Date.now());
        let uib: any = resp.data.uibReturn;
        if(uib && uib["Return status"] == "200") {
            options.baseURL = "https://" + uib.uacIP ;
            resp = await client.get("/uac/SET/userLogin/00s/01/com.dreamcatcher.smanos/" + username + "//" + APP_VERSION + "/" + uuid + "-com.chuango.h4plus/" + uib.token + "/" + Date.now() + "/dc/en/h4_plus", Object.assign({
                headers: { "dcsn": encodeURIComponent(password) }
            }, options));

            if(resp.data && resp.data.status == "200") {
                const token = resp.data.token;

                resp = await client.get("/uac/GET/getUserInfo/00s/01/com.dreamcatcher.smanos/" + username + "//" + uib.token + "/" + Date.now(), options);
                if(resp.data && resp.data.status == "200") {
                    return new Client(client, options, username, resp.data.user.userAlias, uuid, uib, token);
                }
            }
        }

        throw resp.data;
    }

    public async listDevices(): Promise<DeviceInfo[]> {
        let resp = await this.client.get("/uac/GET/listDevice/00s/01/com.dreamcatcher.smanos/" + this.username + "/" + this.token + "/" + Date.now(), this.options);

        if(resp.data.status == "200") {
            return resp.data.list.list;
        }

        throw resp.data;
    }

    public async connect(device: DeviceInfo): Promise<DeviceConnection> {
        const client = await MQTT.connectAsync("tls://" + device.cmdIP + ":8883", { clientId: String(Date.now()), username: "and_" + device.deviceID, password: this.token, rejectUnauthorized: false});
        client.subscribe("00s/01/x/300/" + device.deviceID +  "/set/#");

        return new DeviceConnection(client, device, this.alias);
    }

}
